use crate::{with_store, Accounts, AppState};
use azuria_launch::{Credentials, Progress, Reporter};
use serde::Serialize;
use std::{
    collections::BTreeMap,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
};
use tauri::{Emitter, Manager, State};
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Launch {
    id: String,
    stage: String,
    message: String,
    completed: u64,
    total: u64,
    exit_code: Option<i32>,
}
impl Launch {
    fn active(&self) -> bool {
        !matches!(
            self.stage.as_str(),
            "exited" | "crashed" | "error" | "cancelled"
        )
    }
}
struct Entry {
    view: Launch,
    cancel: Arc<AtomicBool>,
}
#[derive(Default)]
pub struct Games {
    entries: Mutex<BTreeMap<String, Entry>>,
    preparation: Mutex<()>,
}
impl Games {
    pub fn has_active(&self) -> bool {
        self.entries
            .lock()
            .map(|entries| entries.values().any(|e| e.view.active()))
            .unwrap_or(true)
    }
    pub fn with_idle<T>(
        &self,
        id: &str,
        action: impl FnOnce() -> Result<T, String>,
    ) -> Result<T, String> {
        let entries = self
            .entries
            .lock()
            .map_err(|_| "Game state is unavailable.")?;
        if entries.get(id).is_some_and(|e| e.view.active()) {
            return Err(
                "Close Minecraft or cancel preparation before changing this instance.".into(),
            );
        }
        action()
    }
    fn update(&self, app: &tauri::AppHandle, id: &str, progress: Progress) {
        if let Ok(mut entries) = self.entries.lock() {
            if let Some(entry) = entries.get_mut(id) {
                entry.view.stage = progress.stage;
                entry.view.message = progress.message;
                entry.view.completed = progress.completed;
                entry.view.total = progress.total;
                let _ = app.emit("game-progress", &entry.view);
            }
        }
    }
    fn finish(
        &self,
        app: &tauri::AppHandle,
        id: &str,
        stage: &str,
        message: &str,
        code: Option<i32>,
    ) {
        if let Ok(mut entries) = self.entries.lock() {
            if let Some(entry) = entries.get_mut(id) {
                entry.view = Launch {
                    id: id.into(),
                    stage: stage.into(),
                    message: message.into(),
                    completed: 0,
                    total: 0,
                    exit_code: code,
                };
                let _ = app.emit("game-progress", &entry.view);
            }
        }
    }
}
#[tauri::command]
pub fn game_launches(games: State<'_, Games>) -> Result<Vec<Launch>, String> {
    Ok(games
        .entries
        .lock()
        .map_err(|_| "Game state is unavailable.")?
        .values()
        .map(|e| e.view.clone())
        .collect())
}
#[tauri::command]
pub fn cancel_launch(games: State<'_, Games>, id: String) -> Result<(), String> {
    let entries = games
        .entries
        .lock()
        .map_err(|_| "Game state is unavailable.")?;
    if let Some(entry) = entries.get(&id) {
        entry.cancel.store(true, Ordering::Relaxed);
    }
    Ok(())
}
#[tauri::command]
pub async fn launch_instance(app: tauri::AppHandle, id: String) -> Result<(), String> {
    #[cfg(not(all(windows, target_arch = "x86_64")))]
    {
        let _ = (app, id);
        Err("Minecraft launching currently requires the Windows x64 desktop app.".into())
    }
    #[cfg(all(windows, target_arch = "x86_64"))]
    {
        let cancel = Arc::new(AtomicBool::new(false));
        let (game, root, instance, options) = {
            let games = app.state::<Games>();
            let mut entries = games
                .entries
                .lock()
                .map_err(|_| "Game state is unavailable.")?;
            if entries.get(&id).is_some_and(|e| e.view.active()) {
                return Err("This instance is already preparing or running.".into());
            }
            let storage = app.state::<AppState>();
            let prepared = with_store(&storage, |s| {
                let instance = s
                    .list()?
                    .into_iter()
                    .find(|i| i.id == id)
                    .ok_or("Instance no longer exists.")?;
                if !matches!(
                    instance.loader,
                    azuria_core::Loader::Vanilla | azuria_core::Loader::Fabric
                ) {
                    return Err("Vanilla and Fabric launching are supported. Quilt, Forge and NeoForge are coming soon.".into());
                }
                if instance.loader == azuria_core::Loader::Fabric
                    && instance
                        .loader_version
                        .as_deref()
                        .is_none_or(|v| v.trim().is_empty())
                {
                    return Err(
                        "Choose a Fabric loader version in instance settings before launching."
                            .into(),
                    );
                }
                let game = s.instance_dir(&id)?;
                let root = game
                    .parent()
                    .and_then(|p| p.parent())
                    .ok_or("Invalid instance storage.")?
                    .join("game-cache");
                let options = s.launch_overrides(&id)?.effective(&s.launch_defaults()?);
                Ok((game, root, instance, options))
            })?;
            entries.insert(
                id.clone(),
                Entry {
                    view: Launch {
                        id: id.clone(),
                        stage: "queued".into(),
                        message: "Waiting to prepare Minecraft".into(),
                        completed: 0,
                        total: 0,
                        exit_code: None,
                    },
                    cancel: cancel.clone(),
                },
            );
            prepared
        };
        // A native task owns preparation and process monitoring even if the view changes.
        tauri::async_runtime::spawn_blocking(move || {
            let games = app.state::<Games>();
            let reporter: Reporter = {
                let app = app.clone();
                let id = id.clone();
                Arc::new(move |p| app.state::<Games>().update(&app, &id, p))
            };
            let result = (|| -> Result<Option<i32>, String> {
                let preparation = loop {
                    azuria_launch::cancelled(&cancel)?;
                    match games.preparation.try_lock() {
                        Ok(lock) => break lock,
                        Err(std::sync::TryLockError::WouldBlock) => {
                            std::thread::sleep(std::time::Duration::from_millis(100))
                        }
                        Err(_) => {
                            return Err("Another preparation task failed. Restart Azuria.".into())
                        }
                    }
                };
                azuria_launch::cancelled(&cancel)?;
                azuria_launch::report(
                    &reporter,
                    "account",
                    "Checking your Minecraft account",
                    0,
                    0,
                );
                let accounts = app.state::<Accounts>();
                tauri::async_runtime::block_on(
                    accounts.launch_session(crate::auth_progress(app.clone())),
                )
                .map_err(|e| e.message)?;
                let prepared = azuria_launch::prepare_with_loader(
                    &root,
                    &game,
                    &instance.minecraft_version,
                    if instance.loader == azuria_core::Loader::Fabric {
                        instance.loader_version.as_deref()
                    } else {
                        None
                    },
                    options,
                    reporter.clone(),
                    cancel.clone(),
                )?;
                // Large downloads can outlive the session. Refresh again immediately before spawning.
                azuria_launch::report(&reporter, "account", "Refreshing the game session", 0, 0);
                let session = tauri::async_runtime::block_on(
                    accounts.launch_session(crate::auth_progress(app.clone())),
                )
                .map_err(|e| e.message)?;
                azuria_launch::cancelled(&cancel)?;
                azuria_launch::report(&reporter, "launching", "Starting Minecraft", 0, 0);
                let running = prepared.start(Credentials {
                    username: session.account.username,
                    uuid: session.account.minecraft_id,
                    access_token: session.access_token,
                    client_id: azuria_auth::CLIENT_ID.into(),
                    xuid: session.xuid,
                })?;
                azuria_launch::report(
                    &reporter,
                    "running",
                    "Minecraft is running. Close the game normally to save your world.",
                    0,
                    0,
                );
                drop(preparation);
                running.wait_with_cancel(cancel.clone())
            })();
            match result {Ok(code) if cancel.load(Ordering::Relaxed)=>games.finish(&app,&id,"cancelled","Minecraft stopped",code),Ok(Some(0))=>games.finish(&app,&id,"exited","Minecraft closed normally",Some(0)),Ok(code)=>games.finish(&app,&id,"crashed","Minecraft exited unexpectedly. Open Logs to inspect azuria-launch.log and the game’s crash reports.",code),Err(error)=>{let stage=if cancel.load(Ordering::Relaxed){"cancelled"}else{"error"};games.finish(&app,&id,stage,&error,None);}}
        });
        Ok(())
    }
}
