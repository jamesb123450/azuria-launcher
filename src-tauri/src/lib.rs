use azuria_core::{Instance, InstanceInput, Settings, Store};
use std::sync::Mutex;
use tauri::{Manager, State};
type AppState = Mutex<Store>;
fn lock<'a>(state: &'a State<'_, AppState>) -> Result<std::sync::MutexGuard<'a, Store>, String> {
    state
        .lock()
        .map_err(|_| "Launcher storage is unavailable. Restart Azuria.".into())
}
#[tauri::command]
fn list_instances(state: State<'_, AppState>) -> Result<Vec<Instance>, String> {
    lock(&state)?.list()
}
#[tauri::command]
fn create_instance(state: State<'_, AppState>, input: InstanceInput) -> Result<Instance, String> {
    lock(&state)?.create(input)
}
#[tauri::command]
fn update_instance(
    state: State<'_, AppState>,
    id: String,
    input: InstanceInput,
) -> Result<Instance, String> {
    lock(&state)?.update(&id, input)
}
#[tauri::command]
fn toggle_favorite(state: State<'_, AppState>, id: String) -> Result<Instance, String> {
    lock(&state)?.favorite(&id)
}
#[tauri::command]
fn delete_instance(state: State<'_, AppState>, id: String) -> Result<(), String> {
    lock(&state)?.delete(&id)
}
#[tauri::command]
fn get_settings(state: State<'_, AppState>) -> Result<Settings, String> {
    lock(&state)?.settings()
}
#[tauri::command]
fn save_settings(state: State<'_, AppState>, settings: Settings) -> Result<(), String> {
    lock(&state)?.save_settings(settings)
}
// The UI can open this fixed project URL only; no caller-controlled command or URL.
#[tauri::command]
fn open_project_page() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    let program = "explorer.exe";
    #[cfg(target_os = "macos")]
    let program = "open";
    #[cfg(target_os = "linux")]
    let program = "xdg-open";
    std::process::Command::new(program)
        .arg("https://github.com/jamesb123450/azuria-launcher")
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("Could not open the project in your browser: {e}"))
}

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let root = app.path().app_local_data_dir()?;
            let store = Store::open(root).map_err(std::io::Error::other)?;
            app.manage(Mutex::new(store));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_instances,
            create_instance,
            update_instance,
            toggle_favorite,
            delete_instance,
            get_settings,
            save_settings,
            open_project_page
        ])
        .run(tauri::generate_context!())
        .expect("Could not start Azuria Launcher");
}
