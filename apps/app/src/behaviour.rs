use crate::{discord::Discord, with_store, AppState};
use azuria_core::behaviour::Behaviour;
use tauri::{Manager, State};
#[tauri::command]
pub fn get_behaviour(state: State<'_, AppState>) -> Result<Behaviour, String> {
    with_store(&state, |store| store.behaviour())
}
#[tauri::command]
pub fn save_behaviour(
    state: State<'_, AppState>,
    discord: State<'_, Discord>,
    options: Behaviour,
) -> Result<(), String> {
    with_store(&state, |store| store.save_behaviour(options.clone()))?;
    discord.enabled(options.discord_presence);
    Ok(())
}
#[tauri::command]
pub fn discord_presence_configured(discord: State<'_, Discord>) -> bool {
    discord.configured()
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
        app.state::<Discord>().enabled(options.discord_presence);
        app.state::<Discord>().started(&id);
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
        let idle = self.app.state::<Discord>().stopped(&self.id);
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
