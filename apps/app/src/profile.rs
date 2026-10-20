use crate::{with_store, AppState};
use std::{fs, io::Write, path::Path};
use tauri::{Manager, State};

#[tauri::command]
pub fn instance_directory(state: State<'_, AppState>, id: String) -> Result<String, String> {
    with_store(&state, |s| {
        Ok(s.instance_dir(&id)?.to_string_lossy().into_owned())
    })
}
#[tauri::command]
pub fn get_instance_notes(state: State<'_, AppState>, id: String) -> Result<String, String> {
    with_store(&state, |s| s.instance_notes(&id))
}
#[tauri::command]
pub fn save_instance_notes(
    state: State<'_, AppState>,
    id: String,
    text: String,
) -> Result<(), String> {
    with_store(&state, |s| s.save_instance_notes(&id, &text))
}
#[tauri::command]
pub fn open_instance_notes_directory(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let path = with_store(&state, |s| s.notes_directory(&id))?;
    #[cfg(windows)]
    let program = "explorer.exe";
    #[cfg(target_os = "macos")]
    let program = "open";
    #[cfg(target_os = "linux")]
    let program = "xdg-open";
    std::process::Command::new(program)
        .arg(path)
        .spawn()
        .map(|_| ())
        .map_err(|e| e.to_string())
}
fn plain(path: &Path) -> Result<fs::Metadata, String> {
    let metadata = fs::symlink_metadata(path).map_err(|e| e.to_string())?;
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        if metadata.file_attributes() & 0x400 != 0 {
            return Err("Linked files cannot be exported.".into());
        }
    }
    if metadata.file_type().is_symlink() || !(metadata.is_file() || metadata.is_dir()) {
        return Err("Linked or special files cannot be exported.".into());
    }
    Ok(metadata)
}
fn archive_folder(root: &Path, destination: &Path) -> Result<(), String> {
    let canonical = root.canonicalize().map_err(|e| e.to_string())?;
    let parent = destination
        .parent()
        .ok_or("Choose an export destination.")?
        .canonicalize()
        .map_err(|e| e.to_string())?;
    if parent.starts_with(&canonical) {
        return Err("Export outside this instance's game directory.".into());
    }
    let temporary = parent.join(format!(
        ".azuria-export-{}-{}.tmp",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(|e| e.to_string())?
            .as_nanos()
    ));
    let file = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temporary)
        .map_err(|e| e.to_string())?;
    let result = (|| {
        let mut zip = zip::ZipWriter::new(file);
        fn visit(
            zip: &mut zip::ZipWriter<fs::File>,
            root: &Path,
            directory: &Path,
            count: &mut usize,
            bytes: &mut u64,
        ) -> Result<(), String> {
            plain(directory)?;
            for entry in fs::read_dir(directory).map_err(|e| e.to_string())? {
                let path = entry.map_err(|e| e.to_string())?.path();
                let metadata = plain(&path)?;
                *count += 1;
                *bytes = bytes
                    .checked_add(if metadata.is_file() {
                        metadata.len()
                    } else {
                        0
                    })
                    .ok_or("Archive is too large.")?;
                if *count > 100_000 || *bytes > 20 * 1024 * 1024 * 1024 {
                    return Err("Archive exceeds 100,000 entries or 20 GB.".into());
                }
                let relative = path.strip_prefix(root).map_err(|e| e.to_string())?;
                let name = relative
                    .components()
                    .map(|part| {
                        part.as_os_str()
                            .to_str()
                            .ok_or("Filename cannot be exported.")
                    })
                    .collect::<Result<Vec<_>, _>>()?
                    .join("/");
                if name.contains('\\') || name.contains(':') {
                    return Err("Filename is not portable to other launchers.".into());
                }
                let options = zip::write::SimpleFileOptions::default()
                    .compression_method(zip::CompressionMethod::Deflated);
                if metadata.is_dir() {
                    zip.add_directory(format!("{name}/"), options)
                        .map_err(|e| e.to_string())?;
                    visit(zip, root, &path, count, bytes)?;
                } else {
                    zip.start_file(name, options).map_err(|e| e.to_string())?;
                    let mut source = fs::File::open(path).map_err(|e| e.to_string())?;
                    std::io::copy(&mut source, zip).map_err(|e| e.to_string())?;
                }
            }
            Ok(())
        }
        visit(&mut zip, root, root, &mut 0, &mut 0)?;
        zip.finish()
            .map_err(|e| e.to_string())?
            .sync_all()
            .map_err(|e| e.to_string())?;
        fs::rename(&temporary, destination).map_err(|e| e.to_string())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result
}
#[tauri::command]
pub async fn export_instance(
    app: tauri::AppHandle,
    id: String,
    format: String,
) -> Result<Option<String>, String> {
    if !matches!(format.as_str(), "azuria" | "folder") {
        return Err("Choose an Azuria setup or Minecraft folder export.".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        #[cfg(windows)] {
            let extension = if format == "folder" {"zip"} else {"json"};
            let Some(destination) = rfd::FileDialog::new().set_file_name(format!("azuria-instance.{extension}")).add_filter("Instance export", &[extension]).save_file() else {return Ok(None);};
            let games = app.state::<crate::game::Games>();
            games.reserve_content(&id)?;
            let result = (|| {
                let state = app.state::<AppState>();
                let (root, configuration) = with_store(&state, |s| {
                    let instance = s.list()?.into_iter().find(|i| i.id == id).ok_or("Instance not found.")?;
                    let overrides = s.launch_overrides(&id)?;
                    let configuration = serde_json::json!({"format":"azuria-setup", "formatVersion":1, "instance":instance, "overrides":{"memoryMb":overrides.memory_mb,"window":overrides.window}});
                    Ok((s.instance_dir(&id)?, configuration))
                })?;
                if format == "folder" {archive_folder(&root, &destination)?;}
                else {
                    let parent = destination.parent().ok_or("Choose an export destination.")?;
                    let canonical = parent.canonicalize().map_err(|e| e.to_string())?;
                    if canonical.starts_with(root.canonicalize().map_err(|e| e.to_string())?) {
                        return Err("Export outside this instance's game directory.".into());
                    }
                    let mut temporary = tempfile::NamedTempFile::new_in(parent).map_err(|e| e.to_string())?;
                    temporary.write_all(serde_json::to_string_pretty(&configuration).map_err(|e| e.to_string())?.as_bytes()).map_err(|e| e.to_string())?;
                    temporary.as_file().sync_all().map_err(|e| e.to_string())?;
                    temporary.persist(&destination).map_err(|e| e.to_string())?;
                }
                Ok(Some(destination.to_string_lossy().into_owned()))
            })();
            games.release_content(&id);
            result
        }
        #[cfg(not(windows))] {let _ = (app, id, format); Err("Instance export requires the Windows desktop app.".into())}
    }).await.map_err(|e| e.to_string())?
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn folder_export_preserves_files_and_rejects_export_inside_source() {
        let root = tempfile::tempdir().unwrap();
        let output = tempfile::tempdir().unwrap();
        fs::create_dir(root.path().join("saves")).unwrap();
        fs::write(root.path().join("saves/world.dat"), b"world").unwrap();
        let destination = output.path().join("world.zip");
        archive_folder(root.path(), &destination).unwrap();
        let mut zip = zip::ZipArchive::new(fs::File::open(destination).unwrap()).unwrap();
        assert_eq!(zip.by_name("saves/world.dat").unwrap().size(), 5);
        assert!(archive_folder(root.path(), &root.path().join("nested.zip")).is_err());
    }
    #[cfg(unix)]
    #[test]
    fn linked_files_do_not_leak_into_exports() {
        let root = tempfile::tempdir().unwrap();
        let output = tempfile::tempdir().unwrap();
        let secret = output.path().join("secret");
        fs::write(&secret, b"secret").unwrap();
        std::os::unix::fs::symlink(secret, root.path().join("link")).unwrap();
        let destination = output.path().join("world.zip");
        assert!(archive_folder(root.path(), &destination).is_err());
        assert!(!destination.exists());
    }
}
