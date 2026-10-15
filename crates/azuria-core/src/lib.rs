use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::{
    fs::{self, File, OpenOptions},
    path::PathBuf,
    time::{SystemTime, UNIX_EPOCH},
};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Loader {
    Vanilla,
    Fabric,
}
impl Loader {
    fn value(&self) -> &'static str {
        match self {
            Self::Vanilla => "vanilla",
            Self::Fabric => "fabric",
        }
    }
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstanceInput {
    pub name: String,
    pub minecraft_version: String,
    pub loader: Loader,
    pub memory_mb: u32,
}
impl InstanceInput {
    pub fn validate(&self) -> Result<(), String> {
        let name = self.name.trim();
        if name.is_empty() || name.chars().count() > 80 || name.chars().any(char::is_control) {
            return Err(
                "Use a name between 1 and 80 characters without control characters.".into(),
            );
        }
        let v = &self.minecraft_version;
        if v.is_empty()
            || v.len() > 40
            || !v.as_bytes()[0].is_ascii_alphanumeric()
            || !v
                .bytes()
                .all(|c| c.is_ascii_alphanumeric() || b"._-".contains(&c))
        {
            return Err("Enter a valid Minecraft version identifier.".into());
        }
        if !(512..=65536).contains(&self.memory_mb) || self.memory_mb & 255 != 0 {
            return Err("Memory must be 512–65536 MB in increments of 256 MB.".into());
        }
        Ok(())
    }
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Instance {
    pub id: String,
    pub name: String,
    pub minecraft_version: String,
    pub loader: Loader,
    pub memory_mb: u32,
    pub favorite: bool,
    pub created_at: i64,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Theme {
    System,
    Dark,
    Light,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    pub theme: Theme,
}

pub struct Store {
    conn: Connection,
    root: PathBuf,
    // Released by the OS even after a crash; never remove the lock file.
    _lock: File,
}
fn error(e: impl std::fmt::Display) -> String {
    e.to_string()
}
fn valid_id(id: &str) -> Result<(), String> {
    let parsed = Uuid::parse_str(id).map_err(|_| "Invalid instance ID.".to_string())?;
    if parsed.to_string() != id {
        return Err("Invalid instance ID.".into());
    }
    Ok(())
}
fn row_instance(row: &rusqlite::Row<'_>) -> rusqlite::Result<Instance> {
    let loader: String = row.get(3)?;
    let loader = match loader.as_str() {
        "vanilla" => Loader::Vanilla,
        "fabric" => Loader::Fabric,
        _ => return Err(rusqlite::Error::InvalidQuery),
    };
    Ok(Instance {
        id: row.get(0)?,
        name: row.get(1)?,
        minecraft_version: row.get(2)?,
        loader,
        memory_mb: row.get(4)?,
        favorite: row.get(5)?,
        created_at: row.get(6)?,
    })
}
impl Store {
    pub fn open(root: PathBuf) -> Result<Self, String> {
        fs::create_dir_all(&root).map_err(error)?;
        let storage_lock = OpenOptions::new()
            .read(true)
            .write(true)
            .create(true)
            .truncate(false)
            .open(root.join("storage.lock"))
            .map_err(error)?;
        storage_lock.try_lock().map_err(|e| {
            format!("Could not lock launcher storage. Close other Azuria windows and retry: {e}")
        })?;
        fs::create_dir_all(root.join("instances")).map_err(error)?;
        fs::create_dir_all(root.join("trash")).map_err(error)?;
        let conn = Connection::open(root.join("azuria.sqlite3")).map_err(error)?;
        conn.busy_timeout(std::time::Duration::from_secs(5))
            .map_err(error)?;
        conn.execute_batch("PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;")
            .map_err(error)?;
        let version: i64 = conn
            .query_row("PRAGMA user_version", [], |r| r.get(0))
            .map_err(error)?;
        if version > 2 {
            return Err(
                "This database was created by a newer Azuria version. Upgrade the launcher.".into(),
            );
        }
        if version == 0 {
            conn.execute_batch("BEGIN IMMEDIATE;
              CREATE TABLE instances (id TEXT PRIMARY KEY, name TEXT NOT NULL, minecraft_version TEXT NOT NULL, loader TEXT NOT NULL CHECK(loader IN ('vanilla','fabric')), memory_mb INTEGER NOT NULL CHECK(memory_mb BETWEEN 512 AND 65536 AND memory_mb % 256 = 0), favorite INTEGER NOT NULL DEFAULT 0 CHECK(favorite IN (0,1)), created_at INTEGER NOT NULL);
              CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
              INSERT INTO settings VALUES ('theme','system');
              PRAGMA user_version=1; COMMIT;").map_err(error)?;
        }
        if version < 2 {
            conn.execute_batch(
                "BEGIN IMMEDIATE;
              CREATE TABLE deletions (
                id TEXT PRIMARY KEY,
                trash_name TEXT NOT NULL UNIQUE,
                instance_json TEXT NOT NULL,
                had_files INTEGER NOT NULL CHECK(had_files IN (0,1)),
                completed INTEGER NOT NULL DEFAULT 0 CHECK(completed IN (0,1))
              );
              PRAGMA user_version=2; COMMIT;",
            )
            .map_err(error)?;
        }
        let mut store = Self {
            conn,
            root,
            _lock: storage_lock,
        };
        store.recover_deletions()?;
        Ok(store)
    }
    pub fn list(&mut self) -> Result<Vec<Instance>, String> {
        self.recover_deletions()?;
        let mut stmt = self.conn.prepare("SELECT id,name,minecraft_version,loader,memory_mb,favorite,created_at FROM instances ORDER BY created_at DESC,id").map_err(error)?;
        let rows = stmt.query_map([], row_instance).map_err(error)?;
        rows.collect::<Result<Vec<_>, _>>().map_err(error)
    }
    fn get(&self, id: &str) -> Result<Instance, String> {
        valid_id(id)?;
        self.conn.query_row("SELECT id,name,minecraft_version,loader,memory_mb,favorite,created_at FROM instances WHERE id=?1", [id], row_instance).map_err(|_| "Instance no longer exists.".into())
    }
    pub fn create(&mut self, input: InstanceInput) -> Result<Instance, String> {
        self.recover_deletions()?;
        input.validate()?;
        let id = Uuid::new_v4().to_string();
        let created_at = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(error)?
            .as_millis() as i64;
        let path = self.root.join("instances").join(&id);
        // IDs, never user-provided names, determine disk paths.
        fs::create_dir(&path).map_err(error)?;
        let result = self.conn.execute("INSERT INTO instances (id,name,minecraft_version,loader,memory_mb,created_at) VALUES (?1,?2,?3,?4,?5,?6)", params![id,input.name.trim(),input.minecraft_version,input.loader.value(),input.memory_mb,created_at]);
        if let Err(e) = result {
            let _ = fs::remove_dir(&path);
            return Err(error(e));
        }
        self.get(&id)
    }
    pub fn update(&mut self, id: &str, input: InstanceInput) -> Result<Instance, String> {
        self.recover_deletions()?;
        input.validate()?;
        self.get(id)?;
        self.conn.execute("UPDATE instances SET name=?1,minecraft_version=?2,loader=?3,memory_mb=?4 WHERE id=?5", params![input.name.trim(),input.minecraft_version,input.loader.value(),input.memory_mb,id]).map_err(error)?;
        self.get(id)
    }
    pub fn favorite(&mut self, id: &str) -> Result<Instance, String> {
        self.recover_deletions()?;
        self.get(id)?;
        self.conn
            .execute("UPDATE instances SET favorite=1-favorite WHERE id=?1", [id])
            .map_err(error)?;
        self.get(id)
    }
    // A committed journal entry survives interruption before the filesystem move.
    fn begin_delete(&self, id: &str) -> Result<String, String> {
        let item = self.get(id)?;
        let trash_name = format!("{}-{}", id, Uuid::new_v4());
        let had_files = self
            .root
            .join("instances")
            .join(id)
            .try_exists()
            .map_err(error)?;
        let metadata = serde_json::to_string(&item).map_err(error)?;
        self.conn.execute(
            "INSERT INTO deletions (id,trash_name,instance_json,had_files) VALUES (?1,?2,?3,?4)",
            params![id, trash_name, metadata, had_files],
        ).map_err(error)?;
        Ok(trash_name)
    }

    fn recover_deletions(&mut self) -> Result<(), String> {
        let pending = {
            let mut stmt = self
                .conn
                .prepare("SELECT id,trash_name,had_files FROM deletions WHERE completed=0")
                .map_err(error)?;
            let rows = stmt
                .query_map([], |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, bool>(2)?,
                    ))
                })
                .map_err(error)?;
            rows.collect::<Result<Vec<_>, _>>().map_err(error)?
        };
        for (id, trash_name, had_files) in pending {
            valid_id(&id)?;
            let suffix = trash_name
                .strip_prefix(&format!("{id}-"))
                .ok_or("Invalid deletion recovery path. Files have not been changed.")?;
            valid_id(suffix)?;
            let source = self.root.join("instances").join(&id);
            let target = self.root.join("trash").join(&trash_name);
            let recover = || -> Result<(), String> {
                match (
                    source.try_exists().map_err(error)?,
                    target.try_exists().map_err(error)?,
                ) {
                    (false, true) => fs::rename(&target, &source).map_err(error)?,
                    (true, true) => {
                        return Err("Both folders exist; neither was overwritten.".into())
                    }
                    (false, false) if had_files => {
                        return Err("Neither expected folder was found.".into())
                    }
                    _ => {}
                }
                self.conn
                    .execute("DELETE FROM deletions WHERE id=?1 AND completed=0", [&id])
                    .map_err(error)?;
                Ok(())
            };
            recover().map_err(|e| format!(
                "Could not restore interrupted removal of {id}: {e} Close Azuria and check {} and {}. Keep both folders and azuria.sqlite3, then retry.",
                source.display(), target.display()
            ))?;
        }
        Ok(())
    }

    pub fn delete(&mut self, id: &str) -> Result<(), String> {
        // Retry recovery before starting any further removal.
        self.recover_deletions()?;
        let trash_name = self.begin_delete(id)?;
        let source = self.root.join("instances").join(id);
        let target = self.root.join("trash").join(&trash_name);
        let result = (|| -> Result<(), String> {
            if source.try_exists().map_err(error)? {
                fs::rename(&source, &target).map_err(error)?;
            }
            // Record completion and remove the instance together. Completed journal
            // entries retain settings and the trash destination for manual recovery.
            let tx = self.conn.transaction().map_err(error)?;
            tx.execute("DELETE FROM instances WHERE id=?1", [id])
                .map_err(error)?;
            tx.execute("UPDATE deletions SET completed=1 WHERE id=?1", [id])
                .map_err(error)?;
            tx.commit().map_err(error)?;
            Ok(())
        })();
        if let Err(e) = result {
            self.recover_deletions()
                .map_err(|recovery| format!("Removal failed: {e}. {recovery}"))?;
            return Err(format!("Removal failed; the instance was restored: {e}"));
        }
        Ok(())
    }
    pub fn settings(&self) -> Result<Settings, String> {
        let value: String = self
            .conn
            .query_row("SELECT value FROM settings WHERE key='theme'", [], |r| {
                r.get(0)
            })
            .map_err(error)?;
        let theme = match value.as_str() {
            "system" => Theme::System,
            "dark" => Theme::Dark,
            "light" => Theme::Light,
            _ => return Err("Invalid stored appearance setting.".into()),
        };
        Ok(Settings { theme })
    }
    pub fn save_settings(&mut self, settings: Settings) -> Result<(), String> {
        let theme = match settings.theme {
            Theme::System => "system",
            Theme::Dark => "dark",
            Theme::Light => "light",
        };
        self.conn
            .execute("UPDATE settings SET value=?1 WHERE key='theme'", [theme])
            .map_err(error)?;
        Ok(())
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    fn input() -> InstanceInput {
        InstanceInput {
            name: "My world".into(),
            minecraft_version: "1.21.1".into(),
            loader: Loader::Fabric,
            memory_mb: 4096,
        }
    }
    #[test]
    fn persistent_lifecycle_and_file_retention() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_path_buf();
        let mut store = Store::open(root.clone()).unwrap();
        let item = store.create(input()).unwrap();
        fs::write(
            root.join("instances").join(&item.id).join("save.txt"),
            "keep me",
        )
        .unwrap();
        store.favorite(&item.id).unwrap();
        drop(store);
        let mut store = Store::open(root.clone()).unwrap();
        assert!(store.list().unwrap()[0].favorite);
        let mut edited = input();
        edited.name = "Renamed".into();
        assert_eq!(store.update(&item.id, edited).unwrap().name, "Renamed");
        store.delete(&item.id).unwrap();
        assert!(store.list().unwrap().is_empty());
        let trash = fs::read_dir(root.join("trash"))
            .unwrap()
            .next()
            .unwrap()
            .unwrap()
            .path();
        assert_eq!(
            fs::read_to_string(trash.join("save.txt")).unwrap(),
            "keep me"
        );
    }
    #[test]
    fn rejects_invalid_input_and_path_traversal() {
        let dir = tempfile::tempdir().unwrap();
        let mut store = Store::open(dir.path().into()).unwrap();
        let mut item = input();
        item.minecraft_version = "../../escape".into();
        assert!(store.create(item).is_err());
        let mut item = input();
        item.memory_mb = 513;
        assert!(store.create(item).is_err());
        assert!(store.delete("../outside").is_err());
        assert!(store.list().unwrap().is_empty());
    }
    #[test]
    fn interrupted_deletions_restore_files_and_settings() {
        for moved in [false, true] {
            let dir = tempfile::tempdir().unwrap();
            let root = dir.path().to_path_buf();
            let mut store = Store::open(root.clone()).unwrap();
            let item = store.create(input()).unwrap();
            let source = root.join("instances").join(&item.id);
            fs::write(source.join("world.txt"), "world").unwrap();
            let trash_name = store.begin_delete(&item.id).unwrap();
            if moved {
                fs::rename(&source, root.join("trash").join(&trash_name)).unwrap();
            }
            drop(store); // Simulate process exit at either interruption point.
            let store = Store::open(root.clone()).unwrap();
            assert_eq!(store.get(&item.id).unwrap().name, item.name);
            assert_eq!(
                fs::read_to_string(source.join("world.txt")).unwrap(),
                "world"
            );
            assert_eq!(
                store
                    .conn
                    .query_row("SELECT count(*) FROM deletions", [], |r| r.get::<_, i64>(0))
                    .unwrap(),
                0
            );
            drop(store);
            assert!(Store::open(root).unwrap().get(&item.id).is_ok());
        }
    }

    #[test]
    fn database_failure_restores_the_moved_folder() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_path_buf();
        let mut store = Store::open(root.clone()).unwrap();
        let item = store.create(input()).unwrap();
        fs::write(
            root.join("instances").join(&item.id).join("save.txt"),
            "safe",
        )
        .unwrap();
        store.conn.execute_batch("CREATE TRIGGER reject_delete BEFORE DELETE ON instances BEGIN SELECT RAISE(FAIL, 'blocked'); END;").unwrap();
        assert!(store.delete(&item.id).unwrap_err().contains("restored"));
        assert!(store.get(&item.id).is_ok());
        assert_eq!(
            fs::read_to_string(root.join("instances").join(&item.id).join("save.txt")).unwrap(),
            "safe"
        );
        assert_eq!(fs::read_dir(root.join("trash")).unwrap().count(), 0);
    }

    #[test]
    fn recovery_conflicts_preserve_both_folders_and_can_be_retried() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_path_buf();
        let mut store = Store::open(root.clone()).unwrap();
        let item = store.create(input()).unwrap();
        let trash_name = store.begin_delete(&item.id).unwrap();
        let trash = root.join("trash").join(&trash_name);
        fs::create_dir(&trash).unwrap();
        fs::write(trash.join("save.txt"), "retained").unwrap();
        drop(store);
        let failure = Store::open(root.clone()).err().unwrap();
        assert!(failure.contains("Both folders exist"));
        assert!(failure.contains(&trash.display().to_string()));
        assert_eq!(
            fs::read_to_string(trash.join("save.txt")).unwrap(),
            "retained"
        );
        // Operator resolves conflict by removing the empty original directory.
        fs::remove_dir(root.join("instances").join(&item.id)).unwrap();
        let store = Store::open(root.clone()).unwrap();
        assert!(store.get(&item.id).is_ok());
        assert_eq!(
            fs::read_to_string(root.join("instances").join(&item.id).join("save.txt")).unwrap(),
            "retained"
        );
    }

    #[test]
    fn filesystem_failure_keeps_the_instance_and_supports_retry() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_path_buf();
        let mut store = Store::open(root.clone()).unwrap();
        let item = store.create(input()).unwrap();
        let original_trash = root.join("trash");
        fs::remove_dir(&original_trash).unwrap();
        fs::write(&original_trash, "not a directory").unwrap();
        assert!(store.delete(&item.id).is_err());
        assert!(store.get(&item.id).is_ok());
        assert!(root.join("instances").join(&item.id).is_dir());
        fs::remove_file(&original_trash).unwrap();
        fs::create_dir(&original_trash).unwrap();
        store.delete(&item.id).unwrap();
        assert!(store.list().unwrap().is_empty());
    }

    #[test]
    fn completed_deletion_is_not_restored_and_keeps_metadata() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_path_buf();
        let mut store = Store::open(root.clone()).unwrap();
        let item = store.create(input()).unwrap();
        store.delete(&item.id).unwrap();
        drop(store);
        let store = Store::open(root).unwrap();
        assert!(store.get(&item.id).is_err());
        let metadata: String = store
            .conn
            .query_row(
                "SELECT instance_json FROM deletions WHERE completed=1",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(
            serde_json::from_str::<Instance>(&metadata).unwrap().name,
            item.name
        );
    }

    #[test]
    fn storage_lock_prevents_overlapping_recovery_and_is_released_on_close() {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::open(dir.path().into()).unwrap();
        assert!(Store::open(dir.path().into())
            .err()
            .unwrap()
            .contains("Close other Azuria"));
        drop(store);
        assert!(Store::open(dir.path().into()).is_ok());
    }

    #[test]
    fn version_one_database_is_migrated_without_changing_instances() {
        let dir = tempfile::tempdir().unwrap();
        let mut store = Store::open(dir.path().into()).unwrap();
        let item = store.create(input()).unwrap();
        store
            .conn
            .execute_batch("DROP TABLE deletions; PRAGMA user_version=1;")
            .unwrap();
        drop(store);
        let store = Store::open(dir.path().into()).unwrap();
        assert_eq!(store.get(&item.id).unwrap().name, item.name);
        assert_eq!(
            store
                .conn
                .query_row("PRAGMA user_version", [], |r| r.get::<_, i64>(0))
                .unwrap(),
            2
        );
    }

    #[test]
    fn settings_survive_reopen_and_future_schema_is_rejected() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_path_buf();
        let mut store = Store::open(root.clone()).unwrap();
        store
            .save_settings(Settings {
                theme: Theme::Light,
            })
            .unwrap();
        drop(store);
        let store = Store::open(root.clone()).unwrap();
        assert!(matches!(store.settings().unwrap().theme, Theme::Light));
        store.conn.execute_batch("PRAGMA user_version=99").unwrap();
        drop(store);
        assert!(Store::open(root).is_err());
    }
}
