use super::*;
use crate::folders::plain_directory;
use std::{
    io::{Read, Seek, SeekFrom},
    path::{Component, Path},
};
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum Section {
    Mods,
    ResourcePacks,
    ShaderPacks,
    Worlds,
    Logs,
    Root,
}
impl Section {
    pub fn directory(self) -> &'static str {
        match self {
            Self::Mods => "mods",
            Self::ResourcePacks => "resourcepacks",
            Self::ShaderPacks => "shaderpacks",
            Self::Worlds => "saves",
            Self::Logs => "logs",
            Self::Root => "",
        }
    }
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub name: String,
    pub enabled: bool,
    pub size: u64,
    pub directory: bool,
}
fn filename(name: &str) -> Result<(), String> {
    let mut components = Path::new(name).components();
    if name.is_empty()
        || name.contains(['/', '\\', ':'])
        || !matches!(components.next(), Some(Component::Normal(_)))
        || components.next().is_some()
    {
        return Err("Invalid instance filename.".into());
    }
    Ok(())
}
fn regular(path: &Path) -> Result<fs::Metadata, String> {
    let m = fs::symlink_metadata(path).map_err(error)?;
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        if m.file_attributes() & 0x400 != 0 {
            return Err("Linked instance files are not supported.".into());
        }
    }
    if m.file_type().is_symlink() || (!m.is_dir() && !m.is_file()) {
        return Err("Linked or special instance files are not supported.".into());
    }
    Ok(m)
}
fn content(section: Section, name: &str) -> bool {
    let name = name
        .strip_suffix(".disabled")
        .unwrap_or(name)
        .to_lowercase();
    match section {
        Section::Mods => name.ends_with(".jar"),
        Section::ResourcePacks | Section::ShaderPacks => name.ends_with(".zip"),
        _ => false,
    }
}
impl Store {
    pub fn section_dir(&self, id: &str, section: Section) -> Result<PathBuf, String> {
        let root = self.instance_dir(id)?;
        let path = root.join(section.directory());
        plain_directory(&path)?;
        Ok(path)
    }
    pub fn openable_directory(
        &self,
        id: &str,
        section: Section,
        name: Option<&str>,
    ) -> Result<PathBuf, String> {
        let root = self.section_dir(id, section)?;
        if let Some(name) = name {
            if section != Section::Worlds {
                return Err("Only world directories can be selected.".into());
            }
            filename(name)?;
            let path = root.join(name);
            if !plain_directory(&path)? {
                return Err("World folder no longer exists.".into());
            }
            return Ok(path);
        }
        if !root.exists() {
            fs::create_dir(&root).map_err(error)?;
        }
        Ok(root)
    }
    pub fn entries(&self, id: &str, section: Section) -> Result<Vec<Entry>, String> {
        if section == Section::Root {
            return Err("Choose a content section.".into());
        }
        let path = self.section_dir(id, section)?;
        if !path.exists() {
            return Ok(vec![]);
        }
        let mut entries = Vec::new();
        for (count, entry) in fs::read_dir(path).map_err(error)?.enumerate() {
            if count >= 5000 {
                return Err(
                    "This folder contains too many entries. Open it in File Explorer.".into(),
                );
            }
            let entry = entry.map_err(error)?;
            let name = entry.file_name().to_string_lossy().into_owned();
            let meta = regular(&entry.path())?;
            let relevant = match section {
                Section::Worlds => meta.is_dir(),
                Section::Logs => meta.is_file() && name.ends_with(".log"),
                _ => meta.is_file() && content(section, &name),
            };
            if relevant {
                entries.push(Entry {
                    name: name.clone(),
                    enabled: !name.ends_with(".disabled"),
                    size: meta.len(),
                    directory: meta.is_dir(),
                });
            }
            if entries.len() > 5000 {
                return Err(
                    "This folder contains too many entries. Open it in File Explorer.".into(),
                );
            }
        }
        entries.sort_by_key(|e| e.name.to_lowercase());
        Ok(entries)
    }
    pub fn toggle_content(&self, id: &str, section: Section, name: &str) -> Result<(), String> {
        filename(name)?;
        if !content(section, name) {
            return Err("Choose a mod or pack file.".into());
        }
        let root = self.section_dir(id, section)?;
        let from = root.join(name);
        if !regular(&from)?.is_file() {
            return Err("Choose a file.".into());
        }
        let to = root.join(
            name.strip_suffix(".disabled")
                .map(String::from)
                .unwrap_or_else(|| format!("{name}.disabled")),
        );
        if to.try_exists().map_err(error)? {
            return Err("A file with the target name already exists.".into());
        }
        fs::rename(from, to).map_err(error)
    }
    pub fn trash_content(&self, id: &str, section: Section, name: &str) -> Result<(), String> {
        filename(name)?;
        if !content(section, name) {
            return Err("Choose a mod or pack file.".into());
        }
        let file = self.section_dir(id, section)?.join(name);
        if !regular(&file)?.is_file() {
            return Err("Choose a file.".into());
        }
        plain_directory(&self.root.join("trash"))?;
        let target = self
            .root
            .join("trash")
            .join(format!("content-{}", Uuid::new_v4()));
        fs::create_dir(&target).map_err(error)?;
        fs::rename(file, target.join(name)).map_err(error)
    }
    pub fn import_content(&self, id: &str, section: Section, source: &Path) -> Result<(), String> {
        let name = source
            .file_name()
            .and_then(|n| n.to_str())
            .ok_or("Invalid filename.")?;
        filename(name)?;
        if name.ends_with(".disabled") || !content(section, name) {
            return Err("Choose a .jar mod or .zip pack matching this section.".into());
        }
        if !regular(source)?.is_file() {
            return Err("Choose a regular file.".into());
        }
        let root = self.openable_directory(id, section, None)?;
        let target = root.join(name);
        if target.try_exists().map_err(error)?
            || root
                .join(format!("{name}.disabled"))
                .try_exists()
                .map_err(error)?
        {
            return Err("This file is already in the instance. Nothing was overwritten.".into());
        }
        // Verify an owned temporary file, then publish without replacing existing files.
        let staging = root.join(format!(".azuria-import-{}", Uuid::new_v4()));
        let result = (|| {
            crate::migration::verified_copy(source, &staging)?;
            fs::hard_link(&staging, &target).map_err(error)
        })();
        let _ = fs::remove_file(staging);
        result
    }

    pub fn log_tail(&self, id: &str, name: &str) -> Result<String, String> {
        filename(name)?;
        if !name.ends_with(".log") {
            return Err("Choose a .log file.".into());
        }
        let path = self.section_dir(id, Section::Logs)?.join(name);
        if !regular(&path)?.is_file() {
            return Err("Choose a log file.".into());
        }
        let mut file = File::open(path).map_err(error)?;
        let len = file.metadata().map_err(error)?.len();
        file.seek(SeekFrom::Start(len.saturating_sub(65536)))
            .map_err(error)?;
        let mut bytes = vec![];
        file.take(65536).read_to_end(&mut bytes).map_err(error)?;
        // Do not expose a partial first line whose credential prefix was before the read boundary.
        let text = String::from_utf8_lossy(&bytes);
        let text = if len > 65536 {
            text.split_once('\n').map(|(_, tail)| tail).unwrap_or("")
        } else {
            &text
        };
        let mut output = text
            .lines()
            .map(|line| {
                if [
                    "access_token",
                    "refresh_token",
                    "authorization:",
                    "--accesstoken",
                ]
                .iter()
                .any(|key| line.to_lowercase().contains(key))
                {
                    "[Account credential line hidden]"
                } else {
                    line
                }
            })
            .collect::<Vec<_>>()
            .join("\n");
        if output.len() > 65536 {
            let mut boundary = output.len() - 65536;
            while !output.is_char_boundary(boundary) {
                boundary += 1;
            }
            output.drain(..boundary);
        }
        Ok(output)
    }
    pub fn duplicate(&mut self, id: &str, include_files: bool) -> Result<Instance, String> {
        let original = self.get(id)?;
        let overrides = self.launch_overrides(id)?;
        let copy = self.create(InstanceInput {
            name: format!(
                "{} copy",
                original.name.chars().take(74).collect::<String>()
            ),
            minecraft_version: original.minecraft_version,
            loader: original.loader,
            memory_mb: original.memory_mb,
            icon: original.icon,
            loader_version: original.loader_version,
        })?;
        let result = (|| -> Result<(), String> {
            if include_files {
                let source = self.instance_dir(id)?;
                let target = self.instance_dir(&copy.id)?;
                for entry in fs::read_dir(source).map_err(error)? {
                    let entry = entry.map_err(error)?;
                    crate::migration::verified_copy(
                        &entry.path(),
                        &target.join(entry.file_name()),
                    )?;
                }
            }
            self.save_launch_overrides(&copy.id, overrides)
        })();
        if let Err(cause) = result {
            self.delete(&copy.id).map_err(|e| {
                format!("Copy failed: {cause}. Could not remove the incomplete copy: {e}")
            })?;
            return Err(format!(
                "Copy failed; the original instance is unchanged: {cause}"
            ));
        }
        Ok(copy)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn setup(root: &Path) -> (Store, Instance) {
        let mut s = Store::open(root.into()).unwrap();
        let i = s
            .create(InstanceInput {
                name: "Aurora".into(),
                minecraft_version: "1.21.1".into(),
                loader: Loader::Fabric,
                memory_mb: 4096,
                icon: None,
                loader_version: Some("0.16.10".into()),
            })
            .unwrap();
        (s, i)
    }
    #[test]
    fn import_toggle_and_trash_preserve_original_and_reject_collisions() {
        let dir = tempfile::tempdir().unwrap();
        let source = tempfile::tempdir().unwrap();
        let (s, i) = setup(dir.path());
        let file = source.path().join("mod.jar");
        fs::write(&file, b"original bytes").unwrap();
        s.import_content(&i.id, Section::Mods, &file).unwrap();
        assert!(s.import_content(&i.id, Section::Mods, &file).is_err());
        s.toggle_content(&i.id, Section::Mods, "mod.jar").unwrap();
        assert!(!s.entries(&i.id, Section::Mods).unwrap()[0].enabled);
        assert!(s.import_content(&i.id, Section::Mods, &file).is_err());
        assert!(s
            .toggle_content(&i.id, Section::Mods, "../mod.jar")
            .is_err());
        let mods = s.section_dir(&i.id, Section::Mods).unwrap();
        fs::write(mods.join("mod.jar"), b"other").unwrap();
        assert!(s
            .toggle_content(&i.id, Section::Mods, "mod.jar.disabled")
            .is_err());
        assert_eq!(fs::read(mods.join("mod.jar")).unwrap(), b"other");
        s.trash_content(&i.id, Section::Mods, "mod.jar.disabled")
            .unwrap();
        let trash = fs::read_dir(dir.path().join("trash"))
            .unwrap()
            .next()
            .unwrap()
            .unwrap()
            .path();
        assert_eq!(
            fs::read(trash.join("mod.jar.disabled")).unwrap(),
            b"original bytes"
        );
        assert_eq!(fs::read(file).unwrap(), b"original bytes");
    }
    #[test]
    fn duplicate_copies_preferences_and_files_independently() {
        let dir = tempfile::tempdir().unwrap();
        let (mut s, i) = setup(dir.path());
        let worlds = s.openable_directory(&i.id, Section::Worlds, None).unwrap();
        fs::create_dir(worlds.join("My world")).unwrap();
        fs::write(worlds.join("My world/level.dat"), b"save").unwrap();
        s.save_launch_overrides(
            &i.id,
            crate::preferences::LaunchOverrides {
                memory_mb: Some(8192),
                ..Default::default()
            },
        )
        .unwrap();
        let empty = s.duplicate(&i.id, false).unwrap();
        assert!(s.entries(&empty.id, Section::Worlds).unwrap().is_empty());
        let full = s.duplicate(&i.id, true).unwrap();
        let copy = s
            .openable_directory(&full.id, Section::Worlds, Some("My world"))
            .unwrap();
        assert_eq!(fs::read(copy.join("level.dat")).unwrap(), b"save");
        assert_eq!(s.launch_overrides(&full.id).unwrap().memory_mb, Some(8192));
        fs::write(copy.join("level.dat"), b"changed").unwrap();
        assert_eq!(
            fs::read(worlds.join("My world/level.dat")).unwrap(),
            b"save"
        );
        assert!(s
            .openable_directory(&i.id, Section::Worlds, Some("../escape"))
            .is_err());
    }
    #[test]
    fn log_tail_is_bounded_and_hides_common_credentials() {
        let dir = tempfile::tempdir().unwrap();
        let (s, i) = setup(dir.path());
        let logs = s.openable_directory(&i.id, Section::Logs, None).unwrap();
        fs::write(
            logs.join("latest.log"),
            format!(
                "{}\nAuthorization: Bearer secret\n--accessToken hidden\nnormal last line",
                "x".repeat(70000)
            ),
        )
        .unwrap();
        let tail = s.log_tail(&i.id, "latest.log").unwrap();
        assert!(tail.len() <= 65536);
        assert!(!tail.contains("secret"));
        assert!(!tail.contains("hidden\n"));
        assert!(tail.ends_with("normal last line"));
        assert!(s.log_tail(&i.id, "../latest.log").is_err());
    }
    #[cfg(unix)]
    #[test]
    fn linked_content_and_failed_copy_leave_source_untouched() {
        use std::os::unix::fs::symlink;
        let dir = tempfile::tempdir().unwrap();
        let external = tempfile::tempdir().unwrap();
        let (mut s, i) = setup(dir.path());
        let mods = s.openable_directory(&i.id, Section::Mods, None).unwrap();
        let file = external.path().join("source.jar");
        fs::write(&file, b"keep").unwrap();
        symlink(&file, mods.join("linked.jar")).unwrap();
        assert!(s
            .toggle_content(&i.id, Section::Mods, "linked.jar")
            .is_err());
        assert!(s.trash_content(&i.id, Section::Mods, "linked.jar").is_err());
        assert!(s
            .import_content(&i.id, Section::Mods, &mods.join("linked.jar"))
            .is_err());
        assert!(s.duplicate(&i.id, true).is_err());
        assert_eq!(s.list().unwrap().len(), 1);
        assert_eq!(fs::read(&file).unwrap(), b"keep");
    }
}
