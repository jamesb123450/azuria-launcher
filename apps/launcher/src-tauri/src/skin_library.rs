//! Local skin library. Only validated PNG data crosses IPC; paths remain native.
use crate::AppState;
use base64::{engine::general_purpose::STANDARD, Engine};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::Read,
    path::{Path, PathBuf},
};
use tauri::{Emitter, Manager};
const MAX_LIBRARY: u64 = 8 * 1024 * 1024;
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedSkin {
    pub id: String,
    pub name: String,
    pub image: String,
    pub variant: String,
    pub cape_id: Option<String>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkinInput {
    pub id: Option<String>,
    pub name: String,
    pub image: String,
    pub variant: String,
    pub cape_id: Option<String>,
}
fn ordinary(path: &Path, directory: bool) -> Result<(), String> {
    let m = fs::symlink_metadata(path).map_err(|_| "Could not access the skin library.")?;
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        if m.file_attributes() & 0x400 != 0 {
            return Err("Linked skin-library paths are not supported.".into());
        }
    }
    if m.file_type().is_symlink() || m.is_dir() != directory || (!directory && !m.is_file()) {
        return Err("Skin library paths must be ordinary files and folders.".into());
    }
    Ok(())
}
fn dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let state = app.state::<AppState>();
    let storage = state.lock().map_err(|_| "Storage is unavailable.")?;
    if !storage.checked || storage.acknowledgement_required {
        return Err("Confirm the storage migration before using saved skins.".into());
    }
    ordinary(&storage.root, true)?;
    let path = storage.root.join("skins");
    if !path.exists() {
        fs::create_dir(&path).map_err(|_| "Could not create the skin library.")?;
    }
    ordinary(&path, true)?;
    Ok(path)
}
pub fn decode_skin(image: &str) -> Result<Vec<u8>, String> {
    if image.len() > 1400000 {
        return Err("Choose a PNG skin smaller than 1 MB.".into());
    }
    let encoded = image
        .strip_prefix("data:image/png;base64,")
        .ok_or("Choose a PNG skin.")?;
    let bytes = STANDARD
        .decode(encoded)
        .map_err(|_| "Invalid PNG skin data.")?;
    if bytes.len() > 1024 * 1024 {
        return Err("Choose a PNG skin smaller than 1 MB.".into());
    }
    crate::cosmetics::validate_skin(&bytes)?;
    Ok(bytes)
}
fn read_at(path: &Path) -> Result<Vec<SavedSkin>, String> {
    ordinary(path, false)?;
    let m = fs::metadata(path).map_err(|_| "Could not read saved skins.")?;
    if m.len() > MAX_LIBRARY {
        return Err("The skin library exceeds its 8 MB limit.".into());
    }
    let mut data = vec![];
    fs::File::open(path)
        .map_err(|_| "Could not read saved skins.")?
        .take(MAX_LIBRARY + 1)
        .read_to_end(&mut data)
        .map_err(|_| "Could not read saved skins.")?;
    if data.len() as u64 > MAX_LIBRARY {
        return Err("The skin library exceeds its 8 MB limit.".into());
    }
    let skins: Vec<SavedSkin> = serde_json::from_slice(&data)
        .map_err(|_| "The skin library is damaged. Its backup has been retained.")?;
    if skins.len() > 100 {
        return Err("The skin library exceeds 100 entries.".into());
    }
    Ok(skins)
}
fn read(dir: &Path) -> Result<Vec<SavedSkin>, String> {
    let main = dir.join("library.json");
    let backup = dir.join("library.backup.json");
    if main.exists() {
        return read_at(&main);
    }
    if backup.exists() {
        return read_at(&backup);
    }
    Ok(vec![])
}
fn write(dir: &Path, skins: &[SavedSkin]) -> Result<(), String> {
    let bytes = serde_json::to_vec(skins).map_err(|_| "Could not encode saved skins.")?;
    if bytes.len() as u64 > MAX_LIBRARY {
        return Err("Your skin library is full (8 MB). Remove an unused saved skin first.".into());
    }
    let main = dir.join("library.json");
    let backup = dir.join("library.backup.json");
    let staging = dir.join("library.pending.json");
    if staging.exists() {
        ordinary(&staging, false)?;
        fs::remove_file(&staging)
            .map_err(|_| "Close programs using the skin library and retry.")?;
    }
    use std::io::Write;
    let mut file = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&staging)
        .map_err(|_| "Could not save skins. Check free space and folder permissions.")?;
    file.write_all(&bytes)
        .and_then(|_| file.sync_all())
        .map_err(|_| "Could not finish saving skins. Your previous library is retained.")?;
    drop(file);
    if main.exists() {
        ordinary(&main, false)?;
        if backup.exists() {
            ordinary(&backup, false)?;
            fs::remove_file(&backup).map_err(|_| "Could not replace the skin-library backup.")?;
        }
        fs::rename(&main, &backup)
            .map_err(|_| "Could not update the skin library. Close programs using it and retry.")?;
    }
    if fs::rename(&staging, &main).is_err() {
        if !main.exists() && backup.exists() {
            let _ = fs::rename(&backup, &main);
        }
        return Err("Could not publish saved skins. Your previous library is retained.".into());
    }
    Ok(())
}
#[tauri::command]
pub fn skin_library_list(app: tauri::AppHandle) -> Result<Vec<SavedSkin>, String> {
    let state = app.state::<AppState>();
    let path = dir(&app)?;
    let _guard = state.lock().map_err(|_| "Storage is unavailable.")?;
    read(&path)
}
#[tauri::command]
pub fn skin_library_save(
    app: tauri::AppHandle,
    input: SkinInput,
) -> Result<Vec<SavedSkin>, String> {
    let name = input.name.trim();
    if name.is_empty() || name.chars().count() > 48 || name.chars().any(char::is_control) {
        return Err("Use a skin name between 1 and 48 characters.".into());
    }
    if !["classic", "slim"].contains(&input.variant.as_str()) {
        return Err("Choose Classic or Slim arms.".into());
    }
    decode_skin(&input.image)?;
    if input.cape_id.as_ref().is_some_and(|v| v.len() > 80) {
        return Err("Invalid cape selection.".into());
    }
    let path = dir(&app)?;
    let state = app.state::<AppState>();
    let _guard = state.lock().map_err(|_| "Storage is unavailable.")?;
    let mut skins = read(&path)?;
    let id = match input.id {
        Some(id) => {
            if !skins.iter().any(|s| s.id == id) {
                return Err("This saved skin was removed. Reopen the editor.".into());
            }
            id
        }
        None => {
            if skins.len() >= 100 {
                return Err(
                    "Your library is full (100 skins). Remove one before adding another.".into(),
                );
            }
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map_err(|_| "Could not create a skin identifier.")?
                .as_nanos()
                .to_string()
        }
    };
    let item = SavedSkin {
        id: id.clone(),
        name: name.into(),
        image: input.image,
        variant: input.variant,
        cape_id: input.cape_id,
    };
    if let Some(old) = skins.iter_mut().find(|s| s.id == id) {
        *old = item;
    } else {
        skins.push(item);
    }
    write(&path, &skins)?;
    Ok(skins)
}
#[tauri::command]
pub fn skin_library_remove(app: tauri::AppHandle, id: String) -> Result<Vec<SavedSkin>, String> {
    let path = dir(&app)?;
    let state = app.state::<AppState>();
    let _guard = state.lock().map_err(|_| "Storage is unavailable.")?;
    let mut skins = read(&path)?;
    skins.retain(|s| s.id != id);
    write(&path, &skins)?;
    Ok(skins)
}
pub fn read_png(path: &Path) -> Result<String, String> {
    ordinary(path, false)?;
    let mut data = vec![];
    fs::File::open(path)
        .map_err(|_| "Could not open that skin file.")?
        .take(1024 * 1024 + 1)
        .read_to_end(&mut data)
        .map_err(|_| "Could not read that skin file.")?;
    if data.len() > 1024 * 1024 {
        return Err("Choose a skin smaller than 1 MB.".into());
    }
    crate::cosmetics::validate_skin(&data)?;
    Ok(format!("data:image/png;base64,{}", STANDARD.encode(data)))
}
#[tauri::command]
pub async fn skin_pick_texture() -> Result<Option<String>, String> {
    #[cfg(windows)]
    {
        tauri::async_runtime::spawn_blocking(|| {
            let Some(path) = rfd::FileDialog::new()
                .add_filter("Minecraft PNG skin", &["png"])
                .pick_file()
            else {
                return Ok(None);
            };
            read_png(&path).map(Some)
        })
        .await
        .map_err(|_| "Skin picker task failed.")?
    }
    #[cfg(not(windows))]
    {
        Err("Skin uploads require the Windows desktop app.".into())
    }
}
pub fn dropped(app: tauri::AppHandle, paths: Vec<PathBuf>) {
    drop(tauri::async_runtime::spawn_blocking(move || {
        let result = if paths.len() == 1 {
            read_png(&paths[0])
        } else {
            Err("Drop one PNG skin at a time.".into())
        };
        let payload = match result {
            Ok(image) => serde_json::json!({"image":image}),
            Err(error) => serde_json::json!({"error":error}),
        };
        let _ = app.emit("skin-file-dropped", payload);
    }));
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn library_round_trip_and_interrupted_publish_recovery() {
        let temp = tempfile::tempdir().unwrap();
        let item = SavedSkin {
            id: "one".into(),
            name: "Test".into(),
            image: "image".into(),
            variant: "classic".into(),
            cape_id: None,
        };
        write(temp.path(), &[item]).unwrap();
        assert_eq!(read(temp.path()).unwrap()[0].name, "Test");
        fs::rename(
            temp.path().join("library.json"),
            temp.path().join("library.backup.json"),
        )
        .unwrap();
        assert_eq!(read(temp.path()).unwrap().len(), 1);
        write(temp.path(), &[]).unwrap();
        assert!(read(temp.path()).unwrap().is_empty());
    }
    #[test]
    fn rejects_non_png_data() {
        assert!(decode_skin("https://example.com/skin.png").is_err());
        assert!(decode_skin("data:image/png;base64,YmFk").is_err());
    }
}
