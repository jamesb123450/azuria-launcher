//! Copy-verify-publish migration. The source is retained as a recovery backup.
use super::*;
use crate::folders::plain_directory;
use std::{
    io::{Read, Write},
    path::Path,
};

const PENDING: &str = "migration-pending.json";
const STAGE_OWNER: &str = "azuria-migration-owner.json";
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MigrationStatus {
    pub required: bool,
    pub instances_path: String,
    pub migrated_instances: usize,
    pub backup_path: Option<String>,
}
fn lock(path: &Path) -> Result<File, String> {
    let file = OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .truncate(false)
        .open(path)
        .map_err(error)?;
    file.try_lock()
        .map_err(|_| "Close other Azuria windows and retry the migration.".to_string())?;
    Ok(file)
}
pub(crate) fn verified_copy(source: &Path, target: &Path) -> Result<(), String> {
    let metadata = fs::symlink_metadata(source).map_err(error)?;
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        if metadata.file_attributes() & 0x400 != 0 {
            return Err(format!(
                "Migration cannot follow linked files: {}",
                source.display()
            ));
        }
    }
    if metadata.file_type().is_symlink() {
        return Err(format!(
            "Migration cannot follow linked files: {}",
            source.display()
        ));
    }
    if metadata.is_dir() {
        fs::create_dir(target).map_err(error)?;
        for item in fs::read_dir(source).map_err(error)? {
            let item = item.map_err(error)?;
            verified_copy(&item.path(), &target.join(item.file_name()))?;
        }
    } else if metadata.is_file() {
        let mut input = File::open(source).map_err(error)?;
        let mut output = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(target)
            .map_err(error)?;
        std::io::copy(&mut input, &mut output).map_err(error)?;
        output.sync_all().map_err(error)?;
        drop(output);
        let mut input = File::open(source).map_err(error)?;
        let mut output = File::open(target).map_err(error)?;
        if input.metadata().map_err(error)?.len() != output.metadata().map_err(error)?.len() {
            return Err(
                "Migration copy verification failed; the original data is unchanged.".into(),
            );
        }
        let (mut a, mut b) = ([0u8; 65536], [0u8; 65536]);
        loop {
            let n = input.read(&mut a).map_err(error)?;
            output.read_exact(&mut b[..n]).map_err(error)?;
            if a[..n] != b[..n] {
                return Err(
                    "Migration copy verification failed; the original data is unchanged.".into(),
                );
            }
            if n == 0 {
                break;
            }
        }
    } else {
        return Err(format!("Unsupported storage file: {}", source.display()));
    }
    Ok(())
}
pub fn status(root: &Path) -> Result<MigrationStatus, String> {
    if root.join(PENDING).exists() {
        let mut status: MigrationStatus =
            serde_json::from_slice(&fs::read(root.join(PENDING)).map_err(error)?).map_err(error)?;
        status.required = true;
        // Paths returned to the UI are informational; never used as IPC arguments.
        status.instances_path = root.join("instances").display().to_string();
        return Ok(status);
    }
    Ok(MigrationStatus {
        required: false,
        instances_path: root.join("instances").display().to_string(),
        migrated_instances: 0,
        backup_path: None,
    })
}
pub fn acknowledge(root: &Path) -> Result<(), String> {
    if root.join(PENDING).exists() {
        fs::remove_file(root.join(PENDING)).map_err(error)?;
    }
    Ok(())
}

pub fn prepare(legacy: &Path, target: &Path) -> Result<(Store, MigrationStatus), String> {
    if legacy == target {
        return Err("Storage source and destination must differ.".into());
    }
    let parent = target.parent().ok_or("Invalid storage destination.")?;
    fs::create_dir_all(parent).map_err(error)?;
    let _migration_lock = lock(&parent.join("AzuriaLauncher.migration.lock"))?;
    if target.join("azuria.sqlite3").exists() {
        plain_directory(target)?;
        let store = Store::open(target.into())?;
        return Ok((store, status(target)?));
    }
    if !legacy.join("azuria.sqlite3").exists() {
        if target.exists() && fs::read_dir(target).map_err(error)?.next().is_some() {
            return Err("The new Azuria folder already contains files. Keep them and choose Retry after resolving the conflict.".into());
        }
        let store = Store::open(target.into())?;
        return Ok((store, status(target)?));
    }
    plain_directory(legacy)?;
    if target.exists() {
        return Err(format!("Migration stopped because {} already exists. Nothing was overwritten. Keep both locations and retry after resolving the conflict.",target.display()));
    }
    // Lock the legacy library without upgrading its schema or changing any instance files.
    let _source_lock = lock(&legacy.join("storage.lock"))?;
    let db_metadata = fs::symlink_metadata(legacy.join("azuria.sqlite3")).map_err(error)?;
    if !db_metadata.is_file() || db_metadata.file_type().is_symlink() {
        return Err("The legacy database must be an ordinary file.".into());
    }
    let source = Connection::open(legacy.join("azuria.sqlite3")).map_err(error)?;
    source
        .busy_timeout(std::time::Duration::from_secs(5))
        .map_err(error)?;
    let stage = parent.join(".AzuriaLauncher-migration");
    let owner = serde_json::to_vec(&(legacy, target)).map_err(error)?;
    if stage.exists() {
        plain_directory(&stage)?;
        if fs::read(stage.join(STAGE_OWNER)).map_err(error)? != owner {
            return Err(
                "An unrelated migration staging folder exists. Nothing was overwritten.".into(),
            );
        }
        // Only discard our own incomplete copy, never the original library.
        fs::remove_dir_all(&stage).map_err(error)?;
    }
    fs::create_dir(&stage).map_err(error)?;
    let mut marker = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(stage.join(STAGE_OWNER))
        .map_err(error)?;
    marker.write_all(&owner).map_err(error)?;
    marker.sync_all().map_err(error)?;
    drop(marker);
    // VACUUM INTO creates a consistent SQLite snapshot, including committed WAL data.
    source
        .execute(
            "VACUUM INTO ?1",
            [stage
                .join("azuria.sqlite3")
                .to_str()
                .ok_or("Invalid database path.")?],
        )
        .map_err(error)?;
    // Only app-owned library data moves. WebView2 can keep live browser caches in
    // the legacy local-data directory; copying those would hit locked files.
    for name in ["instances", "trash"] {
        let path = legacy.join(name);
        if path.try_exists().map_err(error)? {
            verified_copy(&path, &stage.join(name))?;
        }
    }
    let mut migrated = Store::open(stage.clone())?;
    let integrity: String = migrated
        .conn
        .query_row("PRAGMA integrity_check", [], |r| r.get(0))
        .map_err(error)?;
    if integrity != "ok" {
        return Err(
            "The copied database failed its integrity check. Original data was retained.".into(),
        );
    }
    migrated.use_named_folders()?;
    let count = migrated.list()?.len();
    // Pending acknowledgement is published together with the migrated data.
    let report = MigrationStatus {
        required: true,
        instances_path: target.join("instances").display().to_string(),
        migrated_instances: count,
        backup_path: Some(legacy.display().to_string()),
    };
    let mut pending = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(stage.join(PENDING))
        .map_err(error)?;
    pending
        .write_all(&serde_json::to_vec(&report).map_err(error)?)
        .map_err(error)?;
    pending.sync_all().map_err(error)?;
    drop(pending);
    migrated
        .conn
        .execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")
        .map_err(error)?;
    drop(migrated);
    // Same-parent rename publishes the complete new library; incomplete copies stay hidden.
    fs::rename(&stage, target).map_err(error)?;
    Ok((Store::open(target.into())?, report))
}

#[cfg(test)]
mod tests {
    use super::*;
    fn legacy(root: &Path) -> String {
        let mut store = Store::open(root.into()).unwrap();
        let item = store
            .create(InstanceInput {
                name: "Survival World".into(),
                minecraft_version: "1.21.1".into(),
                loader: Loader::Fabric,
                memory_mb: 8192,
                icon: None,
                loader_version: Some("0.16.10".into()),
            })
            .unwrap();
        store.favorite(&item.id).unwrap();
        store
            .save_settings(Settings {
                theme: Theme::Light,
            })
            .unwrap();
        let folder = store.instance_dir(&item.id).unwrap();
        fs::write(folder.join("world.txt"), "my world").unwrap();
        fs::rename(folder, root.join("instances").join(&item.id)).unwrap();
        store
            .conn
            .execute_batch(
                "DROP TABLE folder_moves; DROP TABLE instance_folders; PRAGMA user_version=3;",
            )
            .unwrap();
        item.id
    }
    #[test]
    fn legacy_library_moves_with_names_settings_trash_and_persistent_acknowledgement() {
        let temp = tempfile::tempdir().unwrap();
        let old = temp.path().join("legacy");
        let new = temp.path().join("AzuriaLauncher");
        let id = legacy(&old);
        fs::create_dir(old.join("trash/retained")).unwrap();
        fs::write(old.join("trash/retained/world"), "trash").unwrap();
        let (mut store, report) = prepare(&old, &new).unwrap();
        assert!(report.required);
        assert_eq!(report.migrated_instances, 1);
        let saved = store.list().unwrap().remove(0);
        assert_eq!(saved.id, id);
        assert!(saved.favorite);
        assert_eq!(saved.memory_mb, 8192);
        assert_eq!(saved.loader_version.as_deref(), Some("0.16.10"));
        assert!(matches!(store.settings().unwrap().theme, Theme::Light));
        assert_eq!(
            fs::read_to_string(new.join("instances/Survival World/world.txt")).unwrap(),
            "my world"
        );
        assert_eq!(
            fs::read_to_string(new.join("trash/retained/world")).unwrap(),
            "trash"
        );
        assert!(old.join("instances").join(&id).join("world.txt").exists());
        let source = Connection::open(old.join("azuria.sqlite3")).unwrap();
        let version: i64 = source
            .query_row("PRAGMA user_version", [], |r| r.get(0))
            .unwrap();
        assert_eq!(version, 3);
        drop(store);
        let (store, report) = prepare(&old, &new).unwrap();
        assert!(report.required);
        drop(store);
        acknowledge(&new).unwrap();
        let (mut store, report) = prepare(&old, &new).unwrap();
        assert!(!report.required);
        assert_eq!(store.list().unwrap().len(), 1);
    }
    #[test]
    fn interrupted_removal_recovers_in_copy_without_changing_original() {
        let temp = tempfile::tempdir().unwrap();
        let old = temp.path().join("legacy");
        let new = temp.path().join("AzuriaLauncher");
        let mut source = Store::open(old.clone()).unwrap();
        let item = source
            .create(InstanceInput {
                name: "Pending".into(),
                minecraft_version: "1.21.1".into(),
                loader: Loader::Vanilla,
                memory_mb: 4096,
                icon: None,
                loader_version: None,
            })
            .unwrap();
        let folder = source.instance_dir(&item.id).unwrap();
        fs::write(folder.join("save"), "safe").unwrap();
        let trash = source.begin_delete(&item.id).unwrap();
        fs::rename(folder, old.join("trash").join(&trash)).unwrap();
        drop(source);
        let (mut migrated, _) = prepare(&old, &new).unwrap();
        assert_eq!(migrated.list().unwrap().len(), 1);
        assert_eq!(
            fs::read_to_string(new.join("instances/Pending/save")).unwrap(),
            "safe"
        );
        assert!(old.join("trash").join(&trash).join("save").exists());
    }
    #[test]
    fn fresh_install_skips_notice_and_creates_instances_directory() {
        let temp = tempfile::tempdir().unwrap();
        let target = temp.path().join("AzuriaLauncher");
        let (_store, report) = prepare(&temp.path().join("absent"), &target).unwrap();
        assert!(!report.required);
        assert!(target.join("instances").is_dir());
    }
    #[test]
    fn locks_and_destination_conflicts_stop_migration_without_overwriting() {
        let temp = tempfile::tempdir().unwrap();
        let old = temp.path().join("legacy");
        let new = temp.path().join("AzuriaLauncher");
        legacy(&old);
        let held = Store::open(old.clone()).unwrap();
        assert!(prepare(&old, &new).is_err());
        drop(held);
        assert!(!new.exists());
        fs::create_dir(&new).unwrap();
        fs::write(new.join("keep"), "external").unwrap();
        assert!(prepare(&old, &new).is_err());
        assert_eq!(fs::read_to_string(new.join("keep")).unwrap(), "external");
    }
    #[test]
    fn owned_incomplete_staging_is_retryable_but_unknown_staging_is_preserved() {
        let temp = tempfile::tempdir().unwrap();
        let old = temp.path().join("legacy");
        let new = temp.path().join("AzuriaLauncher");
        legacy(&old);
        let stage = temp.path().join(".AzuriaLauncher-migration");
        fs::create_dir(&stage).unwrap();
        fs::write(stage.join("keep"), "unrelated").unwrap();
        assert!(prepare(&old, &new).is_err());
        assert!(stage.join("keep").exists());
        fs::write(
            stage.join(STAGE_OWNER),
            serde_json::to_vec(&(&old, &new)).unwrap(),
        )
        .unwrap();
        let (_store, report) = prepare(&old, &new).unwrap();
        assert!(report.required);
        assert!(new.join("instances/Survival World/world.txt").exists());
        assert!(old.exists());
    }
    #[cfg(unix)]
    #[test]
    fn linked_files_abort_and_retry_after_resolution_keeps_original_data() {
        let temp = tempfile::tempdir().unwrap();
        let old = temp.path().join("legacy");
        let new = temp.path().join("AzuriaLauncher");
        let id = legacy(&old);
        std::os::unix::fs::symlink(temp.path(), old.join("instances/linked")).unwrap();
        assert!(prepare(&old, &new).is_err());
        assert!(!new.exists());
        assert!(old.join("instances").join(id).join("world.txt").exists());
        fs::remove_file(old.join("instances/linked")).unwrap();
        let (_store, report) = prepare(&old, &new).unwrap();
        assert!(report.required);
    }
}

#[cfg(test)]
mod wal_test {
    use super::*;
    #[test]
    fn committed_wal_data_is_included_without_copying_live_webview_caches() {
        let dir = tempfile::tempdir().unwrap();
        let old = dir.path().join("old");
        let new = dir.path().join("AzuriaLauncher");
        let store = Store::open(old.clone()).unwrap();
        drop(store);
        let writer = Connection::open(old.join("azuria.sqlite3")).unwrap();
        writer.execute_batch("PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0; UPDATE settings SET value='light' WHERE key='theme';").unwrap();
        assert!(old.join("azuria.sqlite3-wal").exists());
        // Browser data is outside the launcher library and can be locked while the UI is open.
        fs::create_dir(old.join("EBWebView")).unwrap();
        fs::write(old.join("EBWebView/keep"), "browser cache").unwrap();
        let (store, report) = prepare(&old, &new).unwrap();
        assert!(report.required);
        assert_eq!(report.migrated_instances, 0);
        assert!(matches!(store.settings().unwrap().theme, Theme::Light));
        assert!(!new.join("EBWebView").exists());
        assert!(old.join("EBWebView/keep").exists());
    }
}
