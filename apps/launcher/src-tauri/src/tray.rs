use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager,
};
#[derive(Default)]
pub struct TrayAvailable(pub std::sync::atomic::AtomicBool);
pub fn show(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}
pub fn setup(app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let icon = app
        .default_window_icon()
        .ok_or_else(|| std::io::Error::other("Tray icon unavailable"))?;
    let show_item = MenuItem::with_id(app, "azuria-show", "Open Azuria", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "azuria-quit", "Quit Azuria", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show_item, &quit])?;
    let builder = TrayIconBuilder::with_id("azuria-tray")
        .icon(icon.clone())
        .tooltip("Azuria Launcher")
        .menu(&menu)
        .show_menu_on_left_click(false);
    builder
        .on_tray_icon_event(|tray, event| {
            if matches!(
                event,
                TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                }
            ) {
                show(tray.app_handle());
            }
        })
        .on_menu_event(|app, event| match event.id.as_ref() {
            "azuria-show" => show(app),
            "azuria-quit" => {
                let blocked = app
                    .state::<crate::AppState>()
                    .try_lock()
                    .map(|s| !s.checked || s.acknowledgement_required)
                    .unwrap_or(true);
                if blocked || app.state::<crate::game::Games>().has_active() {
                    show(app);
                    let _ = app.emit("game-close-blocked", ());
                } else {
                    app.exit(0);
                }
            }
            _ => {}
        })
        .build(app)?;
    Ok(())
}
