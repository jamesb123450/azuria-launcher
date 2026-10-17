use crate::{with_store, AppState};
use azuria_core::instance_files::Section;
use base64::{engine::general_purpose::STANDARD, Engine};
use std::{io::Cursor, path::PathBuf};
use tauri::Manager;
fn source(app: &tauri::AppHandle, id: &str, name: &str) -> Result<PathBuf, String> {
    let state = app.state::<AppState>();
    with_store(&state, |store| {
        if !store
            .entries(id, Section::Screenshots)?
            .iter()
            .any(|e| e.name == name)
        {
            return Err("Screenshot no longer exists.".into());
        }
        Ok(store.section_dir(id, Section::Screenshots)?.join(name))
    })
}
fn read_png(path: &std::path::Path, thumbnail: bool) -> Result<String, String> {
    let metadata = std::fs::symlink_metadata(path).map_err(|_| "Could not read the screenshot.")?;
    if metadata.file_type().is_symlink() || metadata.len() > 32 * 1024 * 1024 {
        return Err("Screenshot is linked or exceeds 32 MB.".into());
    }
    let data = std::fs::read(path).map_err(|_| "Could not read the screenshot.")?;
    let mut reader = image::ImageReader::with_format(Cursor::new(&data), image::ImageFormat::Png);
    let mut limits = image::Limits::default();
    limits.max_image_width = Some(8192);
    limits.max_image_height = Some(8192);
    limits.max_alloc = Some(256 * 1024 * 1024);
    reader.limits(limits);
    let image = reader
        .decode()
        .map_err(|_| "Screenshot is damaged or too large to preview.")?;
    let encoded = if thumbnail {
        let mut bytes = Cursor::new(vec![]);
        image
            .thumbnail(360, 210)
            .write_to(&mut bytes, image::ImageFormat::Png)
            .map_err(|_| "Could not prepare the screenshot preview.")?;
        bytes.into_inner()
    } else {
        data
    };
    Ok(format!(
        "data:image/png;base64,{}",
        STANDARD.encode(encoded)
    ))
}
#[tauri::command]
pub async fn screenshot_image(
    app: tauri::AppHandle,
    id: String,
    name: String,
    thumbnail: bool,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || read_png(&source(&app, &id, &name)?, thumbnail))
        .await
        .map_err(|_| "Screenshot preview task failed.")?
}
#[tauri::command]
pub async fn screenshot_export(
    app: tauri::AppHandle,
    id: String,
    name: String,
) -> Result<bool, String> {
    let source = source(&app, &id, &name)?;
    tauri::async_runtime::spawn_blocking(move || {
        #[cfg(windows)]
        {
            let Some(target) = rfd::FileDialog::new()
                .add_filter("PNG screenshot", &["png"])
                .set_file_name(&name)
                .save_file()
            else {
                return Ok(false);
            };
            if target == source {
                return Ok(false);
            }
            std::fs::copy(source, target).map_err(|_| "Could not export the screenshot.")?;
            Ok(true)
        }
        #[cfg(not(windows))]
        {
            let _ = (source, name);
            Err("Screenshot export requires the Windows desktop app.".into())
        }
    })
    .await
    .map_err(|_| "Screenshot export task failed.")?
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn damaged_images_fail_cleanly() {
        let d = tempfile::tempdir().unwrap();
        let path = d.path().join("bad.png");
        std::fs::write(&path, b"invalid").unwrap();
        assert!(read_png(&path, true).is_err());
    }
}
