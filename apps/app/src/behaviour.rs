use crate::{with_store, AppState};
use azuria_core::behaviour::Behaviour;
use std::{collections::BTreeSet, sync::Mutex};
use tauri::{Manager, State};
#[tauri::command]
pub fn get_behaviour(state: State<'_, AppState>) -> Result<Behaviour, String> {
    with_store(&state, |store| store.behaviour())
}
#[tauri::command]
pub fn save_behaviour(state: State<'_, AppState>, options: Behaviour) -> Result<(), String> {
    with_store(&state, |store| store.save_behaviour(options))?;
    Ok(())
}
// Game lifetimes only; Discord manages automatic Minecraft detection independently.
#[derive(Default)]
pub struct RunningSessions(Mutex<BTreeSet<String>>);
impl RunningSessions {
    fn started(&self, id: &str) {
        if let Ok(mut games) = self.0.lock() {
            games.insert(id.into());
        }
    }
    fn stopped(&self, id: &str) -> bool {
        self.0
            .lock()
            .map(|mut games| {
                games.remove(id);
                games.is_empty()
            })
            .unwrap_or(false)
    }
}
/// Exists only after a real game process has started, never during preparation.
pub struct RunningSession {
    app: tauri::AppHandle,
    id: String,
}
impl RunningSession {
    pub fn start(app: tauri::AppHandle, id: String) -> Self {
        let options =
            with_store(&app.state::<AppState>(), |store| store.behaviour()).unwrap_or(Behaviour {
                discord_presence: false,
                ..Behaviour::default()
            });
        app.state::<RunningSessions>().started(&id);
        if options.minimise_on_start {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.minimize();
            }
        }
        Self { app, id }
    }
}
impl Drop for RunningSession {
    fn drop(&mut self) {
        let idle = self.app.state::<RunningSessions>().stopped(&self.id);
        let refocus = with_store(&self.app.state::<AppState>(), |store| store.behaviour())
            .map(|options| options.refocus_on_exit)
            .unwrap_or(false);
        if idle && refocus {
            if let Some(window) = self.app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn refocus_waits_for_the_last_game_to_close() {
        let sessions = RunningSessions::default();
        sessions.started("first");
        sessions.started("second");
        assert!(!sessions.stopped("first"));
        assert!(sessions.stopped("second"));
    }
}
