mod browser;
mod instances;
use azuria_auth::{AccountView, AuthError, AuthService, NativeVault, Progress, Stage, WebProvider};
use azuria_core::{Instance, InstanceInput, Settings, Store};
use std::sync::Mutex;
use tauri::{Emitter, Manager, State};
type Accounts = AuthService<WebProvider, NativeVault>;
fn auth_progress(app: tauri::AppHandle) -> Progress {
    std::sync::Arc::new(move |stage| {
        let _ = app.emit("auth-progress", stage);
    })
}
#[tauri::command]
async fn account_status(state: State<'_, Accounts>) -> Result<AccountView, AuthError> {
    Ok(state.status().await)
}
#[tauri::command]
async fn account_restore(
    state: State<'_, Accounts>,
    app: tauri::AppHandle,
) -> Result<AccountView, AuthError> {
    state.restore(auth_progress(app)).await
}
#[tauri::command]
async fn account_sign_in(
    state: State<'_, Accounts>,
    app: tauri::AppHandle,
) -> Result<AccountView, AuthError> {
    let open = std::sync::Arc::new(|url: &str| {
        // URL originates exclusively in the native PKCE flow, never from IPC.
        #[cfg(windows)]
        {
            browser::open_sign_in(url).map_err(|_| {
                AuthError::new(
                    Stage::Browser,
                    "browser",
                    "Could not open your browser. Check your default browser and retry.",
                )
            })
        }
        #[cfg(not(windows))]
        {
            let _ = url;
            Err(AuthError::new(
                Stage::Browser,
                "platform",
                "Sign-in requires the Windows desktop app.",
            ))
        }
    });
    state.sign_in(open, auth_progress(app)).await
}
#[tauri::command]
async fn account_cancel(state: State<'_, Accounts>) -> Result<AccountView, AuthError> {
    Ok(state.cancel().await)
}
#[tauri::command]
async fn account_sign_out(state: State<'_, Accounts>) -> Result<AccountView, AuthError> {
    state.sign_out().await
}
struct Storage {
    root: std::path::PathBuf,
    store: Option<Store>,
    legacy: std::path::PathBuf,
    checked: bool,
    acknowledgement_required: bool,
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
    if !storage.checked || storage.acknowledgement_required {
        return Err("Confirm the storage migration before using the library.".into());
    }
    action(storage.store.as_mut().expect("storage opened above"))
}
#[tauri::command]
async fn prepare_storage(
    app: tauri::AppHandle,
) -> Result<azuria_core::migration::MigrationStatus, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let mut storage = state
            .lock()
            .map_err(|_| "Storage is unavailable. Restart Azuria.".to_string())?;
        if storage.checked {
            return azuria_core::migration::status(&storage.root);
        }
        let (store, report) = azuria_core::migration::prepare(&storage.legacy, &storage.root)?;
        storage.store = Some(store);
        storage.acknowledgement_required = report.required;
        storage.checked = true;
        Ok(report)
    })
    .await
    .map_err(|e| e.to_string())?
}
// No arbitrary filesystem paths can be opened by the web interface.
fn open_instances(root: &std::path::Path) -> Result<(), String> {
    let path = root.join("instances");
    if !path.is_dir() {
        return Err("The instances folder is unavailable. Retry the migration.".into());
    }
    #[cfg(target_os = "windows")]
    let program = "explorer.exe";
    #[cfg(target_os = "macos")]
    let program = "open";
    #[cfg(target_os = "linux")]
    let program = "xdg-open";
    std::process::Command::new(program)
        .arg(path)
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("Could not open the instances folder: {e}"))
}
#[tauri::command]
fn confirm_storage_migration(state: State<'_, AppState>) -> Result<(), String> {
    let mut storage = state
        .lock()
        .map_err(|_| "Storage is unavailable.".to_string())?;
    if !storage.checked || storage.store.is_none() {
        return Err("Wait for migration to finish first.".into());
    }
    // Acknowledgement does not open File Explorer.
    azuria_core::migration::acknowledge(&storage.root)?;
    storage.acknowledgement_required = false;
    Ok(())
}
#[tauri::command]
fn open_instances_folder(state: State<'_, AppState>) -> Result<(), String> {
    let storage = state
        .lock()
        .map_err(|_| "Storage is unavailable.".to_string())?;
    if !storage.checked || storage.store.is_none() {
        return Err("Wait for migration to finish first.".into());
    }
    open_instances(&storage.root)
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
// Only fixed public metadata sources are reachable through this command.
fn metadata_url(loader: azuria_core::Loader, game: &str) -> Result<String, String> {
    if game.is_empty()
        || game.len() > 40
        || !game.as_bytes()[0].is_ascii_alphanumeric()
        || !game
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || b"._-".contains(&c))
    {
        return Err("Choose a valid game version first.".into());
    }
    let url = match loader {
        azuria_core::Loader::Fabric => {
            format!("https://meta.fabricmc.net/v2/versions/loader/{game}")
        }
        azuria_core::Loader::Quilt => format!("https://meta.quiltmc.org/v3/versions/loader/{game}"),
        azuria_core::Loader::Forge => {
            "https://maven.minecraftforge.net/net/minecraftforge/forge/maven-metadata.xml".into()
        }
        azuria_core::Loader::NeoForge if game == "1.20.1" => {
            "https://maven.neoforged.net/releases/net/neoforged/forge/maven-metadata.xml".into()
        }
        azuria_core::Loader::NeoForge => {
            "https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml".into()
        }
        azuria_core::Loader::Vanilla => return Err("Vanilla does not use a loader version.".into()),
    };
    Ok(url)
}

#[tauri::command]
async fn loader_metadata(loader: azuria_core::Loader, game: String) -> Result<String, String> {
    let url = metadata_url(loader, &game)?;
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .redirect(reqwest::redirect::Policy::none())
        .user_agent("Azuria-Launcher")
        .build()
        .map_err(|e| e.to_string())?;
    let mut response = client
        .get(url)
        .send()
        .await
        .map_err(|_| {
            "Could not reach the loader catalogue. Check your connection and retry.".to_string()
        })?
        .error_for_status()
        .map_err(|_| "The loader catalogue is unavailable. Retry later.".to_string())?;
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|e| e.to_string())? {
        if bytes.len() + chunk.len() > 2 * 1024 * 1024 {
            return Err("Loader catalogue exceeded the size limit.".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    String::from_utf8(bytes).map_err(|_| "Invalid loader catalogue encoding.".into())
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
            let legacy = app.path().app_local_data_dir()?;
            #[cfg(windows)]
            let root = std::path::PathBuf::from(std::env::var_os("APPDATA").ok_or_else(|| {
                std::io::Error::other("Windows AppData location is unavailable.")
            })?)
            .join("AzuriaLauncher");
            #[cfg(not(windows))]
            let root = app.path().data_dir()?.join("AzuriaLauncher");
            app.manage(Mutex::new(Storage {
                root,
                legacy,
                store: None,
                checked: false,
                acknowledgement_required: true,
            }));
            app.manage(Accounts::new(
                WebProvider::new().map_err(|error| std::io::Error::other(error.message))?,
                NativeVault,
            ));
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let state = window.state::<AppState>();
                let blocked = state
                    .try_lock()
                    .map(|s| !s.checked || s.acknowledgement_required)
                    .unwrap_or(true);
                if blocked {
                    api.prevent_close();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            instances::get_launch_defaults,
            instances::save_launch_defaults,
            instances::get_instance_overrides,
            instances::save_instance_overrides,
            instances::instance_entries,
            instances::toggle_instance_content,
            instances::remove_instance_content,
            instances::instance_log,
            instances::open_instance_directory,
            instances::duplicate_instance,
            instances::import_instance_content,
            instances::browse_java,
            instances::detect_java,
            prepare_storage,
            confirm_storage_migration,
            open_instances_folder,
            account_status,
            account_restore,
            account_sign_in,
            account_cancel,
            account_sign_out,
            list_instances,
            create_instance,
            update_instance,
            toggle_favorite,
            delete_instance,
            get_settings,
            save_settings,
            open_project_page,
            loader_metadata
        ])
        .run(tauri::generate_context!())
        .expect("Could not start Azuria Launcher");
}

#[cfg(test)]
mod metadata_tests {
    use super::metadata_url;
    use azuria_core::Loader;
    #[test]
    fn metadata_targets_are_fixed_and_versions_cannot_inject_paths() {
        assert_eq!(
            metadata_url(Loader::Fabric, "1.21.1").unwrap(),
            "https://meta.fabricmc.net/v2/versions/loader/1.21.1"
        );
        assert!(metadata_url(Loader::Quilt, "1.21.1")
            .unwrap()
            .starts_with("https://meta.quiltmc.org/"));
        assert!(metadata_url(Loader::Forge, "1.21.1")
            .unwrap()
            .starts_with("https://maven.minecraftforge.net/"));
        assert!(metadata_url(Loader::NeoForge, "1.20.1")
            .unwrap()
            .contains("/forge/"));
        assert!(metadata_url(Loader::NeoForge, "1.21.1")
            .unwrap()
            .contains("/neoforge/"));
        for version in ["", "../escape", "1.21.1?url=x", "https://example.com"] {
            assert!(metadata_url(Loader::Fabric, version).is_err());
        }
        assert!(metadata_url(Loader::Vanilla, "1.21.1").is_err());
    }
}
