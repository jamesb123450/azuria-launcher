use crate::{error, folders::plain_directory, Store};
use std::{
    fs,
    io::{Read, Write},
    path::PathBuf,
};
impl Store {
    pub fn notes_directory(&self, id: &str) -> Result<PathBuf, String> {
        let path = self.instance_dir(id)?.join("notes");
        if !path.exists() {
            fs::create_dir(&path).map_err(error)?;
        }
        plain_directory(&path)?;
        Ok(path)
    }
    pub fn instance_notes(&self, id: &str) -> Result<String, String> {
        let path = self.notes_directory(id)?.join("notes.md");
        if !path.exists() {
            return Ok(String::new());
        }
        check_note(&path)?;
        let mut text = String::new();
        fs::File::open(path)
            .map_err(error)?
            .take(65537)
            .read_to_string(&mut text)
            .map_err(error)?;
        if text.len() > 65536 {
            return Err("Keep instance notes within 64 KB.".into());
        }
        Ok(text)
    }
    pub fn save_instance_notes(&self, id: &str, text: &str) -> Result<(), String> {
        if text.len() > 65536 {
            return Err("Keep instance notes within 64 KB.".into());
        }
        let directory = self.notes_directory(id)?;
        let destination = directory.join("notes.md");
        if destination.exists() {
            check_note(&destination)?;
        }
        let temporary = directory.join(format!("{}.tmp", uuid::Uuid::new_v4()));
        let result = (|| {
            let mut file = fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&temporary)
                .map_err(error)?;
            file.write_all(text.as_bytes()).map_err(error)?;
            file.sync_all().map_err(error)?;
            drop(file);
            fs::rename(&temporary, &destination).map_err(error)
        })();
        if result.is_err() {
            let _ = fs::remove_file(&temporary);
        }
        result
    }
}
fn check_note(path: &std::path::Path) -> Result<(), String> {
    let meta = fs::symlink_metadata(path).map_err(error)?;
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        if meta.file_attributes() & 0x400 != 0 {
            return Err("Linked notes are not supported.".into());
        }
    }
    if !meta.is_file() || meta.file_type().is_symlink() || meta.len() > 65536 {
        return Err("Notes must be a regular Markdown file within 64 KB.".into());
    }
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    use crate::{InstanceInput, Loader};
    #[test]
    fn notes_persist_and_stay_with_an_instance_after_rename() {
        let root = tempfile::tempdir().unwrap();
        let mut store = Store::open(root.path().into()).unwrap();
        let input = InstanceInput {
            name: "Notes test".into(),
            minecraft_version: "1.21.1".into(),
            loader: Loader::Vanilla,
            memory_mb: 4096,
            icon: None,
            loader_version: None,
        };
        let instance = store.create(input.clone()).unwrap();
        assert_eq!(store.instance_notes(&instance.id).unwrap(), "");
        store
            .save_instance_notes(&instance.id, "# My world\nKeep backups.")
            .unwrap();
        let mut renamed = input;
        renamed.name = "Renamed".into();
        store.update(&instance.id, renamed).unwrap();
        assert!(store
            .instance_notes(&instance.id)
            .unwrap()
            .contains("Keep backups"));
        assert!(store
            .save_instance_notes(&instance.id, &"x".repeat(65537))
            .is_err());
        assert!(store.instance_notes("../outside").is_err());
    }
}
