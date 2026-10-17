use crate::{game::Games, with_store, AppState};
use azuria_core::resources::{ResourceOptions, Scan, Usage};
use serde::Serialize;
use std::{
    path::PathBuf,
    sync::{
        atomic::{AtomicU64, Ordering},
        Mutex,
    },
    time::Instant,
};
use tauri::{Manager, State};
#[derive(Default)]
pub struct Resources {
    snapshot: Mutex<Option<Snapshot>>,
    sequence: AtomicU64,
}
struct Snapshot {
    when: Instant,
    token: u64,
    scan: Scan,
    options: ResourceOptions,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Report {
    usage: Usage,
    token: u64,
}
fn root(state: &State<'_, AppState>) -> Result<PathBuf, String> {
    with_store(state, |s| {
        s.instances_directory()?
            .parent()
            .map(|p| p.to_path_buf())
            .ok_or("Invalid launcher directory.".into())
    })
}
#[tauri::command]
pub fn resource_options(state: State<'_, AppState>) -> Result<ResourceOptions, String> {
    with_store(&state, |s| s.resource_options())
}
#[tauri::command]
pub fn save_resource_options(
    state: State<'_, AppState>,
    options: ResourceOptions,
) -> Result<(), String> {
    with_store(&state, |s| s.save_resource_options(options))
}
#[tauri::command]
pub async fn storage_usage(app: tauri::AppHandle, refresh: bool) -> Result<Report, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = root(&app.state::<AppState>())?;
        let options = with_store(&app.state::<AppState>(), |s| s.resource_options())?;
        let state = app.state::<Resources>();
        let mut snapshot = state
            .snapshot
            .lock()
            .map_err(|_| "Storage scan is unavailable.")?;
        if !refresh {
            if let Some(saved) = snapshot.as_ref() {
                if saved.when.elapsed().as_secs() < 60 && saved.options == options {
                    return Ok(Report {
                        usage: saved.scan.usage.clone(),
                        token: saved.token,
                    });
                }
            }
        }
        let scan = azuria_core::resources::scan(&path, &options)?;
        let token = state.sequence.fetch_add(1, Ordering::Relaxed) + 1;
        let report = Report {
            usage: scan.usage.clone(),
            token,
        };
        *snapshot = Some(Snapshot {
            when: Instant::now(),
            token,
            scan,
            options,
        });
        Ok(report)
    })
    .await
    .map_err(|_| "Storage scan interrupted. Retry.".to_string())?
}
#[tauri::command]
pub async fn storage_cleanup(app: tauri::AppHandle, token: u64) -> Result<u64, String> {
    tauri::async_runtime::spawn_blocking(move || {
        app.state::<Games>().with_all_idle(|| {
            let path = root(&app.state::<AppState>())?;
            let options = with_store(&app.state::<AppState>(), |s| s.resource_options())?;
            let state = app.state::<Resources>();
            let mut snapshot = state
                .snapshot
                .lock()
                .map_err(|_| "Storage preview is unavailable.")?;
            let saved = snapshot.take().ok_or("Refresh storage before cleaning.")?;
            if saved.token != token
                || saved.when.elapsed().as_secs() > 300
                || saved.options != options
            {
                return Err(
                    "The storage preview expired or settings changed. Refresh it before cleaning."
                        .into(),
                );
            }
            azuria_core::resources::clean(&path, &saved.scan.candidates)
        })
    })
    .await
    .map_err(|_| "Cleanup interrupted. Refresh storage to see what remains.".to_string())?
}
#[tauri::command]
pub fn open_data_folder(state: State<'_, AppState>) -> Result<(), String> {
    let path = root(&state)?;
    #[cfg(windows)]
    {
        std::process::Command::new("explorer.exe")
            .arg(path)
            .spawn()
            .map_err(|_| "Could not open the app directory.")?;
        Ok(())
    }
    #[cfg(not(windows))]
    {
        let _ = path;
        Err("Opening folders requires the Windows app.".into())
    }
}
