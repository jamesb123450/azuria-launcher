//! Provider metadata is untrusted. Only native, revalidated plans may write instance files.
use azuria_launch::safe_join;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha1::{Digest, Sha1};
use sha2::Sha512;
use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    io::{Read, Write},
    path::Path,
    sync::atomic::{AtomicBool, Ordering},
    time::Duration,
};

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Provider {
    Modrinth,
    Curseforge,
}
#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Kind {
    Mods,
    Modpacks,
    Resourcepacks,
    Datapacks,
}
impl Kind {
    fn mr_type(self) -> &'static str {
        match self {
            Self::Modpacks => "modpack",
            Self::Resourcepacks => "resourcepack",
            _ => "mod",
        }
    }
    fn cf_class(self) -> u64 {
        match self {
            Self::Mods => 6,
            Self::Modpacks => 4471,
            Self::Resourcepacks => 12,
            Self::Datapacks => unreachable!("datapack classes are resolved from the provider"),
        }
    }
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Search {
    pub provider: Provider,
    pub kind: Kind,
    pub query: String,
    pub game_version: String,
    pub loader: String,
    pub category: String,
    pub sort: String,
    pub offset: u64,
    pub limit: u64,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub name: String,
    pub description: String,
    pub author: String,
    pub url: String,
    pub downloads: u64,
    pub categories: Vec<String>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Results {
    pub projects: Vec<Project>,
    pub total: u64,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Version {
    pub id: String,
    pub name: String,
    pub game_versions: Vec<String>,
    pub loaders: Vec<String>,
    pub release_type: String,
}
#[derive(Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Target {
    pub minecraft: String,
    pub loader: String,
    pub loader_version: Option<String>,
}
#[derive(Clone)]
pub struct File {
    pub path: String,
    pub url: Option<String>,
    pub bytes: Option<Vec<u8>>,
    pub sha1: Option<String>,
    pub sha512: Option<String>,
    pub size: u64,
}
#[derive(Clone)]
pub struct Plan {
    pub provider: Provider,
    pub project: String,
    pub version: String,
    pub kind: Kind,
    pub target: Target,
    pub files: Vec<File>,
    pub names: Vec<String>,
    pub projects: BTreeMap<String, String>,
    pub incompatible: Vec<String>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Preview {
    pub files: usize,
    pub bytes: u64,
    pub names: Vec<String>,
    pub target: Target,
}
impl Plan {
    pub fn preview(&self) -> Preview {
        Preview {
            files: self.files.len(),
            bytes: self.files.iter().map(|f| f.size).sum(),
            names: self.names.clone(),
            target: self.target.clone(),
        }
    }
}
fn fail() -> String {
    "The provider returned unsupported or incomplete metadata. Try another version.".into()
}
fn text(v: &Value, key: &str) -> Result<String, String> {
    v[key]
        .as_str()
        .filter(|s| !s.is_empty() && s.len() <= 4096)
        .map(str::to_owned)
        .ok_or_else(fail)
}
fn list(v: &Value) -> Vec<String> {
    v.as_array()
        .map(|a| {
            a.iter()
                .filter_map(Value::as_str)
                .map(str::to_owned)
                .collect()
        })
        .unwrap_or_default()
}
fn id(s: &str) -> Result<(), String> {
    if s.is_empty()
        || s.len() > 128
        || !s
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"_-+.".contains(&b))
    {
        Err("Invalid project or version identifier.".into())
    } else {
        Ok(())
    }
}
fn cancelled(c: &AtomicBool) -> Result<(), String> {
    if c.load(Ordering::Relaxed) {
        Err("Content installation cancelled. Existing files were kept.".into())
    } else {
        Ok(())
    }
}
fn trusted(url: &reqwest::Url) -> bool {
    url.scheme() == "https"
        && url.username().is_empty()
        && url.password().is_none()
        && url.port().is_none()
        && matches!(
            url.host_str(),
            Some(
                "api.modrinth.com"
                    | "cdn.modrinth.com"
                    | "api.curseforge.com"
                    | "edge.forgecdn.net"
                    | "mediafilez.forgecdn.net"
            )
        )
}
pub struct Client {
    http: reqwest::blocking::Client,
    key: Option<String>,
}
impl Client {
    pub fn new(key: Option<String>) -> Result<Self, String> {
        let _ = rustls::crypto::ring::default_provider().install_default();
        Ok(Self {
            http: reqwest::blocking::Client::builder()
                .https_only(true)
                .redirect(reqwest::redirect::Policy::none())
                .connect_timeout(Duration::from_secs(15))
                .timeout(Duration::from_secs(120))
                .user_agent("Azuria-Launcher/0.2.1 (github.com/jamesb123450/azuria-launcher)")
                .build()
                .map_err(|_| "Could not initialise content downloads.")?,
            key,
        })
    }
    fn response(&self, url: &str) -> Result<reqwest::blocking::Response, String> {
        let mut url = reqwest::Url::parse(url).map_err(|_| fail())?;
        for _ in 0..6 {
            if !trusted(&url) {
                return Err("This content uses an unsupported download host.".into());
            }
            let cf = matches!(
                url.host_str(),
                Some("api.curseforge.com" | "edge.forgecdn.net" | "mediafilez.forgecdn.net")
            );
            let mut req = self.http.get(url.clone());
            if cf {
                req=req.header("x-api-key",self.key.as_deref().ok_or("CurseForge API access is not configured. Open Settings → Content providers.")?);
            }
            let response = req.send().map_err(|_| {
                "Could not reach the content provider. Check your connection and retry."
            })?;
            if response.status().is_redirection() {
                let location = response
                    .headers()
                    .get("location")
                    .and_then(|v| v.to_str().ok())
                    .ok_or_else(fail)?;
                url = url.join(location).map_err(|_| fail())?;
                continue;
            }
            return match response.status().as_u16(){200=>Ok(response),401|403=>Err("The provider denied this request. Check API access and the author's distribution settings.".into()),429=>Err("The provider rate limit was reached. Wait a moment before retrying.".into()),_=>Err(format!("The content provider returned HTTP {}. Retry or choose another file.",response.status().as_u16()))};
        }
        Err("Too many provider redirects.".into())
    }
    fn json(&self, url: &str) -> Result<Value, String> {
        let mut bytes = vec![];
        self.response(url)?
            .take(16 * 1024 * 1024 + 1)
            .read_to_end(&mut bytes)
            .map_err(|_| fail())?;
        if bytes.len() > 16 * 1024 * 1024 {
            return Err("Provider metadata exceeded its size limit.".into());
        }
        serde_json::from_slice(&bytes).map_err(|_| fail())
    }
    fn mr(&self, path: &str, params: &[(&str, String)]) -> Result<Value, String> {
        let mut url = reqwest::Url::parse(&format!("https://api.modrinth.com/v2/{path}"))
            .map_err(|_| fail())?;
        url.query_pairs_mut()
            .extend_pairs(params.iter().map(|(k, v)| (*k, v.as_str())));
        self.json(url.as_str())
    }
    fn cf(&self, path: &str, params: &[(&str, String)]) -> Result<Value, String> {
        let mut url = reqwest::Url::parse(&format!("https://api.curseforge.com/v1/{path}"))
            .map_err(|_| fail())?;
        url.query_pairs_mut()
            .extend_pairs(params.iter().map(|(k, v)| (*k, v.as_str())));
        self.json(url.as_str())
    }
    pub fn search(&self, q: &Search) -> Result<Results, String> {
        if q.query.len() > 256
            || q.category.len() > 80
            || q.offset > 10000
            || q.limit == 0
            || q.limit > 24
        {
            return Err("Search is outside the supported limits.".into());
        }
        let data = match q.provider {
            Provider::Modrinth => {
                let mut facets = vec![vec![format!("project_type:{}", q.kind.mr_type())]];
                if q.kind == Kind::Datapacks {
                    facets.push(vec!["categories:datapack".into()]);
                }
                if !q.game_version.is_empty() {
                    id(&q.game_version)?;
                    facets.push(vec![format!("versions:{}", q.game_version)]);
                }
                if !q.loader.is_empty() {
                    id(&q.loader)?;
                    facets.push(vec![format!("categories:{}", q.loader)]);
                }
                if !q.category.is_empty() {
                    facets.push(vec![format!("categories:{}", q.category)]);
                }
                self.mr(
                    "search",
                    &[
                        ("query", q.query.clone()),
                        ("facets", json!(facets).to_string()),
                        (
                            "index",
                            match q.sort.as_str() {
                                "downloads" => "downloads",
                                "updated" => "updated",
                                _ => "relevance",
                            }
                            .into(),
                        ),
                        ("offset", q.offset.to_string()),
                        ("limit", q.limit.to_string()),
                    ],
                )?
            }
            Provider::Curseforge => {
                let class = if q.kind == Kind::Datapacks {
                    let classes = self.cf(
                        "categories",
                        &[("gameId", "432".into()), ("classesOnly", "true".into())],
                    )?;
                    classes["data"]
                        .as_array()
                        .and_then(|a| {
                            a.iter().find(|c| {
                                matches!(c["slug"].as_str(), Some("data-packs" | "datapacks"))
                            })
                        })
                        .and_then(|c| c["id"].as_u64())
                        .ok_or("CurseForge datapacks are unavailable.")?
                } else {
                    q.kind.cf_class()
                };
                let mut p = vec![
                    ("gameId", "432".into()),
                    ("classId", class.to_string()),
                    ("searchFilter", q.query.clone()),
                    ("index", q.offset.to_string()),
                    ("pageSize", q.limit.to_string()),
                    ("sortOrder", "desc".into()),
                    (
                        "sortField",
                        match q.sort.as_str() {
                            "downloads" => "6",
                            "updated" => "3",
                            _ => "2",
                        }
                        .into(),
                    ),
                ];
                if !q.game_version.is_empty() {
                    p.push(("gameVersion", q.game_version.clone()));
                }
                if !q.loader.is_empty() {
                    p.push(("modLoaderType", cf_loader(&q.loader)?.to_string()));
                }
                if !q.category.is_empty() {
                    let categories = self.cf("categories", &[("gameId", "432".into())])?;
                    let category = categories["data"]
                        .as_array()
                        .and_then(|a| {
                            a.iter().find(|c| {
                                c["slug"].as_str() == Some(&q.category)
                                    || c["name"].as_str() == Some(&q.category)
                            })
                        })
                        .and_then(|c| c["id"].as_u64())
                        .ok_or("This provider category is unavailable.")?;
                    p.push(("categoryId", category.to_string()));
                }
                self.cf("mods/search", &p)?
            }
        };
        let projects = match q.provider {
            Provider::Modrinth => data["hits"]
                .as_array()
                .ok_or_else(fail)?
                .iter()
                .map(|p| {
                    Ok(Project {
                        id: text(p, "project_id")?,
                        name: text(p, "title")?,
                        description: p["description"]
                            .as_str()
                            .unwrap_or("")
                            .chars()
                            .take(1024)
                            .collect(),
                        author: p["author"].as_str().unwrap_or("").into(),
                        url: format!(
                            "https://modrinth.com/{}/{}",
                            q.kind.mr_type(),
                            text(p, "slug")?
                        ),
                        downloads: p["downloads"].as_u64().unwrap_or(0),
                        categories: list(&p["categories"]),
                    })
                })
                .collect::<Result<Vec<_>, String>>()?,
            Provider::Curseforge => data["data"]
                .as_array()
                .ok_or_else(fail)?
                .iter()
                .map(|p| {
                    Ok(Project {
                        id: p["id"].as_u64().ok_or_else(fail)?.to_string(),
                        name: text(p, "name")?,
                        description: p["summary"]
                            .as_str()
                            .unwrap_or("")
                            .chars()
                            .take(1024)
                            .collect(),
                        author: p["authors"]
                            .as_array()
                            .and_then(|a| a.first())
                            .and_then(|a| a["name"].as_str())
                            .unwrap_or("")
                            .into(),
                        url: text(&p["links"], "websiteUrl")?,
                        downloads: p["downloadCount"].as_f64().unwrap_or(0.0) as u64,
                        categories: p["categories"]
                            .as_array()
                            .map(|a| {
                                a.iter()
                                    .filter_map(|c| c["name"].as_str())
                                    .map(str::to_owned)
                                    .collect()
                            })
                            .unwrap_or_default(),
                    })
                })
                .collect::<Result<Vec<_>, String>>()?,
        };
        Ok(Results {
            projects,
            total: if q.provider == Provider::Modrinth {
                data["total_hits"].as_u64()
            } else {
                data["pagination"]["totalCount"].as_u64()
            }
            .unwrap_or(0),
        })
    }
    fn raw_versions(
        &self,
        provider: Provider,
        project: &str,
        target: Option<&Target>,
        kind: Kind,
    ) -> Result<Vec<Value>, String> {
        id(project)?;
        let data = match provider {
            Provider::Modrinth => {
                let mut p = vec![("include_changelog", "false".into())];
                if let Some(t) = target {
                    p.push(("game_versions", json!([t.minecraft]).to_string()));
                    p.push(("loaders", json!([mr_loader(kind, t)]).to_string()));
                }
                self.mr(&format!("project/{project}/version"), &p)?
            }
            Provider::Curseforge => {
                let mut p = vec![("pageSize", "50".into())];
                if let Some(t) = target {
                    p.push(("gameVersion", t.minecraft.clone()));
                    if kind == Kind::Mods {
                        p.push(("modLoaderType", cf_loader(&t.loader)?.to_string()));
                    }
                }
                self.cf(&format!("mods/{project}/files"), &p)?["data"].clone()
            }
        };
        Ok(data
            .as_array()
            .ok_or_else(fail)?
            .iter()
            .take(256)
            .cloned()
            .collect())
    }
    pub fn versions(
        &self,
        provider: Provider,
        project: &str,
        target: Option<&Target>,
        kind: Kind,
    ) -> Result<Vec<Version>, String> {
        Ok(self
            .raw_versions(provider, project, target, kind)?
            .iter()
            .map(|v| version(provider, v))
            .collect::<Result<Vec<_>, _>>()?
            .into_iter()
            .filter(|v| target.is_none_or(|t| compatible(provider, kind, t, v)))
            .collect())
    }
    fn raw_version(
        &self,
        provider: Provider,
        project: &str,
        version: &str,
    ) -> Result<Value, String> {
        id(project)?;
        id(version)?;
        match provider {
            Provider::Modrinth => {
                let v = self.mr(&format!("version/{version}"), &[])?;
                if v["project_id"].as_str() != Some(project) {
                    return Err("This version does not belong to the selected project.".into());
                }
                Ok(v)
            }
            Provider::Curseforge => {
                let p = self.cf(&format!("mods/{project}"), &[])?;
                if p["data"]["allowModDistribution"].as_bool() == Some(false) {
                    return Err("The author does not allow third-party distribution. Open the project on CurseForge.".into());
                }
                let v = self.cf(&format!("mods/{project}/files/{version}"), &[])?["data"].clone();
                if v["modId"].as_u64().map(|id| id.to_string()).as_deref() != Some(project) {
                    return Err(fail());
                }
                Ok(v)
            }
        }
    }
    #[allow(clippy::too_many_arguments)]
    pub fn plan(
        &self,
        provider: Provider,
        project: &str,
        selected: &str,
        kind: Kind,
        target: Option<Target>,
        world: Option<&str>,
        cancel: &AtomicBool,
    ) -> Result<Plan, String> {
        cancelled(cancel)?;
        let raw = self.raw_version(provider, project, selected)?;
        if kind == Kind::Modpacks {
            return self.pack(provider, project, selected, &raw, cancel);
        }
        let target = target.ok_or("Select an instance first.")?;
        let mut plan = Plan {
            provider,
            project: project.into(),
            version: selected.into(),
            kind,
            target,
            files: vec![],
            names: vec![],
            projects: BTreeMap::new(),
            incompatible: vec![],
        };
        let mut seen = BTreeMap::new();
        self.resolve(&mut plan, project, selected, kind, world, &mut seen, cancel)?;
        if plan.incompatible.iter().any(|id| seen.contains_key(id)) {
            return Err("This project's required dependencies conflict with each other.".into());
        }
        plan.projects = seen;
        unique(&plan.files)?;
        Ok(plan)
    }
    #[allow(clippy::too_many_arguments)]
    fn resolve(
        &self,
        plan: &mut Plan,
        project: &str,
        selected: &str,
        kind: Kind,
        world: Option<&str>,
        seen: &mut BTreeMap<String, String>,
        cancel: &AtomicBool,
    ) -> Result<(), String> {
        cancelled(cancel)?;
        if let Some(v) = seen.get(project) {
            return if v == selected {
                Ok(())
            } else {
                Err("Required dependencies select conflicting versions of the same project.".into())
            };
        }
        if seen.len() >= 128 {
            return Err("Too many required dependencies.".into());
        }
        seen.insert(project.into(), selected.into());
        let raw = self.raw_version(plan.provider, project, selected)?;
        let ver = version(plan.provider, &raw)?;
        if !compatible(plan.provider, kind, &plan.target, &ver) {
            return Err(
                "This file is not compatible with the selected Minecraft version and loader."
                    .into(),
            );
        }
        plan.names.push(ver.name);
        let folder = match kind {
            Kind::Mods => "mods".into(),
            Kind::Resourcepacks => "resourcepacks".into(),
            Kind::Datapacks => {
                let world = world.ok_or("Choose a world for this datapack.")?;
                if world.contains(['/', '\\']) {
                    return Err("Invalid world folder.".into());
                }
                safe_join(Path::new("/validation"), world)?;
                format!("saves/{world}/datapacks")
            }
            Kind::Modpacks => return Err(fail()),
        };
        let f = primary(plan.provider, &raw)?;
        let name = text(&f, "filename")?;
        safe_join(Path::new("/validation"), &name)?;
        if name.contains('/')
            || !(if kind == Kind::Mods {
                name.ends_with(".jar")
            } else {
                name.ends_with(".zip")
            })
        {
            return Err("Unsupported content file type.".into());
        }
        let mut f = file(plan.provider, &f)?;
        f.path = format!("{folder}/{name}");
        plan.files.push(f);
        if let Some(deps) = raw["dependencies"].as_array() {
            for dep in deps {
                let required = if plan.provider == Provider::Modrinth {
                    dep["dependency_type"] == "required"
                } else {
                    dep["relationType"] == 3
                };
                let incompatible = if plan.provider == Provider::Modrinth {
                    dep["dependency_type"] == "incompatible"
                } else {
                    dep["relationType"] == 5
                };
                if incompatible {
                    if let Some(p) = dep["project_id"].as_str() {
                        id(p)?;
                        plan.incompatible.push(p.into());
                    } else if let Some(p) = dep["modId"].as_u64() {
                        plan.incompatible.push(p.to_string());
                    } else if let Some(v) = dep["version_id"].as_str() {
                        id(v)?;
                        let raw = self.mr(&format!("version/{v}"), &[])?;
                        plan.incompatible.push(text(&raw, "project_id")?);
                    }
                }
                if !required {
                    continue;
                }
                let (pid, vid) = if plan.provider == Provider::Modrinth {
                    (
                        dep["project_id"].as_str().map(str::to_owned),
                        dep["version_id"].as_str().map(str::to_owned),
                    )
                } else {
                    (dep["modId"].as_u64().map(|v| v.to_string()), None)
                };
                let (pid, vid) = match (pid, vid) {
                    (p, Some(v)) => {
                        id(&v)?;
                        let raw = if let Some(p) = p {
                            self.raw_version(plan.provider, &p, &v)?
                        } else {
                            self.mr(&format!("version/{v}"), &[])?
                        };
                        (text(&raw, "project_id")?, v)
                    }
                    (Some(p), None) => {
                        let options = self.versions(plan.provider, &p, Some(&plan.target), kind)?;
                        let selected = options.iter().find(|v| v.release_type == "release")
                            .or(options.first()).ok_or("A required dependency has no compatible file.")?;
                        (p, selected.id.clone())
                    }
                    _ => return Err("A required dependency must be installed manually; this project was not installed.".into()),
                };
                self.resolve(plan, &pid, &vid, kind, world, seen, cancel)?;
            }
        }
        Ok(())
    }
    fn transfer(
        &self,
        f: &File,
        path: &Path,
        cancel: &AtomicBool,
        progress: &dyn Fn(u64),
    ) -> Result<(), String> {
        cancelled(cancel)?;
        if f.size > 512 * 1024 * 1024 {
            return Err("A content file exceeds the 512 MiB limit.".into());
        }
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(io)?;
        }
        let mut out = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(path)
            .map_err(io)?;
        if let Some(bytes) = &f.bytes {
            out.write_all(bytes).map_err(io)?;
        } else {
            let mut response = self.response(f.url.as_deref().ok_or_else(fail)?)?;
            let mut buf = [0; 65536];
            let mut count = 0;
            loop {
                cancelled(cancel)?;
                let n = response
                    .read(&mut buf)
                    .map_err(|_| "Content download was interrupted.")?;
                if n == 0 {
                    break;
                }
                count += n as u64;
                if count > f.size || count > 512 * 1024 * 1024 {
                    return Err("The file exceeded its declared size.".into());
                }
                out.write_all(&buf[..n]).map_err(io)?;
                progress(count);
            }
        }
        out.sync_all().map_err(io)?;
        drop(out);
        if !verify(path, f)? {
            return Err(
                "Content checksum verification failed. No instance files were installed.".into(),
            );
        }
        Ok(())
    }
    fn pack(
        &self,
        provider: Provider,
        project: &str,
        selected: &str,
        raw: &Value,
        cancel: &AtomicBool,
    ) -> Result<Plan, String> {
        let archive_file = file(provider, &primary(provider, raw)?)?;
        if archive_file.size > 256 * 1024 * 1024 {
            return Err("The pack archive exceeds the 256 MiB limit.".into());
        }
        let dir = tempfile::tempdir().map_err(io)?;
        let archive = dir.path().join("pack.zip");
        self.transfer(&archive_file, &archive, cancel, &|_| {})?;
        let mut zip = zip::ZipArchive::new(fs::File::open(archive).map_err(io)?)
            .map_err(|_| "The modpack is not a valid archive.")?;
        if zip.len() > 10000 {
            return Err("The modpack contains too many entries.".into());
        }
        let index_name = if provider == Provider::Modrinth {
            "modrinth.index.json"
        } else {
            "manifest.json"
        };
        let index: Value =
            serde_json::from_slice(&zip_bytes(&mut zip, index_name, 8 * 1024 * 1024)?)
                .map_err(|_| "Invalid modpack manifest.")?;
        let target = pack_target(provider, &index)?;
        if !matches!(target.loader.as_str(), "vanilla" | "fabric") {
            return Err("This pack requires a loader Azuria cannot launch yet. Choose a Vanilla or Fabric pack.".into());
        }
        let mut plan = Plan {
            provider,
            project: project.into(),
            version: selected.into(),
            kind: Kind::Modpacks,
            target,
            files: vec![],
            names: vec![index["name"].as_str().unwrap_or("Modpack").into()],
            projects: BTreeMap::from([(project.into(), selected.into())]),
            incompatible: vec![],
        };
        let files = index["files"]
            .as_array()
            .filter(|f| f.len() <= 4096)
            .ok_or("Invalid modpack file list.")?;
        for entry in files {
            cancelled(cancel)?;
            if provider == Provider::Modrinth {
                if matches!(
                    entry["env"]["client"].as_str(),
                    Some("unsupported" | "optional")
                ) {
                    continue;
                }
                let path = text(entry, "path")?;
                allowed_path(&path)?;
                let url=entry["downloads"].as_array().and_then(|a|a.iter().filter_map(Value::as_str).find(|s|reqwest::Url::parse(s).is_ok_and(|u|trusted(&u)&&u.host_str()==Some("cdn.modrinth.com")))).ok_or("A modpack file uses an unsupported download host. No pack files were installed.")?;
                let mut f = file(
                    Provider::Modrinth,
                    &json!({"url":url,"filename":"pack-file","size":entry["fileSize"],"hashes":entry["hashes"]}),
                )?;
                f.path = path;
                plan.files.push(f);
            } else {
                if entry["required"].as_bool() == Some(false) {
                    continue;
                }
                let pid = entry["projectID"].as_u64().ok_or_else(fail)?.to_string();
                let vid = entry["fileID"].as_u64().ok_or_else(fail)?.to_string();
                let meta = self.cf(&format!("mods/{pid}"), &[])?;
                let folder = match meta["data"]["classId"].as_u64() {
                    Some(6) => "mods",
                    Some(12) => "resourcepacks",
                    _ => return Err(
                        "This CurseForge pack contains a content type Azuria cannot install yet."
                            .into(),
                    ),
                };
                if plan.projects.insert(pid.clone(), vid.clone()).is_some() {
                    return Err("The pack declares multiple files from one project.".into());
                }
                let raw = self.raw_version(provider, &pid, &vid)?;
                if !list(&raw["gameVersions"]).contains(&plan.target.minecraft) {
                    return Err(
                        "A CurseForge pack file does not match its Minecraft version.".into(),
                    );
                }
                let mut f = file(provider, &primary(provider, &raw)?)?;
                f.path = format!("{folder}/{}", text(&primary(provider, &raw)?, "filename")?);
                allowed_path(&f.path)?;
                plan.files.push(f);
            }
        }
        let prefix = if provider == Provider::Modrinth {
            "overrides".into()
        } else {
            index["overrides"]
                .as_str()
                .unwrap_or("overrides")
                .to_string()
        };
        id(&prefix)?;
        let mut overrides = BTreeMap::new();
        let mut override_bytes = 0u64;
        // Validate every archive path, including ignored server files. Never extract symlinks.
        for n in 0..zip.len() {
            let e = zip.by_index(n).map_err(|_| fail())?;
            let name = e.name().trim_end_matches('/').to_string();
            if !name.is_empty() {
                safe_join(Path::new("/validation"), &name)?;
            }
            if e.unix_mode().is_some_and(|m| m & 0o170000 == 0o120000) {
                return Err("Linked modpack entries are not supported.".into());
            }
        }
        for layer in [prefix.as_str(), "client-overrides"] {
            for n in 0..zip.len() {
                cancelled(cancel)?;
                let mut e = zip.by_index(n).map_err(|_| fail())?;
                if e.is_dir() {
                    continue;
                }
                let Some(path) = e
                    .name()
                    .strip_prefix(&format!("{layer}/"))
                    .map(str::to_owned)
                else {
                    continue;
                };
                allowed_path(&path)?;
                override_bytes = override_bytes.checked_add(e.size()).ok_or_else(fail)?;
                if e.size() > 32 * 1024 * 1024 || override_bytes > 128 * 1024 * 1024 {
                    return Err("Modpack overrides exceed the supported size limit.".into());
                }
                let mut bytes = vec![];
                e.by_ref()
                    .take(32 * 1024 * 1024 + 1)
                    .read_to_end(&mut bytes)
                    .map_err(io)?;
                if bytes.len() as u64 != e.size() {
                    return Err("Modpack override extraction failed its size check.".into());
                }
                overrides.insert(path, bytes);
            }
        }
        for (path, bytes) in overrides {
            if plan
                .files
                .iter()
                .any(|f| f.path.eq_ignore_ascii_case(&path))
            {
                return Err(
                    "The modpack declares conflicting downloaded files and overrides.".into(),
                );
            }
            let size = bytes.len() as u64;
            let sha512 = Some(format!("{:x}", Sha512::digest(&bytes)));
            plan.files.push(File {
                path,
                url: None,
                bytes: Some(bytes),
                sha1: None,
                sha512,
                size,
            });
        }
        unique(&plan.files)?;
        Ok(plan)
    }
    pub fn stage(
        &self,
        plan: &Plan,
        root: &Path,
        cancel: &AtomicBool,
        progress: &dyn Fn(u64, u64),
    ) -> Result<Staged, String> {
        unique(&plan.files)?;
        fs::create_dir_all(root).map_err(io)?;
        safe_join(root, "check")?;
        let dir = tempfile::Builder::new()
            .prefix("content-")
            .tempdir_in(root)
            .map_err(io)?;
        let total = plan.files.iter().map(|f| f.size).sum();
        let mut done = 0;
        for f in &plan.files {
            cancelled(cancel)?;
            let path = safe_join(dir.path(), &f.path)?;
            self.transfer(f, &path, cancel, &|n| progress(done + n, total))?;
            done += f.size;
            progress(done, total);
        }
        Ok(Staged { dir })
    }
}
fn io(_: impl std::fmt::Display) -> String {
    "Could not write content files. Check disk space, permissions and antivirus access.".into()
}
fn cf_loader(loader: &str) -> Result<u64, String> {
    match loader.to_ascii_lowercase().as_str() {
        "forge" => Ok(1),
        "fabric" => Ok(4),
        "quilt" => Ok(5),
        "neoforge" => Ok(6),
        _ => Err("Select a supported mod loader.".into()),
    }
}
fn mr_loader(kind: Kind, t: &Target) -> &str {
    match kind {
        Kind::Datapacks => "datapack",
        Kind::Resourcepacks => "minecraft",
        _ => &t.loader,
    }
}
fn version(provider: Provider, v: &Value) -> Result<Version, String> {
    if provider == Provider::Modrinth {
        Ok(Version {
            id: text(v, "id")?,
            name: text(v, "name")?,
            game_versions: list(&v["game_versions"]),
            loaders: list(&v["loaders"]),
            release_type: v["version_type"].as_str().unwrap_or("release").into(),
        })
    } else {
        let games = list(&v["gameVersions"]);
        Ok(Version {
            id: v["id"].as_u64().ok_or_else(fail)?.to_string(),
            name: text(v, "displayName")?,
            loaders: games
                .iter()
                .map(|s| s.to_ascii_lowercase())
                .filter(|s| matches!(s.as_str(), "forge" | "fabric" | "quilt" | "neoforge"))
                .collect(),
            game_versions: games,
            release_type: match v["releaseType"].as_u64() {
                Some(1) => "release",
                Some(2) => "beta",
                _ => "alpha",
            }
            .into(),
        })
    }
}
fn compatible(provider: Provider, kind: Kind, t: &Target, v: &Version) -> bool {
    v.game_versions.contains(&t.minecraft)
        && (kind == Kind::Modpacks
            || if provider == Provider::Modrinth {
                v.loaders.contains(&mr_loader(kind, t).into())
            } else {
                kind != Kind::Mods || v.loaders.contains(&t.loader)
            })
}
fn primary(provider: Provider, v: &Value) -> Result<Value, String> {
    if provider == Provider::Modrinth {
        let files = v["files"].as_array().ok_or_else(fail)?;
        files
            .iter()
            .find(|f| f["primary"].as_bool() == Some(true))
            .or(files.first())
            .cloned()
            .ok_or_else(fail)
    } else {
        let hash = v["hashes"]
            .as_array()
            .and_then(|a| a.iter().find(|h| h["algo"] == 1))
            .and_then(|h| h["value"].as_str())
            .ok_or("The CurseForge file has no SHA-1 verification hash.")?;
        Ok(
            json!({"filename":v["fileName"],"url":v["downloadUrl"],"size":v["fileLength"],"hashes":{"sha1":hash}}),
        )
    }
}
fn file(_: Provider, v: &Value) -> Result<File, String> {
    let sha1 = v["hashes"]["sha1"].as_str().map(str::to_owned);
    let sha512 = v["hashes"]["sha512"].as_str().map(str::to_owned);
    if sha1.is_none() && sha512.is_none() {
        return Err("This file has no supported verification hash.".into());
    }
    for (h, len) in [(&sha1, 40), (&sha512, 128)] {
        if h.as_ref()
            .is_some_and(|s| s.len() != len || !s.bytes().all(|b| b.is_ascii_hexdigit()))
        {
            return Err("Invalid content verification hash.".into());
        }
    }
    let url=text(v,"url").map_err(|_|"The author has not provided a third-party download. Open the project on its provider website.")?;
    if !reqwest::Url::parse(&url).is_ok_and(|u| {
        trusted(&u)
            && matches!(
                u.host_str(),
                Some("cdn.modrinth.com" | "edge.forgecdn.net" | "mediafilez.forgecdn.net")
            )
    }) {
        return Err("Unsupported content download host.".into());
    }
    Ok(File {
        path: String::new(),
        url: Some(url),
        bytes: None,
        sha1,
        sha512,
        size: v["size"]
            .as_u64()
            .filter(|s| *s <= 512 * 1024 * 1024)
            .ok_or("Invalid content file size.")?,
    })
}
fn allowed_path(path: &str) -> Result<(), String> {
    safe_join(Path::new("/validation"), path)?;
    let lower = path.to_ascii_lowercase();
    let first = lower.split('/').next().unwrap_or("");
    if first.starts_with('.')
        || path.chars().any(char::is_control)
        || [".exe", ".dll", ".bat", ".cmd", ".ps1", ".sh", ".lnk"]
            .iter()
            .any(|ext| lower.ends_with(ext))
    {
        return Err("A pack attempts to write an unsupported instance path.".into());
    }
    Ok(())
}
fn unique(files: &[File]) -> Result<(), String> {
    if files.is_empty()
        || files.len() > 8192
        || files.iter().map(|f| f.size).sum::<u64>() > 4 * 1024 * 1024 * 1024
    {
        return Err("The install exceeds supported content limits.".into());
    }
    let mut paths = BTreeSet::new();
    for f in files {
        allowed_path(&f.path)?;
        if !paths.insert(f.path.to_ascii_lowercase()) {
            return Err("Multiple content files use the same path.".into());
        }
    }
    Ok(())
}
fn verify(path: &Path, f: &File) -> Result<bool, String> {
    if f.sha1.is_none() && f.sha512.is_none() {
        return Err("Missing content verification hash.".into());
    }
    if !path.exists() {
        return Ok(false);
    }
    safe_join(
        path.parent().ok_or_else(fail)?,
        path.file_name().and_then(|s| s.to_str()).ok_or_else(fail)?,
    )?;
    let mut file = fs::File::open(path).map_err(io)?;
    if file.metadata().map_err(io)?.len() != f.size {
        return Ok(false);
    }
    let mut a = Sha1::new();
    let mut b = Sha512::new();
    let mut buf = [0; 65536];
    loop {
        let n = file.read(&mut buf).map_err(io)?;
        if n == 0 {
            break;
        }
        a.update(&buf[..n]);
        b.update(&buf[..n]);
    }
    Ok(f.sha1
        .as_ref()
        .is_none_or(|h| format!("{:x}", a.finalize()).eq_ignore_ascii_case(h))
        && f.sha512
            .as_ref()
            .is_none_or(|h| format!("{:x}", b.finalize()).eq_ignore_ascii_case(h)))
}
fn zip_bytes<R: Read + std::io::Seek>(
    zip: &mut zip::ZipArchive<R>,
    name: &str,
    max: u64,
) -> Result<Vec<u8>, String> {
    let mut entry = zip
        .by_name(name)
        .map_err(|_| "The modpack manifest is missing.")?;
    if entry.size() > max {
        return Err("Modpack manifest is too large.".into());
    }
    let mut bytes = vec![];
    entry
        .by_ref()
        .take(max + 1)
        .read_to_end(&mut bytes)
        .map_err(io)?;
    if bytes.len() as u64 > max {
        return Err("Modpack manifest is too large.".into());
    }
    Ok(bytes)
}
fn pack_target(provider: Provider, index: &Value) -> Result<Target, String> {
    if provider == Provider::Modrinth {
        if index["formatVersion"] != 1 || index["game"] != "minecraft" {
            return Err("Unsupported Modrinth pack format.".into());
        }
        let d = &index["dependencies"];
        let mut target = Target {
            minecraft: text(d, "minecraft")?,
            loader: "vanilla".into(),
            loader_version: None,
        };
        for (key, loader) in [
            ("fabric-loader", "fabric"),
            ("forge", "forge"),
            ("neoforge", "neoforge"),
            ("quilt-loader", "quilt"),
        ] {
            if let Some(v) = d[key].as_str() {
                if target.loader != "vanilla" {
                    return Err("Multiple loaders in pack manifest.".into());
                }
                id(v)?;
                target.loader = loader.into();
                target.loader_version = Some(v.into());
            }
        }
        id(&target.minecraft)?;
        Ok(target)
    } else {
        let minecraft = &index["minecraft"];
        let mut target = Target {
            minecraft: text(minecraft, "version")?,
            loader: "vanilla".into(),
            loader_version: None,
        };
        if let Some(loaders) = minecraft["modLoaders"].as_array() {
            if let Some(primary) = loaders
                .iter()
                .find(|v| v["primary"].as_bool() == Some(true))
                .or(loaders.first())
            {
                let loader = text(primary, "id")?;
                let (name, version) = loader.split_once('-').ok_or_else(fail)?;
                id(version)?;
                target.loader = name.into();
                target.loader_version = Some(version.into());
            }
        }
        id(&target.minecraft)?;
        Ok(target)
    }
}

pub struct Staged {
    dir: tempfile::TempDir,
}
impl Staged {
    /// Only publish new files. A journal makes a crash during publication recoverable.
    pub fn commit(self, plan: &Plan, root: &Path) -> Result<(), String> {
        recover(root)?;
        let manifest_path = safe_join(root, ".azuria/content.json")?;
        let mut manifest =
            read_json(&manifest_path)?.unwrap_or(json!({"transactions":[],"installs":[]}));
        let installs = manifest["installs"]
            .as_array()
            .filter(|a| a.len() < 1024)
            .ok_or("Content history is invalid or full.")?;
        for old in installs {
            if old["provider"] == json!(plan.provider)
                && old["project"]
                    .as_str()
                    .is_some_and(|p| plan.incompatible.iter().any(|id| id == p))
                && old["files"].as_array().is_some_and(|a| {
                    a.iter()
                        .filter_map(Value::as_str)
                        .any(|p| safe_join(root, p).is_ok_and(|p| p.exists()))
                })
            {
                return Err("This project is incompatible with managed content already installed in the instance.".into());
            }
            if old["provider"] == json!(plan.provider)
                && old["project"]
                    .as_str()
                    .is_some_and(|p| plan.projects.get(p).is_some_and(|v| old["version"] != *v))
                && old["files"].as_array().is_some_and(|a| {
                    a.iter()
                        .filter_map(Value::as_str)
                        .any(|p| safe_join(root, p).is_ok_and(|p| p.exists()))
                })
            {
                return Err("Another version of this project is already installed. Remove it before installing this version.".into());
            }
        }
        let mut pending = vec![];
        for f in &plan.files {
            let path = safe_join(root, &f.path)?;
            if path.exists() {
                if !verify(&path, f)? {
                    return Err(format!(
                        "{} already exists with different content. Nothing was overwritten.",
                        f.path
                    ));
                }
            } else {
                pending.push(f.clone());
            }
        }
        let token = self
            .dir
            .path()
            .file_name()
            .and_then(|s| s.to_str())
            .ok_or_else(fail)?
            .to_string();
        let journal = safe_join(root, ".azuria/content-transaction.json")?;
        let entries = pending
            .iter()
            .map(|f| json!({"path":f.path,"size":f.size,"sha1":f.sha1,"sha512":f.sha512}))
            .collect::<Vec<_>>();
        atomic_json(&journal, &json!({"token":token,"files":entries}))?;
        let publish = (|| {
            for f in &pending {
                let source = safe_join(self.dir.path(), &f.path)?;
                let target = safe_join(root, &f.path)?;
                fs::create_dir_all(target.parent().ok_or_else(fail)?).map_err(io)?;
                if target.exists() {
                    return Err("An instance file appeared during installation. Retry after closing other file managers.".into());
                }
                fs::hard_link(&source, &target).map_err(io)?;
            }
            for (project, version) in &plan.projects {
                manifest["installs"].as_array_mut().ok_or_else(fail)?.push(json!({"provider":plan.provider,"project":project,"version":version,"files":plan.files.iter().map(|f|f.path.clone()).collect::<Vec<_>>()}));
            }
            manifest["transactions"]
                .as_array_mut()
                .ok_or_else(fail)?
                .push(json!(token));
            atomic_json(&manifest_path, &manifest)?;
            Ok::<_, String>(())
        })();
        if publish.is_err() {
            recover(root)?;
        } else {
            remove_journal(&journal)?;
        }
        publish
    }
}
fn remove_journal(path: &Path) -> Result<(), String> {
    fs::remove_file(path).map_err(io)?;
    let backup = path.with_extension("json.backup");
    safe_join(
        backup.parent().ok_or_else(fail)?,
        backup
            .file_name()
            .and_then(|s| s.to_str())
            .ok_or_else(fail)?,
    )?;
    if backup.exists() {
        fs::remove_file(backup).map_err(io)?;
    }
    Ok(())
}
fn read_json(path: &Path) -> Result<Option<Value>, String> {
    if !path.exists() {
        let backup = path.with_extension("json.backup");
        safe_join(
            backup.parent().ok_or_else(fail)?,
            backup
                .file_name()
                .and_then(|s| s.to_str())
                .ok_or_else(fail)?,
        )?;
        if backup.exists() {
            fs::rename(backup, path).map_err(io)?;
        } else {
            return Ok(None);
        }
    }
    safe_join(
        path.parent().ok_or_else(fail)?,
        path.file_name().and_then(|s| s.to_str()).ok_or_else(fail)?,
    )?;
    if fs::metadata(path).map_err(io)?.len() > 4 * 1024 * 1024 {
        return Err("Content history exceeds its size limit.".into());
    }
    serde_json::from_reader(fs::File::open(path).map_err(io)?)
        .map(Some)
        .map_err(|_| "Content history is unreadable. Keep the file for recovery.".into())
}
fn atomic_json(path: &Path, value: &Value) -> Result<(), String> {
    fs::create_dir_all(path.parent().ok_or_else(fail)?).map_err(io)?;
    let temp = path.with_extension("json.part");
    safe_join(
        temp.parent().ok_or_else(fail)?,
        temp.file_name().and_then(|s| s.to_str()).ok_or_else(fail)?,
    )?;
    if temp.exists() {
        fs::remove_file(&temp).map_err(io)?;
    }
    let mut file = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temp)
        .map_err(io)?;
    file.write_all(&serde_json::to_vec(value).map_err(|_| fail())?)
        .map_err(io)?;
    file.sync_all().map_err(io)?;
    drop(file);
    if path.exists() {
        let backup = path.with_extension("json.backup");
        safe_join(
            backup.parent().ok_or_else(fail)?,
            backup
                .file_name()
                .and_then(|s| s.to_str())
                .ok_or_else(fail)?,
        )?;
        if backup.exists() {
            fs::remove_file(&backup).map_err(io)?;
        }
        fs::rename(path, &backup).map_err(io)?;
        if let Err(e) = fs::rename(&temp, path) {
            let _ = fs::rename(backup, path);
            return Err(io(e));
        }
    } else {
        fs::rename(temp, path).map_err(io)?;
    }
    Ok(())
}
pub fn recover(root: &Path) -> Result<(), String> {
    let journal = safe_join(root, ".azuria/content-transaction.json")?;
    let Some(data) = read_json(&journal)? else {
        return Ok(());
    };
    let history = read_json(&safe_join(root, ".azuria/content.json")?)?.unwrap_or(json!({}));
    let committed = history["transactions"]
        .as_array()
        .is_some_and(|a| a.contains(&data["token"]));
    if !committed {
        for entry in data["files"].as_array().ok_or_else(fail)? {
            let path = text(entry, "path")?;
            allowed_path(&path)?;
            let target = safe_join(root, &path)?;
            let f = File {
                path,
                url: None,
                bytes: None,
                sha1: entry["sha1"].as_str().map(str::to_owned),
                sha512: entry["sha512"].as_str().map(str::to_owned),
                size: entry["size"].as_u64().ok_or_else(fail)?,
            };
            if target.exists() {
                if !verify(&target, &f)? {
                    return Err("An interrupted install contains changed files. They were preserved; keep the content transaction journal for recovery.".into());
                }
                fs::remove_file(target).map_err(io)?;
            }
        }
    }
    remove_journal(&journal)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn plan(bytes: &[u8]) -> Plan {
        Plan {
            provider: Provider::Modrinth,
            project: "project".into(),
            version: "v1".into(),
            kind: Kind::Mods,
            target: Target {
                minecraft: "1.21.1".into(),
                loader: "fabric".into(),
                loader_version: Some("0.16.10".into()),
            },
            files: vec![File {
                path: "mods/example.jar".into(),
                url: None,
                bytes: Some(bytes.into()),
                sha1: Some(format!("{:x}", Sha1::digest(bytes))),
                sha512: None,
                size: bytes.len() as u64,
            }],
            names: vec!["Example".into()],
            projects: BTreeMap::from([("project".into(), "v1".into())]),
            incompatible: vec![],
        }
    }
    #[test]
    fn verified_publication_and_reinstall_preserve_content() {
        let d = tempfile::tempdir().unwrap();
        let cache = tempfile::tempdir().unwrap();
        let client = Client::new(None).unwrap();
        let p = plan(b"jar bytes");
        client
            .stage(&p, cache.path(), &AtomicBool::new(false), &|_, _| {})
            .unwrap()
            .commit(&p, d.path())
            .unwrap();
        assert_eq!(
            fs::read(d.path().join("mods/example.jar")).unwrap(),
            b"jar bytes"
        );
        assert!(!d.path().join(".azuria/content-transaction.json").exists());
        client
            .stage(&p, cache.path(), &AtomicBool::new(false), &|_, _| {})
            .unwrap()
            .commit(&p, d.path())
            .unwrap();
    }
    #[test]
    fn collisions_and_bad_hashes_do_not_overwrite_files() {
        let d = tempfile::tempdir().unwrap();
        fs::create_dir(d.path().join("mods")).unwrap();
        fs::write(d.path().join("mods/example.jar"), b"user content").unwrap();
        let cache = tempfile::tempdir().unwrap();
        let client = Client::new(None).unwrap();
        let p = plan(b"jar bytes");
        assert!(client
            .stage(&p, cache.path(), &AtomicBool::new(false), &|_, _| {})
            .unwrap()
            .commit(&p, d.path())
            .is_err());
        assert_eq!(
            fs::read(d.path().join("mods/example.jar")).unwrap(),
            b"user content"
        );
        let mut p = p;
        p.files[0].sha1 = Some("0".repeat(40));
        assert!(client
            .stage(&p, cache.path(), &AtomicBool::new(false), &|_, _| {})
            .is_err());
    }
    #[test]
    fn cancellation_and_unsafe_paths_are_rejected() {
        let cache = tempfile::tempdir().unwrap();
        let client = Client::new(None).unwrap();
        assert!(client
            .stage(
                &plan(b"bytes"),
                cache.path(),
                &AtomicBool::new(true),
                &|_, _| {}
            )
            .is_err());
        for path in [
            "../escape.jar",
            "mods/../../escape.jar",
            ".azuria/content.json",
            "mods/evil.exe",
            "C:/escape.jar",
            "mods/CON.jar",
        ] {
            assert!(allowed_path(path).is_err(), "{path}");
        }
        assert!(allowed_path("config/valid.toml").is_ok());
    }
    #[test]
    fn recovery_removes_only_verified_uncommitted_files() {
        let d = tempfile::tempdir().unwrap();
        let p = plan(b"bytes");
        fs::create_dir_all(d.path().join("mods")).unwrap();
        fs::write(d.path().join("mods/example.jar"), b"bytes").unwrap();
        let f = &p.files[0];
        atomic_json(
            &d.path().join(".azuria/content-transaction.json"),
            &json!({"token":"interrupted","files":[{"path":f.path,"size":f.size,"sha1":f.sha1}]}),
        )
        .unwrap();
        recover(d.path()).unwrap();
        assert!(!d.path().join("mods/example.jar").exists());
    }
    #[test]
    fn another_managed_version_is_not_installed_alongside_existing() {
        let d = tempfile::tempdir().unwrap();
        let cache = tempfile::tempdir().unwrap();
        let client = Client::new(None).unwrap();
        let p = plan(b"first");
        client
            .stage(&p, cache.path(), &AtomicBool::new(false), &|_, _| {})
            .unwrap()
            .commit(&p, d.path())
            .unwrap();
        let mut next = plan(b"second");
        next.files[0].path = "mods/another-version.jar".into();
        next.version = "v2".into();
        next.projects.insert("project".into(), "v2".into());
        assert!(client
            .stage(&next, cache.path(), &AtomicBool::new(false), &|_, _| {})
            .unwrap()
            .commit(&next, d.path())
            .is_err());
        assert!(!d.path().join("mods/another-version.jar").exists());
    }
    #[test]
    fn provider_urls_and_pack_loader_metadata_are_validated() {
        for url in [
            "http://cdn.modrinth.com/file.jar",
            "https://cdn.modrinth.com.evil.test/file.jar",
            "https://user@cdn.modrinth.com/file.jar",
            "https://cdn.modrinth.com:8443/file.jar",
        ] {
            assert!(!trusted(&reqwest::Url::parse(url).unwrap()));
        }
        let mr = json!({"formatVersion":1,"game":"minecraft","dependencies":{"minecraft":"1.21.1","fabric-loader":"0.16.10"}});
        assert_eq!(
            pack_target(Provider::Modrinth, &mr).unwrap().loader,
            "fabric"
        );
        let cf = json!({"minecraft":{"version":"1.21.1","modLoaders":[{"id":"fabric-0.16.10","primary":true}]}});
        assert_eq!(
            pack_target(Provider::Curseforge, &cf)
                .unwrap()
                .loader_version
                .as_deref(),
            Some("0.16.10")
        );
    }
    #[test]
    fn curseforge_requires_author_download_and_hash() {
        let restricted = json!({"fileName":"test.jar", "downloadUrl":null, "fileLength":4, "hashes":[{"algo":1,"value":"0".repeat(40)}]});
        assert!(file(
            Provider::Curseforge,
            &primary(Provider::Curseforge, &restricted).unwrap()
        )
        .is_err());
        let missing_hash = json!({"fileName":"test.jar", "downloadUrl":"https://edge.forgecdn.net/test.jar", "fileLength":4, "hashes":[]});
        assert!(primary(Provider::Curseforge, &missing_hash).is_err());
        let allowed = json!({"fileName":"test.jar", "downloadUrl":"https://edge.forgecdn.net/test.jar", "fileLength":4, "hashes":[{"algo":1,"value":"0".repeat(40)}]});
        assert!(file(
            Provider::Curseforge,
            &primary(Provider::Curseforge, &allowed).unwrap()
        )
        .is_ok());
    }
    #[test]
    fn recovery_preserves_changed_user_files() {
        let root = tempfile::tempdir().unwrap();
        let p = plan(b"original");
        fs::create_dir(root.path().join("mods")).unwrap();
        fs::write(
            root.path().join("mods/example.jar"),
            b"user changed content",
        )
        .unwrap();
        atomic_json(&root.path().join(".azuria/content-transaction.json"), &json!({"token":"interrupted", "files":[{"path":p.files[0].path,"size":p.files[0].size,"sha1":p.files[0].sha1}]})).unwrap();
        assert!(recover(root.path()).is_err());
        assert_eq!(
            fs::read(root.path().join("mods/example.jar")).unwrap(),
            b"user changed content"
        );
        assert!(root
            .path()
            .join(".azuria/content-transaction.json")
            .exists());
    }
    #[test]
    fn versions_match_exact_game_and_loader() {
        let mr = json!({"id":"v1","name":"Version","game_versions":["1.21.1"],"loaders":["fabric"],"version_type":"release"});
        let v = version(Provider::Modrinth, &mr).unwrap();
        let mut t = plan(b"x").target;
        assert!(compatible(Provider::Modrinth, Kind::Mods, &t, &v));
        t.minecraft = "1.21".into();
        assert!(!compatible(Provider::Modrinth, Kind::Mods, &t, &v));
        let cf = json!({"id":12,"displayName":"Version","gameVersions":["1.21.1","Fabric"],"releaseType":1});
        assert_eq!(
            version(Provider::Curseforge, &cf).unwrap().loaders,
            vec!["fabric"]
        );
    }
    #[test]
    #[ignore = "downloads public Modrinth metadata and one compatible file"]
    fn live_modrinth_search_and_install_plan() {
        let client = Client::new(None).unwrap();
        let q = Search {
            provider: Provider::Modrinth,
            kind: Kind::Mods,
            query: "sodium".into(),
            game_version: "1.21.1".into(),
            loader: "fabric".into(),
            category: String::new(),
            sort: "downloads".into(),
            offset: 0,
            limit: 6,
        };
        let hits = client.search(&q).unwrap();
        assert!(!hits.projects.is_empty());
        let target = plan(b"x").target;
        let versions = client
            .versions(Provider::Modrinth, "AANobbMI", Some(&target), Kind::Mods)
            .unwrap();
        let chosen = versions.first().unwrap();
        let p = client
            .plan(
                Provider::Modrinth,
                "AANobbMI",
                &chosen.id,
                Kind::Mods,
                Some(target),
                None,
                &AtomicBool::new(false),
            )
            .unwrap();
        let cache = tempfile::tempdir().unwrap();
        let root = tempfile::tempdir().unwrap();
        client
            .stage(&p, cache.path(), &AtomicBool::new(false), &|_, _| {})
            .unwrap()
            .commit(&p, root.path())
            .unwrap();
    }
    #[test]
    #[ignore = "downloads a public Modrinth pack manifest"]
    fn live_modrinth_pack_plan() {
        let client = Client::new(None).unwrap();
        let hits = client
            .search(&Search {
                provider: Provider::Modrinth,
                kind: Kind::Modpacks,
                query: "Fabulously Optimized".into(),
                game_version: "1.21.1".into(),
                loader: "fabric".into(),
                category: String::new(),
                sort: "relevance".into(),
                offset: 0,
                limit: 6,
            })
            .unwrap();
        let project = &hits.projects.first().unwrap().id;
        let versions = client
            .versions(
                Provider::Modrinth,
                project,
                Some(&plan(b"x").target),
                Kind::Modpacks,
            )
            .unwrap();
        let chosen = versions.first().unwrap();
        let p = client
            .plan(
                Provider::Modrinth,
                project,
                &chosen.id,
                Kind::Modpacks,
                None,
                None,
                &AtomicBool::new(false),
            )
            .unwrap();
        assert!(!p.files.is_empty());
        assert_eq!(p.target.minecraft, "1.21.1");
        assert_eq!(p.target.loader, "fabric");
    }
}
