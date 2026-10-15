use azuria_core::{Instance, InstanceInput, Settings, Store};
use std::sync::Mutex;
use tauri::{Manager, State};
struct Storage {
    root: std::path::PathBuf,
    store: Option<Store>,
}
type AppState = Mutex<Storage>;
// Opening/recovery failures remain retryable IPC errors instead of aborting
// native setup before the user can see the library's retry screen.
fn with_store<T>(
    state: &State<'_, AppState>,
    action: impl FnOnce(&mut Store) -> Result<T, String>,
) -> Result<T, String> {
    let mut storage = state
        .lock()
        .map_err(|_| "Launcher storage is unavailable. Restart Azuria.".to_string())?;
    if storage.store.is_none() {
        storage.store = Some(Store::open(storage.root.clone())?);
    }
    action(storage.store.as_mut().expect("storage opened above"))
}
#[tauri::command]
fn list_instances(state: State<'_, AppState>) -> Result<Vec<Instance>, String> {
    with_store(&state, |store| store.list())
}
#[tauri::command]
fn create_instance(state: State<'_, AppState>, input: InstanceInput) -> Result<Instance, String> {
    with_store(&state, |store| store.create(input))
}
#[tauri::command]
fn update_instance(
    state: State<'_, AppState>,
    id: String,
    input: InstanceInput,
) -> Result<Instance, String> {
    with_store(&state, |store| store.update(&id, input))
}
#[tauri::command]
fn toggle_favorite(state: State<'_, AppState>, id: String) -> Result<Instance, String> {
    with_store(&state, |store| store.favorite(&id))
}
#[tauri::command]
fn delete_instance(state: State<'_, AppState>, id: String) -> Result<(), String> {
    with_store(&state, |store| store.delete(&id))
}
#[tauri::command]
fn get_settings(state: State<'_, AppState>) -> Result<Settings, String> {
    with_store(&state, |store| store.settings())
}
#[tauri::command]
fn save_settings(state: State<'_, AppState>, settings: Settings) -> Result<(), String> {
    with_store(&state, |store| store.save_settings(settings))
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
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let root = app.path().app_local_data_dir()?;
            app.manage(Mutex::new(Storage { root, store: None }));
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
