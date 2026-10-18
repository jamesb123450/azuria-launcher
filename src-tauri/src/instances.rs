use crate::{with_store, AppState};
use azuria_core::{
    instance_files::{Entry, Section},
    preferences::{LaunchOptions, LaunchOverrides},
    Instance,
};
use tauri::{Manager, State};
#[tauri::command]
pub fn get_launch_defaults(state: State<'_, AppState>) -> Result<LaunchOptions, String> {
    with_store(&state, |s| s.launch_defaults())
}
#[tauri::command]
pub fn save_launch_defaults(
    state: State<'_, AppState>,
    options: LaunchOptions,
) -> Result<(), String> {
    azuria_core::memory::validate(options.memory_mb)?;
    with_store(&state, |s| s.save_launch_defaults(options))
}
#[tauri::command]
pub fn get_instance_overrides(
    state: State<'_, AppState>,
    id: String,
) -> Result<LaunchOverrides, String> {
    with_store(&state, |s| s.launch_overrides(&id))
}
#[tauri::command]
pub fn save_instance_overrides(
    state: State<'_, AppState>,
    id: String,
    options: LaunchOverrides,
) -> Result<(), String> {
    with_store(&state, |s| {
        azuria_core::memory::validate(options.effective(&s.launch_defaults()?).memory_mb)?;
        s.save_launch_overrides(&id, options)
    })
}
#[tauri::command]
pub fn instance_entries(
    state: State<'_, AppState>,
    id: String,
    section: Section,
) -> Result<Vec<Entry>, String> {
    with_store(&state, |s| s.entries(&id, section))
}
#[tauri::command]
pub fn toggle_instance_content(
    games: State<'_, crate::game::Games>,
    state: State<'_, AppState>,
    id: String,
    section: Section,
    name: String,
) -> Result<(), String> {
    games.with_idle(&id, || {
        with_store(&state, |s| s.toggle_content(&id, section, &name))
    })
}
#[tauri::command]
pub fn remove_instance_content(
    games: State<'_, crate::game::Games>,
    state: State<'_, AppState>,
    id: String,
    section: Section,
    name: String,
) -> Result<(), String> {
    games.with_idle(&id, || {
        with_store(&state, |s| s.trash_content(&id, section, &name))
    })
}
#[tauri::command]
pub fn instance_log(
    state: State<'_, AppState>,
    id: String,
    name: String,
) -> Result<String, String> {
    with_store(&state, |s| s.log_tail(&id, &name))
}
#[tauri::command]
pub fn open_instance_directory(
    state: State<'_, AppState>,
    id: String,
    section: Section,
    name: Option<String>,
) -> Result<(), String> {
    let path = with_store(&state, |s| {
        s.openable_directory(&id, section, name.as_deref())
    })?;
    #[cfg(windows)]
    let program = "explorer.exe";
    #[cfg(target_os = "macos")]
    let program = "open";
    #[cfg(target_os = "linux")]
    let program = "xdg-open";
    std::process::Command::new(program)
        .arg(path)
        .spawn()
        .map(|_| ())
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub async fn duplicate_instance(
    app: tauri::AppHandle,
    id: String,
    include_files: bool,
) -> Result<Instance, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        app.state::<crate::game::Games>().with_idle(&id, || {
            with_store(&state, |s| s.duplicate(&id, include_files))
        })
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn import_instance_content(
    app: tauri::AppHandle,
    id: String,
    section: Section,
) -> Result<(), String> {
    if !matches!(
        section,
        Section::Mods | Section::ResourcePacks | Section::ShaderPacks
    ) {
        return Err("Choose a content section.".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        #[cfg(windows)]
        {
            let extension = if section == Section::Mods {
                "jar"
            } else {
                "zip"
            };
            let Some(file) = rfd::FileDialog::new()
                .add_filter("Minecraft content", &[extension])
                .pick_file()
            else {
                return Ok(());
            };
            let state = app.state::<AppState>();
            app.state::<crate::game::Games>().with_idle(&id, || {
                with_store(&state, |s| s.import_content(&id, section, &file))
            })
        }
        #[cfg(not(windows))]
        {
            let _ = (app, id);
            Err("File import requires the Windows desktop app.".into())
        }
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn browse_java() -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(|| {
        #[cfg(windows)]
        {
            Ok(rfd::FileDialog::new()
                .add_filter("Java executable", &["exe"])
                .pick_file()
                .map(|p| p.display().to_string()))
        }
        #[cfg(not(windows))]
        {
            Err("Java browsing requires the Windows desktop app.".into())
        }
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub fn detect_java() -> Vec<String> {
    let mut candidates = Vec::new();
    if let Some(home) = std::env::var_os("JAVA_HOME") {
        candidates.push(std::path::PathBuf::from(home).join("bin"));
    }
    if let Some(path) = std::env::var_os("PATH") {
        candidates.extend(std::env::split_paths(&path).take(128));
    }
    let mut paths = Vec::new();
    for dir in candidates {
        for name in ["javaw.exe", "java.exe"] {
            let p = dir.join(name);
            if p.is_absolute() && p.is_file() {
                let p = p.display().to_string();
                if !paths.contains(&p) {
                    paths.push(p);
                }
            }
        }
    }
    paths
}
