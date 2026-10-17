use crate::{game::Games, with_store, AppState};
use azuria_content::{Client, Kind, Plan, Preview, Provider, Results, Search, Target, Version};
use serde::Serialize;
use std::{
    collections::BTreeMap,
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc, Mutex,
    },
};
use tauri::{Emitter, Manager};
#[derive(Default)]
pub struct ContentState {
    plans: Mutex<BTreeMap<String, Saved>>,
    job: Mutex<Option<Job>>,
    sequence: AtomicU64,
}
#[derive(Clone)]
struct Saved {
    plan: Plan,
    instance_id: Option<String>,
    name: String,
    world: Option<String>,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    id: String,
    stage: String,
    message: String,
    completed: u64,
    total: u64,
}
struct Job {
    status: Status,
    cancel: Arc<AtomicBool>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderStatus {
    curseforge_configured: bool,
}
#[derive(Serialize)]
pub struct PlanResponse {
    id: String,
    preview: Preview,
}
#[cfg(windows)]
fn vault() -> Result<keyring::Entry, String> {
    keyring::Entry::new("com.azuria.launcher.curseforge", "api")
        .map_err(|_| "Windows Credential Manager is unavailable.".into())
}
fn key() -> Result<Option<String>, String> {
    #[cfg(windows)]
    {
        match vault()?.get_password() {
            Ok(v) => Ok(Some(v)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(_) => {
                Err("Could not read CurseForge access from Windows Credential Manager.".into())
            }
        }
    }
    #[cfg(not(windows))]
    {
        Ok(None)
    }
}
#[tauri::command]
pub fn content_status() -> Result<ProviderStatus, String> {
    Ok(ProviderStatus {
        curseforge_configured: key()?.is_some(),
    })
}
#[tauri::command]
pub fn content_set_curseforge_key(key: Option<String>) -> Result<(), String> {
    #[cfg(windows)]
    {
        if let Some(key) = key {
            let key = key.trim();
            if key.len() < 8 || key.len() > 4096 || !key.bytes().all(|b| b.is_ascii_graphic()) {
                return Err("Enter a valid CurseForge API key.".into());
            }
            vault()?
                .set_password(key)
                .map_err(|_| "Could not save the key in Windows Credential Manager.".into())
        } else {
            match vault()?.delete_credential() {
                Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
                Err(_) => Err("Could not remove the saved CurseForge key.".into()),
            }
        }
    }
    #[cfg(not(windows))]
    {
        let _ = key;
        Err("CurseForge key storage is available in the Windows desktop app.".into())
    }
}
fn instance(
    app: &tauri::AppHandle,
    id: &str,
) -> Result<(azuria_core::Instance, std::path::PathBuf), String> {
    with_store(&app.state::<AppState>(), |s| {
        let item = s
            .list()?
            .into_iter()
            .find(|i| i.id == id)
            .ok_or("Instance no longer exists.")?;
        Ok((item, s.instance_dir(id)?))
    })
}
fn target(item: &azuria_core::Instance) -> Target {
    Target {
        minecraft: item.minecraft_version.clone(),
        loader: match item.loader {
            azuria_core::Loader::Vanilla => "vanilla",
            azuria_core::Loader::Fabric => "fabric",
            azuria_core::Loader::Forge => "forge",
            azuria_core::Loader::NeoForge => "neoforge",
            azuria_core::Loader::Quilt => "quilt",
        }
        .into(),
        loader_version: item.loader_version.clone(),
    }
}
#[tauri::command]
pub async fn content_search(query: Search) -> Result<Results, String> {
    tauri::async_runtime::spawn_blocking(move || {
        Client::new(if query.provider == Provider::Curseforge {
            key()?
        } else {
            None
        })?
        .search(&query)
    })
    .await
    .map_err(|_| "Content search stopped unexpectedly.")?
}
#[tauri::command]
pub async fn content_versions(
    app: tauri::AppHandle,
    provider: Provider,
    project: String,
    kind: Kind,
    instance_id: Option<String>,
) -> Result<Vec<Version>, String> {
    let t = instance_id
        .as_deref()
        .map(|id| instance(&app, id).map(|(i, _)| target(&i)))
        .transpose()?;
    tauri::async_runtime::spawn_blocking(move || {
        Client::new(if provider == Provider::Curseforge {
            key()?
        } else {
            None
        })?
        .versions(provider, &project, t.as_ref(), kind)
    })
    .await
    .map_err(|_| "Version search stopped unexpectedly.")?
}
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn content_plan(
    app: tauri::AppHandle,
    provider: Provider,
    project: String,
    version: String,
    kind: Kind,
    instance_id: Option<String>,
    name: String,
    world: Option<String>,
) -> Result<PlanResponse, String> {
    if kind == Kind::Modpacks && instance_id.is_some() {
        return Err("Modpacks must be installed into a new instance.".into());
    }
    let t = instance_id
        .as_deref()
        .map(|id| instance(&app, id).map(|(i, _)| target(&i)))
        .transpose()?;
    if kind != Kind::Modpacks && t.is_none() {
        return Err("Select an instance first.".into());
    }
    if kind == Kind::Datapacks {
        let (_, root) = instance(&app, instance_id.as_deref().ok_or("Select an instance.")?)?;
        let world = world.as_deref().ok_or("Select a world.")?;
        if world.contains(['/', '\\'])
            || !azuria_launch::safe_join(&root, &format!("saves/{world}"))?.is_dir()
        {
            return Err("The selected world is not available.".into());
        }
    }
    let worker_app = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let plan = Client::new(if provider == Provider::Curseforge {
            key()?
        } else {
            None
        })?
        .plan(
            provider,
            &project,
            &version,
            kind,
            t,
            world.as_deref(),
            &AtomicBool::new(false),
        )?;
        let state = worker_app.state::<ContentState>();
        let id = state.sequence.fetch_add(1, Ordering::Relaxed).to_string();
        let response = PlanResponse {
            id: id.clone(),
            preview: plan.preview(),
        };
        let mut plans = state
            .plans
            .lock()
            .map_err(|_| "Content plans are unavailable.")?;
        while plans.len() >= 2 {
            plans.pop_first();
        }
        plans.insert(
            id,
            Saved {
                plan,
                instance_id,
                name,
                world,
            },
        );
        Ok(response)
    })
    .await
    .map_err(|_| "Content planning stopped unexpectedly.")?
}
fn publish(app: &tauri::AppHandle, status: Status) {
    let state = app.state::<ContentState>();
    let Ok(mut job) = state.job.lock() else {
        return;
    };
    if let Some(job) = job.as_mut() {
        if job.status.id == status.id {
            job.status = status.clone();
            let _ = app.emit("content-progress", status);
        }
    }
}

fn active(stage: &str) -> bool {
    !matches!(stage, "installed" | "error" | "cancelled")
}
#[tauri::command]
pub fn content_job(app: tauri::AppHandle) -> Result<Option<Status>, String> {
    let state = app.state::<ContentState>();
    let job = state
        .job
        .lock()
        .map_err(|_| "Content status is unavailable.")?;
    Ok(job.as_ref().map(|j| j.status.clone()))
}
#[tauri::command]
pub fn content_cancel(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(job) = app
        .state::<ContentState>()
        .job
        .lock()
        .map_err(|_| "Content status is unavailable.")?
        .as_ref()
    {
        job.cancel.store(true, Ordering::Relaxed);
    }
    Ok(())
}
#[tauri::command]
pub fn content_install(app: tauri::AppHandle, plan_id: String) -> Result<(), String> {
    let state = app.state::<ContentState>();
    let mut job = state
        .job
        .lock()
        .map_err(|_| "Content status is unavailable.")?;
    if job.as_ref().is_some_and(|j| active(&j.status.stage)) {
        return Err("Wait for the current content installation to finish.".into());
    }
    let saved = state
        .plans
        .lock()
        .map_err(|_| "Content plans are unavailable.")?
        .remove(&plan_id)
        .ok_or("This install plan expired. Review the version again.")?;
    let reservation = saved
        .instance_id
        .clone()
        .unwrap_or(format!("pack:{plan_id}"));
    app.state::<Games>().reserve_content(&reservation)?;
    let cancel = Arc::new(AtomicBool::new(false));
    let status = Status {
        id: plan_id.clone(),
        stage: "downloading".into(),
        message: "Downloading and verifying content".into(),
        completed: 0,
        total: saved.plan.preview().bytes,
    };
    *job = Some(Job {
        status: status.clone(),
        cancel: cancel.clone(),
    });
    let _ = app.emit("content-progress", status);
    drop(job);
    drop(state);
    tauri::async_runtime::spawn_blocking(move || {
        let total = saved.plan.preview().bytes;
        let result: Result<azuria_core::Instance, String> = (|| {
            let cache = with_store(&app.state::<AppState>(), |s| {
                let instances = s.instances_directory()?;
                Ok(instances
                    .parent()
                    .ok_or("Invalid launcher storage.")?
                    .join("game-cache/content-staging"))
            })?;
            let staged = Client::new(if saved.plan.provider == Provider::Curseforge {
                key()?
            } else {
                None
            })?
            .stage(&saved.plan, &cache, &cancel, &|completed, total| {
                publish(
                    &app,
                    Status {
                        id: plan_id.clone(),
                        stage: "downloading".into(),
                        message: "Downloading and verifying content".into(),
                        completed,
                        total,
                    },
                )
            })?;
            if cancel.load(Ordering::Relaxed) {
                return Err("Content installation cancelled.".into());
            }
            let (item, root) = if let Some(id) = saved.instance_id.as_deref() {
                let data = instance(&app, id)?;
                if target(&data.0) != saved.plan.target {
                    return Err("Instance settings changed after the plan was made. Review the install again.".into());
                }
                data
            } else {
                let input = azuria_core::InstanceInput {
                    name: if saved.name.trim().is_empty() {
                        "Modpack".into()
                    } else {
                        saved.name.trim().into()
                    },
                    minecraft_version: saved.plan.target.minecraft.clone(),
                    loader: match saved.plan.target.loader.as_str() {
                        "fabric" => azuria_core::Loader::Fabric,
                        _ => azuria_core::Loader::Vanilla,
                    },
                    loader_version: saved.plan.target.loader_version.clone(),
                    memory_mb: 4096,
                    icon: None,
                };
                with_store(&app.state::<AppState>(), |s| {
                    let mut input = input;
                    input.memory_mb = s.launch_defaults()?.memory_mb;
                    let item = s.create(input)?;
                    Ok((item.clone(), s.instance_dir(&item.id)?))
                })?
            };
            publish(
                &app,
                Status {
                    id: plan_id.clone(),
                    stage: "installing".into(),
                    message: "Publishing verified instance files".into(),
                    completed: total,
                    total,
                },
            );
            if saved.plan.kind == Kind::Datapacks {
                let world = saved.world.as_deref().ok_or("Choose a world.")?;
                if !azuria_launch::safe_join(&root, &format!("saves/{world}"))?.is_dir() {
                    return Err("The selected world was removed before installation.".into());
                }
            }
            staged.commit(&saved.plan, &root)?;
            Ok(item)
        })();
        app.state::<Games>().release_content(&reservation);
        match result {
            Ok(item) => {
                publish(
                    &app,
                    Status {
                        id: plan_id,
                        stage: "installed".into(),
                        message: "Content installed successfully.".into(),
                        completed: total,
                        total,
                    },
                );
                let _ = app.emit("content-installed", &item);
                if saved.plan.kind == Kind::Modpacks {
                    if let Err(e) = crate::game::prepare_instance(app.clone(), item.id.clone()) {
                        crate::game::preparation_failed(&app, &item.id, &e);
                    }
                }
            }
            Err(error) => publish(
                &app,
                Status {
                    id: plan_id,
                    stage: if cancel.load(Ordering::Relaxed) {
                        "cancelled"
                    } else {
                        "error"
                    }
                    .into(),
                    message: error,
                    completed: 0,
                    total,
                },
            ),
        }
    });
    Ok(())
}
#[tauri::command]
pub fn content_open_url(url: String) -> Result<(), String> {
    let parsed = reqwest::Url::parse(&url).map_err(|_| "Invalid project link.")?;
    if parsed.scheme() != "https"
        || !matches!(
            parsed.host_str(),
            Some("modrinth.com" | "www.curseforge.com")
        )
        || !parsed.username().is_empty()
        || parsed.password().is_some()
        || parsed.port().is_some()
    {
        return Err("Unsupported project link.".into());
    }
    {
        #[cfg(windows)]
        {
            crate::browser::open_sign_in(&url).map_err(str::to_string)
        }
        #[cfg(not(windows))]
        {
            Err("Open provider links from the Windows desktop app.".into())
        }
    }
}
