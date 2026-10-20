use crate::{with_store, AppState};
use tauri::{Manager, State, WebviewUrl, WebviewWindowBuilder};

#[tauri::command]
pub async fn open_game_monitor(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> Result<(), String> {
    // Validate the instance before using its UUID in a window label or local URL.
    with_store(&state, |store| store.instance_dir(&id).map(|_| ()))?;
    let label = format!("monitor-{id}");
    if let Some(window) = app.get_webview_window(&label) {
        window.unminimize().map_err(|e| e.to_string())?;
        return window.set_focus().map_err(|e| e.to_string());
    }
    WebviewWindowBuilder::new(
        &app,
        label,
        WebviewUrl::App(format!("index.html#/monitor/{id}").into()),
    )
    .title("Azuria · Game monitor")
    .inner_size(1280.0, 840.0)
    .min_inner_size(900.0, 650.0)
    .decorations(false)
    .build()
    .map(|_| ())
    .map_err(|e| e.to_string())
}
