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
    expected_target: Option<Target>,
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
fn proxy() -> Option<String> {
    option_env!("AZURIA_CURSEFORGE_PROXY_URL")
        .filter(|v| azuria_content::valid_proxy(v))
        .map(str::to_owned)
}
#[tauri::command]
pub fn content_status() -> Result<ProviderStatus, String> {
    Ok(ProviderStatus {
        curseforge_configured: proxy().as_deref().is_some_and(azuria_content::valid_proxy),
    })
}
/// Remove credentials saved by older builds. No new client-side keys are accepted.
pub fn remove_legacy_key() {
    #[cfg(windows)]
    if let Ok(entry) = keyring::Entry::new("com.azuria.launcher.curseforge", "api") {
        let _ = entry.delete_credential();
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
            proxy()
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
            proxy()
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
        let expected_target = t.clone();
        let plan = Client::new(if provider == Provider::Curseforge {
            proxy()
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
                expected_target,
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
                proxy()
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
                if saved
                    .expected_target
                    .as_ref()
                    .is_some_and(|t| target(&data.0) != *t)
                {
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
            if saved.plan.previous.is_some()
                && saved.plan.kind == Kind::Modpacks
                && item.loader_version != saved.plan.target.loader_version
            {
                return with_store(&app.state::<AppState>(), |s| {
                    s.update(
                        &item.id,
                        azuria_core::InstanceInput {
                            name: item.name.clone(),
                            minecraft_version: item.minecraft_version.clone(),
                            loader: item.loader.clone(),
                            loader_version: saved.plan.target.loader_version.clone(),
                            memory_mb: item.memory_mb,
                            icon: item.icon.clone(),
                        },
                    ).map_err(|e|format!("Content was installed, but the pack loader setting could not be saved: {e}. Use Check for updates and Repair before playing."))
                });
            }
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
        || parsed.host_str().is_none()
        || !parsed.username().is_empty()
        || parsed.password().is_some()
        || parsed.port().is_some()
    {
        return Err("Unsupported project link.".into());
    }
    {
        #[cfg(windows)]
        {
            crate::browser::open_web(&url).map_err(str::to_string)
        }
        #[cfg(not(windows))]
        {
            Err("Open provider links from the Windows desktop app.".into())
        }
    }
}

#[tauri::command]
pub async fn content_project(
    provider: Provider,
    project: String,
) -> Result<azuria_content::ProjectDetails, String> {
    tauri::async_runtime::spawn_blocking(move || {
        Client::new(if provider == Provider::Curseforge {
            proxy()
        } else {
            None
        })?
        .project(provider, &project)
    })
    .await
    .map_err(|_| "Project details stopped unexpectedly.")?
}

#[tauri::command]
pub async fn content_inventory(
    app: tauri::AppHandle,
    id: String,
) -> Result<azuria_content::Inventory, String> {
    let (item, root) = instance(&app, &id)?;
    tauri::async_runtime::spawn_blocking(move || {
        Client::new(proxy())?.inventory(&root, &target(&item))
    })
    .await
    .map_err(|_| "Content update check stopped unexpectedly.")?
}
#[tauri::command]
pub async fn content_update_plan(
    app: tauri::AppHandle,
    id: String,
    provider: Provider,
    project: String,
    requested_version: Option<String>,
) -> Result<PlanResponse, String> {
    let (item, root) = instance(&app, &id)?;
    tauri::async_runtime::spawn_blocking(move || {
        let client = Client::new(proxy())?;
        let inventory = client.inventory(&root, &target(&item))?;
        let installed = inventory.pack.iter().chain(inventory.projects.iter())
            .find(|p| p.provider == provider && p.project.id == project)
            .ok_or("This project is not managed or recognised in this instance.")?;
        let version = requested_version.as_deref().or(installed.latest.as_deref()).unwrap_or(&installed.version);
        if requested_version.is_some() && !client.versions(provider,&project,Some(&target(&item)),installed.kind)?.iter().any(|v|v.id==version) {return Err("This version is not compatible with the instance. Use a separate instance for another Minecraft version or loader.".into());}
        let cancel = AtomicBool::new(false);
        let mut previous = client.plan(provider, &project, &installed.version, installed.kind, Some(target(&item)), None, &cancel)?;
        if let Some(name) = &installed.local_file {
            let folder = if installed.kind == Kind::Mods { "mods" } else { "resourcepacks" };
            if let Some(file) = previous.files.first_mut() {
                file.path = format!("{folder}/{}", name.trim_end_matches(".disabled"));
            }
        }
        let mut plan = if version == installed.version { previous.clone() } else {
            client.plan(provider, &project, version, installed.kind, Some(target(&item)), None, &cancel)?
        };
        if plan.target.minecraft != item.minecraft_version || plan.target.loader != target(&item).loader {
            return Err("This update requires a different Minecraft version or loader. Install it as a new instance to keep your worlds safe.".into());
        }
        plan.previous = Some(Box::new(previous));
        let state = app.state::<ContentState>();
        let plan_id = state.sequence.fetch_add(1, Ordering::Relaxed).to_string();
        let response = PlanResponse { id: plan_id.clone(), preview: plan.preview() };
        let mut plans = state.plans.lock().map_err(|_| "Content plans are unavailable.")?;
        while plans.len() >= 2 { plans.pop_first(); }
        plans.insert(plan_id, Saved { plan, instance_id: Some(id), name: item.name.clone(), world: None, expected_target: Some(target(&item)) });
        Ok(response)
    }).await.map_err(|_| "Content update planning stopped unexpectedly.")?
}

#[tauri::command]
pub async fn content_version(
    provider: Provider,
    project: String,
    version: String,
) -> Result<azuria_content::VersionDetails, String> {
    tauri::async_runtime::spawn_blocking(move || {
        Client::new(if provider == Provider::Curseforge {
            proxy()
        } else {
            None
        })?
        .version_details(provider, &project, &version)
    })
    .await
    .map_err(|_| "Version details stopped unexpectedly.")?
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledPackEntry {
    instance_id: String,
    pack: azuria_content::LocalPack,
}
#[derive(Serialize)]
pub struct InstalledPacks {
    packs: Vec<InstalledPackEntry>,
    unreadable: Vec<String>,
}
#[tauri::command]
pub async fn installed_modpacks(app: tauri::AppHandle) -> Result<InstalledPacks, String> {
    let profiles = with_store(&app.state::<AppState>(), |store| {
        store
            .list()?
            .into_iter()
            .map(|item| Ok((item.id.clone(), store.instance_dir(&item.id)?)))
            .collect::<Result<Vec<_>, String>>()
    })?;
    tauri::async_runtime::spawn_blocking(move || {
        let mut result = InstalledPacks {
            packs: vec![],
            unreadable: vec![],
        };
        for (id, root) in profiles {
            match azuria_content::installed_pack(&root) {
                Ok(Some(pack)) => result.packs.push(InstalledPackEntry {
                    instance_id: id,
                    pack,
                }),
                Ok(None) => {}
                Err(_) => result.unreadable.push(id),
            }
        }
        result
    })
    .await
    .map_err(|_| "Could not read installed modpacks. Try again.".into())
}
