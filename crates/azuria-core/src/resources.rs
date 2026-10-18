//! Storage measurements and narrowly scoped cleanup of abandoned content staging.
use crate::{error, folders, Store};
use serde::{Deserialize, Serialize};
use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    path::{Path, PathBuf},
    time::{Duration, SystemTime},
};

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct ResourceOptions {
    pub unused_download_gib: u32,
    pub concurrent_downloads: u32,
}
impl Default for ResourceOptions {
    fn default() -> Self {
        Self {
            unused_download_gib: 5,
            concurrent_downloads: 8,
        }
    }
}
impl ResourceOptions {
    pub fn validate(&self) -> Result<(), String> {
        if self.unused_download_gib > 100 || !(1..=10).contains(&self.concurrent_downloads) {
            return Err(
                "Keep 0–100 GiB of unused downloads and use 1–10 concurrent downloads.".into(),
            );
        }
        Ok(())
    }
}
impl Store {
    pub fn resource_options(&self) -> Result<ResourceOptions, String> {
        use rusqlite::OptionalExtension;
        let raw: Option<String> = self
            .conn
            .query_row(
                "SELECT value FROM settings WHERE key='resources'",
                [],
                |r| r.get(0),
            )
            .optional()
            .map_err(error)?;
        let mut value: ResourceOptions = raw
            .map(|s| serde_json::from_str(&s).map_err(error))
            .transpose()?
            .unwrap_or_default();
        value.concurrent_downloads = value.concurrent_downloads.min(10);
        value.validate()?;
        Ok(value)
    }
    pub fn save_resource_options(&self, options: ResourceOptions) -> Result<(), String> {
        options.validate()?;
        self.conn.execute("INSERT INTO settings (key,value) VALUES ('resources',?1) ON CONFLICT(key) DO UPDATE SET value=excluded.value", [serde_json::to_string(&options).map_err(error)?]).map_err(error)?;
        Ok(())
    }
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Category {
    pub name: String,
    pub bytes: u64,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Usage {
    pub directory: String,
    pub total_bytes: u64,
    pub categories: Vec<Category>,
    pub cleanup_bytes: u64,
    pub cleanup_files: usize,
    pub skipped: u64,
}
#[derive(Clone)]
pub struct Candidate {
    path: PathBuf,
    bytes: u64,
    modified: SystemTime,
    identity: (u64, u64),
}
pub struct Scan {
    pub usage: Usage,
    pub candidates: Vec<Candidate>,
}
fn ordinary(meta: &fs::Metadata) -> bool {
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        if meta.file_attributes() & 0x400 != 0 {
            return false;
        }
    }
    !meta.file_type().is_symlink()
}
// Windows file IDs account for hard links without adding a second content store.
#[cfg(windows)]
fn identity(path: &Path, _: &fs::Metadata) -> Option<(u64, u64, u64)> {
    use std::os::windows::io::AsRawHandle;
    #[repr(C)]
    struct Info {
        attributes: u32,
        creation: [u32; 2],
        access: [u32; 2],
        write: [u32; 2],
        volume: u32,
        size_high: u32,
        size_low: u32,
        links: u32,
        index_high: u32,
        index_low: u32,
    }
    #[link(name = "kernel32")]
    extern "system" {
        fn GetFileInformationByHandle(handle: *mut std::ffi::c_void, info: *mut Info) -> i32;
    }
    let file = fs::File::open(path).ok()?;
    let mut info = std::mem::MaybeUninit::<Info>::uninit();
    // SAFETY: live file handle and writable BY_HANDLE_FILE_INFORMATION layout.
    if unsafe { GetFileInformationByHandle(file.as_raw_handle(), info.as_mut_ptr()) } == 0 {
        return None;
    }
    // SAFETY: successful Win32 call initialized all fields.
    let info = unsafe { info.assume_init() };
    Some((
        u64::from(info.volume),
        (u64::from(info.index_high) << 32) | u64::from(info.index_low),
        u64::from(info.links),
    ))
}
#[cfg(unix)]
fn identity(_: &Path, meta: &fs::Metadata) -> Option<(u64, u64, u64)> {
    use std::os::unix::fs::MetadataExt;
    Some((meta.dev(), meta.ino(), meta.nlink()))
}
#[cfg(not(any(unix, windows)))]
fn identity(_: &Path, _: &fs::Metadata) -> Option<(u64, u64, u64)> {
    None
}
fn category(relative: &Path) -> String {
    let parts: Vec<_> = relative.iter().map(|p| p.to_string_lossy()).collect();
    if parts.first().is_some_and(|p| p == "instances") {
        if parts.iter().skip(2).any(|p| p == "screenshots") {
            return "Screenshots".into();
        }
        if parts
            .iter()
            .skip(2)
            .any(|p| p == "logs" || p == "crash-reports")
        {
            return "Logs".into();
        }
        return format!(
            "Instance · {}",
            parts.get(1).map(|p| p.as_ref()).unwrap_or("Other")
        );
    }
    match parts.first().map(|p| p.as_ref()) {
        Some("game-cache")
            if parts
                .get(1)
                .is_some_and(|p| p == "runtimes" || p == "runtime-manifests") =>
        {
            "Java runtimes"
        }
        Some("game-cache") if parts.get(1).is_some_and(|p| p == "content-staging") => {
            "Unused downloads"
        }
        Some("game-cache") => "Shared game files",
        Some("skins") => "Skins",
        Some("trash") => "Trash",
        Some("logs") => "Logs",
        _ => "Launcher data",
    }
    .into()
}
pub fn scan(root: &Path, options: &ResourceOptions) -> Result<Scan, String> {
    options.validate()?;
    if !folders::plain_directory(root)? {
        return Err("Launcher data folder is missing.".into());
    }
    let now = SystemTime::now();
    let mut stack = vec![root.to_path_buf()];
    let mut sizes = BTreeMap::<String, u64>::new();
    let mut seen = BTreeSet::new();
    let mut candidates = vec![];
    let mut skipped = 0;
    while let Some(dir) = stack.pop() {
        if !folders::plain_directory(&dir).unwrap_or(false) {
            skipped += 1;
            continue;
        }
        let entries = match fs::read_dir(&dir) {
            Ok(v) => v,
            Err(_) => {
                skipped += 1;
                continue;
            }
        };
        let mut entries: Vec<_> = entries.collect();
        entries.sort_by_key(|entry| entry.as_ref().ok().map(|entry| entry.path()));
        for entry in entries {
            let entry = match entry {
                Ok(v) => v,
                Err(_) => {
                    skipped += 1;
                    continue;
                }
            };
            let path = entry.path();
            let meta = match fs::symlink_metadata(&path) {
                Ok(v) => v,
                Err(_) => {
                    skipped += 1;
                    continue;
                }
            };
            if !ordinary(&meta) {
                skipped += 1;
                continue;
            }
            if meta.is_dir() {
                stack.push(path);
                continue;
            }
            if !meta.is_file() {
                continue;
            }
            let Some((volume, index, links)) = identity(&path, &meta) else {
                skipped += 1;
                continue;
            };
            if !seen.insert((volume, index)) {
                continue;
            }
            let relative = path.strip_prefix(root).map_err(error)?;
            *sizes.entry(category(relative)).or_default() += meta.len();
            if relative.starts_with("game-cache/content-staging") && links == 1 {
                if let Ok(modified) = meta.modified() {
                    if now.duration_since(modified).unwrap_or_default()
                        >= Duration::from_secs(24 * 3600)
                    {
                        candidates.push(Candidate {
                            path,
                            bytes: meta.len(),
                            modified,
                            identity: (volume, index),
                        });
                    }
                }
            }
        }
    }
    candidates.sort_by_key(|c| c.modified);
    let available: u64 = candidates.iter().map(|c| c.bytes).sum();
    let keep = u64::from(options.unused_download_gib) * 1024 * 1024 * 1024;
    let mut remaining = available;
    let mut selected = vec![];
    for candidate in candidates {
        if remaining <= keep {
            break;
        }
        remaining = remaining.saturating_sub(candidate.bytes);
        selected.push(candidate);
    }
    let categories: Vec<_> = sizes
        .into_iter()
        .map(|(name, bytes)| Category { name, bytes })
        .collect();
    let total_bytes = categories.iter().map(|c| c.bytes).sum();
    Ok(Scan {
        usage: Usage {
            directory: root.display().to_string(),
            total_bytes,
            categories,
            cleanup_bytes: selected.iter().map(|c| c.bytes).sum(),
            cleanup_files: selected.len(),
            skipped,
        },
        candidates: selected,
    })
}
pub fn clean(root: &Path, candidates: &[Candidate]) -> Result<u64, String> {
    let allowed = root.join("game-cache/content-staging");
    let mut removed = 0;
    for candidate in candidates {
        if !candidate.path.starts_with(&allowed) {
            return Err("Cleanup path was rejected.".into());
        }
        for parent in candidate
            .path
            .ancestors()
            .skip(1)
            .take_while(|p| p.starts_with(root))
        {
            folders::plain_directory(parent)?;
        }
        let meta = match fs::symlink_metadata(&candidate.path) {
            Ok(v) => v,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => continue,
            Err(e) => return Err(error(e)),
        };
        if !ordinary(&meta)
            || !meta.is_file()
            || meta.len() != candidate.bytes
            || meta.modified().ok() != Some(candidate.modified)
            || !identity(&candidate.path, &meta).is_some_and(|(volume, index, links)| {
                links == 1 && (volume, index) == candidate.identity
            })
        {
            return Err("Downloads changed. Refresh the storage preview before cleaning.".into());
        }
        fs::remove_file(&candidate.path).map_err(|_|"Could not clean an unused download. Close Minecraft and retry; some files may already have been removed.")?;
        removed += candidate.bytes;
    }
    Ok(removed)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn settings_persist_and_invalid_values_do_not_replace_them() {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::open(dir.path().to_path_buf()).unwrap();
        let options = ResourceOptions {
            unused_download_gib: 0,
            concurrent_downloads: 2,
        };
        store.save_resource_options(options.clone()).unwrap();
        assert!(store
            .save_resource_options(ResourceOptions {
                unused_download_gib: 101,
                concurrent_downloads: 0
            })
            .is_err());
        drop(store);
        let store = Store::open(dir.path().to_path_buf()).unwrap();
        assert_eq!(store.resource_options().unwrap(), options);
    }
    #[test]
    fn measurement_deduplicates_links_and_does_not_clean_instances() {
        let dir = tempfile::tempdir().unwrap();
        fs::create_dir_all(dir.path().join("instances/Test/saves")).unwrap();
        let file = dir.path().join("instances/Test/saves/world");
        fs::write(&file, b"world").unwrap();
        fs::hard_link(&file, dir.path().join("copy")).unwrap();
        let result = scan(dir.path(), &ResourceOptions::default()).unwrap();
        assert_eq!(result.usage.total_bytes, 5);
        assert_eq!(result.usage.cleanup_bytes, 0);
    }
    #[test]
    fn changed_cleanup_files_are_preserved() {
        let dir = tempfile::tempdir().unwrap();
        let folder = dir.path().join("game-cache/content-staging/old");
        fs::create_dir_all(&folder).unwrap();
        let path = folder.join("download");
        fs::write(&path, b"old").unwrap();
        let candidate = Candidate {
            path: path.clone(),
            bytes: 3,
            modified: fs::metadata(&path).unwrap().modified().unwrap(),
            identity: {
                let (v, i, _) = identity(&path, &fs::metadata(&path).unwrap()).unwrap();
                (v, i)
            },
        };
        fs::write(&path, b"new content").unwrap();
        assert!(clean(dir.path(), &[candidate]).is_err());
        assert!(path.exists());
        assert_eq!(
            clean(
                dir.path(),
                &[Candidate {
                    path: path.clone(),
                    bytes: 11,
                    modified: fs::metadata(&path).unwrap().modified().unwrap(),
                    identity: {
                        let (v, i, _) = identity(&path, &fs::metadata(&path).unwrap()).unwrap();
                        (v, i)
                    }
                }]
            )
            .unwrap(),
            11
        );
    }
    #[cfg(unix)]
    #[test]
    fn linked_folders_are_never_scanned() {
        let dir = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        fs::write(outside.path().join("private"), b"data").unwrap();
        std::os::unix::fs::symlink(outside.path(), dir.path().join("link")).unwrap();
        let result = scan(dir.path(), &ResourceOptions::default()).unwrap();
        assert_eq!(result.usage.total_bytes, 0);
        assert_eq!(result.usage.skipped, 1);
    }
}

#[cfg(test)]
mod cleanup_tests {
    use super::*;
    #[test]
    fn retention_only_selects_old_staging_downloads() {
        let dir = tempfile::tempdir().unwrap();
        let folder = dir.path().join("game-cache/content-staging/interrupted");
        fs::create_dir_all(&folder).unwrap();
        let old = folder.join("old");
        fs::write(&old, b"old").unwrap();
        fs::File::options()
            .write(true)
            .open(&old)
            .unwrap()
            .set_times(
                fs::FileTimes::new()
                    .set_modified(SystemTime::now() - Duration::from_secs(48 * 3600)),
            )
            .unwrap();
        fs::write(folder.join("recent"), b"recent").unwrap();
        fs::create_dir_all(dir.path().join("game-cache/assets")).unwrap();
        fs::write(dir.path().join("game-cache/assets/keep"), b"asset").unwrap();
        assert_eq!(
            scan(dir.path(), &ResourceOptions::default())
                .unwrap()
                .usage
                .cleanup_files,
            0
        );
        let scan = scan(
            dir.path(),
            &ResourceOptions {
                unused_download_gib: 0,
                concurrent_downloads: 1,
            },
        )
        .unwrap();
        assert_eq!(scan.usage.cleanup_bytes, 3);
        assert_eq!(scan.usage.cleanup_files, 1);
        assert_eq!(clean(dir.path(), &scan.candidates).unwrap(), 3);
        assert!(folder.join("recent").exists());
        assert!(dir.path().join("game-cache/assets/keep").exists());
    }
}
