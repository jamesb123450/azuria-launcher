use super::*;
use std::path::Path;

// Windows rules apply on every platform so a library remains portable.
pub(crate) fn safe_name(name: &str) -> String {
    let clean: String = name
        .chars()
        .map(|c| {
            if c.is_control() || "<>:\"/\\|?*".contains(c) {
                '_'
            } else {
                c
            }
        })
        .collect();
    let clean = clean.trim().trim_end_matches(['.', ' ']);
    let clean = if clean.is_empty() { "Instance" } else { clean };
    let stem = clean
        .split('.')
        .next()
        .unwrap_or(clean)
        .trim_end()
        .to_uppercase();
    let reserved = ["CON", "PRN", "AUX", "NUL", "CONIN$", "CONOUT$"].contains(&stem.as_str())
        || ["COM", "LPT"].iter().any(|p| {
            stem.strip_prefix(p).is_some_and(|n| {
                ["1", "2", "3", "4", "5", "6", "7", "8", "9", "¹", "²", "³"].contains(&n)
            })
        });
    if reserved {
        format!("_{clean}")
    } else {
        clean.into()
    }
}
pub(crate) fn plain_directory(path: &Path) -> Result<bool, String> {
    match fs::symlink_metadata(path) {
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(e) => Err(error(e)),
        Ok(meta) => {
            #[cfg(windows)]
            {
                use std::os::windows::fs::MetadataExt;
                if meta.file_attributes() & 0x400 != 0 {
                    return Err(format!(
                        "Linked storage paths are not supported: {}",
                        path.display()
                    ));
                }
            }
            if meta.file_type().is_symlink() || !meta.is_dir() {
                return Err(format!("Expected an ordinary folder: {}", path.display()));
            }
            Ok(true)
        }
    }
}
fn valid_folder(folder: &str) -> Result<(), String> {
    if folder.is_empty() || folder == "." || folder == ".." || safe_name(folder) != folder {
        return Err("Invalid instance folder. No files were changed.".into());
    }
    Ok(())
}
impl Store {
    pub(crate) fn folder(&self, id: &str) -> Result<String, String> {
        valid_id(id)?;
        let folder: String = self
            .conn
            .query_row(
                "SELECT folder FROM instance_folders WHERE id=?1",
                [id],
                |r| r.get(0),
            )
            .map_err(error)?;
        valid_folder(&folder)?;
        Ok(folder)
    }
    pub fn instance_dir(&self, id: &str) -> Result<PathBuf, String> {
        plain_directory(&self.root.join("instances"))?;
        let path = self.root.join("instances").join(self.folder(id)?);
        plain_directory(&path)?;
        Ok(path)
    }
    pub(crate) fn available_folder(
        &self,
        name: &str,
        current: Option<&str>,
    ) -> Result<String, String> {
        let base = safe_name(name);
        let mut occupied = Vec::new();
        for entry in fs::read_dir(self.root.join("instances")).map_err(error)? {
            let entry = entry.map_err(error)?;
            occupied.push(entry.file_name().to_string_lossy().to_lowercase());
        }
        let mut stmt = self
            .conn
            .prepare("SELECT folder FROM instance_folders")
            .map_err(error)?;
        for folder in stmt
            .query_map([], |r| r.get::<_, String>(0))
            .map_err(error)?
        {
            occupied.push(folder.map_err(error)?.to_lowercase());
        }
        for n in 1..100_000 {
            let candidate = if n == 1 {
                base.clone()
            } else {
                format!("{base} ({n})")
            };
            // Preserve the existing spelling for case-only renames on Windows.
            if current.is_some_and(|c| c.to_lowercase() == candidate.to_lowercase()) {
                return Ok(current.unwrap().into());
            }
            if !occupied.contains(&candidate.to_lowercase()) {
                return Ok(candidate);
            }
        }
        Err("Too many instance folders with this name.".into())
    }
    pub(crate) fn begin_folder_move(
        &self,
        id: &str,
        source: &str,
        target: &str,
    ) -> Result<(), String> {
        if source == target {
            return Ok(());
        }
        valid_folder(source)?;
        valid_folder(target)?;
        let from = self.instance_dir(id)?;
        let to = self.root.join("instances").join(target);
        if fs::symlink_metadata(&to).is_ok() {
            return Err("The destination instance folder already exists.".into());
        }
        if !plain_directory(&from)? {
            return Err(format!("Instance folder is missing: {}", from.display()));
        }
        self.conn
            .execute(
                "INSERT INTO folder_moves (id,source,target) VALUES (?1,?2,?3)",
                params![id, source, target],
            )
            .map_err(error)?;
        fs::rename(&from, &to).map_err(error)
    }
    pub(crate) fn recover_folder_moves(&mut self) -> Result<(), String> {
        let rows = {
            let mut stmt = self
                .conn
                .prepare("SELECT id,source,target FROM folder_moves")
                .map_err(error)?;
            let rows = stmt
                .query_map([], |r| {
                    Ok((
                        r.get::<_, String>(0)?,
                        r.get::<_, String>(1)?,
                        r.get::<_, String>(2)?,
                    ))
                })
                .map_err(error)?;
            rows.collect::<Result<Vec<_>, _>>().map_err(error)?
        };
        for (id, source, target) in rows {
            valid_id(&id)?;
            valid_folder(&source)?;
            valid_folder(&target)?;
            let from = self.root.join("instances").join(&source);
            let to = self.root.join("instances").join(&target);
            match (plain_directory(&from)?, plain_directory(&to)?) {
                (false,true) => fs::rename(&to,&from).map_err(error)?,
                (true,false) => {},
                _ => return Err(format!("Folder rename needs recovery. Keep both {} and {} and retry; neither was overwritten.",from.display(),to.display())),
            }
            self.conn
                .execute("DELETE FROM folder_moves WHERE id=?1", [id])
                .map_err(error)?;
        }
        Ok(())
    }
    pub(crate) fn use_named_folders(&mut self) -> Result<(), String> {
        for instance in self.list()? {
            let current = self.folder(&instance.id)?;
            let desired = self.available_folder(&instance.name, Some(&current))?;
            if desired == current {
                continue;
            }
            let path = self.instance_dir(&instance.id)?;
            // Old versions could save an instance without files. Still create its folder.
            if !path.exists() {
                fs::create_dir(&path).map_err(error)?;
            }
            self.begin_folder_move(&instance.id, &current, &desired)?;
            let tx = self.conn.transaction().map_err(error)?;
            tx.execute(
                "UPDATE instance_folders SET folder=?1 WHERE id=?2",
                params![desired, instance.id],
            )
            .map_err(error)?;
            tx.execute("DELETE FROM folder_moves WHERE id=?1", [&instance.id])
                .map_err(error)?;
            tx.commit().map_err(error)?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn input(name: &str) -> InstanceInput {
        InstanceInput {
            name: name.into(),
            minecraft_version: "1.21.1".into(),
            loader: Loader::Vanilla,
            memory_mb: 4096,
            icon: None,
            loader_version: None,
        }
    }
    #[test]
    fn windows_names_duplicates_and_traversal_remain_inside_instances() {
        let dir = tempfile::tempdir().unwrap();
        let mut store = Store::open(dir.path().into()).unwrap();
        for (name, expected) in [
            ("My Survival World", "My Survival World"),
            ("my survival world", "my survival world (2)"),
            ("CON.txt", "_CON.txt"),
            ("../escape:*?", ".._escape___"),
            ("...", "Instance"),
            ("LPT¹", "_LPT¹"),
            ("A. ", "A"),
            ("Café 世界", "Café 世界"),
        ] {
            let item = store.create(input(name)).unwrap();
            let path = store.instance_dir(&item.id).unwrap();
            assert_eq!(path.file_name().unwrap().to_str().unwrap(), expected);
            assert!(path.is_dir());
            assert_eq!(path.parent().unwrap(), dir.path().join("instances"));
        }
        fs::create_dir(dir.path().join("instances/External")).unwrap();
        let item = store.create(input("External")).unwrap();
        assert_eq!(store.folder(&item.id).unwrap(), "External (2)");
    }
    #[test]
    fn rename_keeps_files_and_rolls_back_on_database_failure_or_interruption() {
        let dir = tempfile::tempdir().unwrap();
        let mut store = Store::open(dir.path().into()).unwrap();
        let item = store.create(input("Old name")).unwrap();
        fs::write(store.instance_dir(&item.id).unwrap().join("world"), "saved").unwrap();
        store.update(&item.id, input("New name")).unwrap();
        assert_eq!(
            fs::read_to_string(dir.path().join("instances/New name/world")).unwrap(),
            "saved"
        );
        assert!(!dir.path().join("instances/Old name").exists());
        store.conn.execute_batch("CREATE TRIGGER block_update BEFORE UPDATE ON instances BEGIN SELECT RAISE(FAIL, 'blocked'); END;").unwrap();
        assert!(store.update(&item.id, input("Rejected")).is_err());
        assert!(dir.path().join("instances/New name/world").is_file());
        assert!(!dir.path().join("instances/Rejected").exists());
        store
            .begin_folder_move(&item.id, "New name", "Interrupted")
            .unwrap();
        drop(store);
        let store = Store::open(dir.path().into()).unwrap();
        assert_eq!(store.folder(&item.id).unwrap(), "New name");
        assert!(dir.path().join("instances/New name/world").is_file());
    }
    #[test]
    fn conflicting_rename_never_overwrites_external_files() {
        let dir = tempfile::tempdir().unwrap();
        let mut store = Store::open(dir.path().into()).unwrap();
        let item = store.create(input("Original")).unwrap();
        fs::create_dir(dir.path().join("instances/Other")).unwrap();
        fs::write(dir.path().join("instances/Other/world"), "external").unwrap();
        store.update(&item.id, input("Other")).unwrap();
        assert_eq!(store.folder(&item.id).unwrap(), "Other (2)");
        assert_eq!(
            fs::read_to_string(dir.path().join("instances/Other/world")).unwrap(),
            "external"
        );
    }
    #[cfg(unix)]
    #[test]
    fn linked_instance_cannot_escape_storage() {
        let dir = tempfile::tempdir().unwrap();
        let external = tempfile::tempdir().unwrap();
        let mut store = Store::open(dir.path().into()).unwrap();
        let item = store.create(input("Linked")).unwrap();
        fs::remove_dir(dir.path().join("instances/Linked")).unwrap();
        std::os::unix::fs::symlink(external.path(), dir.path().join("instances/Linked")).unwrap();
        assert!(store.delete(&item.id).is_err());
        assert!(store.update(&item.id, input("Moved")).is_err());
        assert!(external.path().is_dir());
    }
}
