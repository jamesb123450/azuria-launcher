use super::*;
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GalleryImage {
    pub url: String,
    pub title: String,
    pub description: String,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectDetails {
    pub project: Project,
    pub body: String,
    pub body_html: bool,
    pub followers: u64,
    pub gallery: Vec<GalleryImage>,
}
impl Client {
    pub fn project(&self, provider: Provider, project: &str) -> Result<ProjectDetails, String> {
        id(project)?;
        let (p, body, body_html) = match provider {
            Provider::Modrinth => {
                let p = self.mr(&format!("project/{project}"), &[])?;
                let body = p["body"]
                    .as_str()
                    .unwrap_or("")
                    .chars()
                    .take(300_000)
                    .collect();
                (p, body, false)
            }
            Provider::Curseforge => {
                let p = self.cf(&format!("mods/{project}"), &[])?["data"].clone();
                let body = self.cf(&format!("mods/{project}/description"), &[])?["data"]
                    .as_str()
                    .unwrap_or("")
                    .chars()
                    .take(300_000)
                    .collect();
                (p, body, true)
            }
        };
        let mr = provider == Provider::Modrinth;
        let gallery = p[if mr { "gallery" } else { "screenshots" }]
            .as_array()
            .map(|a| {
                a.iter()
                    .take(32)
                    .filter_map(|g| {
                        Some(GalleryImage {
                            url: g["url"].as_str()?.into(),
                            title: g["title"].as_str().unwrap_or("").into(),
                            description: g["description"].as_str().unwrap_or("").into(),
                        })
                    })
                    .collect()
            })
            .unwrap_or_default();
        Ok(ProjectDetails {
            project: Project {
                id: project.into(),
                name: text(&p, if mr { "title" } else { "name" })?,
                description: p[if mr { "description" } else { "summary" }]
                    .as_str()
                    .unwrap_or("")
                    .into(),
                author: if mr {
                    p["slug"].as_str().unwrap_or("").into()
                } else {
                    p["authors"][0]["name"].as_str().unwrap_or("").into()
                },
                url: if mr {
                    format!(
                        "https://modrinth.com/{}/{}",
                        p["project_type"].as_str().unwrap_or("mod"),
                        p["slug"].as_str().unwrap_or(project)
                    )
                } else {
                    p["links"]["websiteUrl"]
                        .as_str()
                        .unwrap_or("https://www.curseforge.com/minecraft")
                        .into()
                },
                downloads: p[if mr { "downloads" } else { "downloadCount" }]
                    .as_u64()
                    .unwrap_or(0),
                icon_url: if mr {
                    p["icon_url"].as_str()
                } else {
                    p["logo"]["thumbnailUrl"].as_str()
                }
                .map(str::to_owned),
                categories: if mr {
                    list(&p["categories"])
                } else {
                    p["categories"]
                        .as_array()
                        .map(|a| {
                            a.iter()
                                .filter_map(|v| v["name"].as_str().map(str::to_owned))
                                .collect()
                        })
                        .unwrap_or_default()
                },
            },
            body,
            body_html,
            followers: p["followers"].as_u64().unwrap_or(0),
            gallery,
        })
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledProject {
    pub provider: Provider,
    pub project: Project,
    pub kind: Kind,
    pub version: String,
    pub version_name: String,
    pub local_file: Option<String>,
    pub latest: Option<String>,
    pub missing: usize,
    pub mods: usize,
    pub resource_packs: usize,
    pub files: Vec<String>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledFile {
    pub provider: Provider,
    pub name: String,
    pub project: Project,
}
#[derive(Serialize)]
pub struct Inventory {
    pub pack: Option<InstalledProject>,
    pub projects: Vec<InstalledProject>,
    pub files: Vec<InstalledFile>,
}

fn summary(p: &Value) -> Result<Project, String> {
    Ok(Project {
        id: text(p, "id")?,
        name: text(p, "title")?,
        description: p["description"].as_str().unwrap_or("").into(),
        author: p["slug"].as_str().unwrap_or("").into(),
        url: format!(
            "https://modrinth.com/{}/{}",
            p["project_type"].as_str().unwrap_or("mod"),
            p["slug"].as_str().unwrap_or("")
        ),
        downloads: p["downloads"].as_u64().unwrap_or(0),
        icon_url: p["icon_url"].as_str().map(str::to_owned),
        categories: list(&p["categories"]),
    })
}
impl Client {
    fn cf_post(&self, path: &str, body: &Value) -> Result<Value, String> {
        let key = self
            .key
            .as_deref()
            .ok_or("CurseForge API access is not configured. Open Settings → Content providers.")?;
        let mut response = self
            .http
            .post(format!("https://api.curseforge.com/v1/{path}"))
            .header("x-api-key", key)
            .json(body)
            .send()
            .map_err(|_| "Could not check CurseForge content.")?;
        if !response.status().is_success() {
            return Err("CurseForge denied the content check. Verify API access and retry.".into());
        }
        let mut bytes = vec![];
        response
            .by_ref()
            .take(16 * 1024 * 1024 + 1)
            .read_to_end(&mut bytes)
            .map_err(io)?;
        if bytes.len() > 16 * 1024 * 1024 {
            return Err(fail());
        }
        serde_json::from_slice(&bytes).map_err(|_| fail())
    }
    fn mr_post(&self, path: &str, body: &Value) -> Result<Value, String> {
        let mut response = self
            .http
            .post(format!("https://api.modrinth.com/v2/{path}"))
            .json(body)
            .send()
            .map_err(|_| "Could not check local content with Modrinth.")?;
        if !response.status().is_success() {
            return Err("Could not check local content with Modrinth. Retry shortly.".into());
        }
        let mut bytes = vec![];
        response
            .by_ref()
            .take(16 * 1024 * 1024 + 1)
            .read_to_end(&mut bytes)
            .map_err(io)?;
        if bytes.len() > 16 * 1024 * 1024 {
            return Err(fail());
        }
        serde_json::from_slice(&bytes).map_err(|_| fail())
    }
    pub fn inventory(&self, root: &Path, target: &Target) -> Result<Inventory, String> {
        self.inventory_inner(root, target, true)
    }
    pub fn managed_inventory(&self, root: &Path, target: &Target) -> Result<Inventory, String> {
        self.inventory_inner(root, target, false)
    }
    fn inventory_inner(
        &self,
        root: &Path,
        target: &Target,
        identify: bool,
    ) -> Result<Inventory, String> {
        let history =
            read_json(&safe_join(root, ".azuria/content.json")?)?.unwrap_or(json!({"installs":[]}));
        let mut pack = None;
        let mut projects = vec![];
        let mut roots = BTreeSet::new();
        for record in history["installs"].as_array().ok_or_else(fail)? {
            let pid = text(record, "project")?;
            if record["root"].as_str().is_some_and(|r| r != pid)
                || !roots.insert((record["provider"].to_string(), pid.clone()))
            {
                continue;
            }
            let provider: Provider =
                serde_json::from_value(record["provider"].clone()).map_err(|_| fail())?;
            let vid = text(record, "version")?;
            let raw = self.raw_version(provider, &pid, &vid)?;
            let filename = text(&primary(provider, &raw)?, "filename")?;
            let kind = if record["kind"] == "modpacks"
                || filename.ends_with(".mrpack")
                || (provider == Provider::Curseforge
                    && self.cf(&format!("mods/{pid}"), &[])?["data"]["classId"] == 4471)
            {
                Kind::Modpacks
            } else if filename.ends_with(".jar") {
                Kind::Mods
            } else {
                Kind::Resourcepacks
            };
            if kind != Kind::Modpacks
                && record["files"].as_array().is_some_and(|a| {
                    !a.iter().filter_map(Value::as_str).any(|p| {
                        safe_join(root, p).is_ok_and(|f| f.exists())
                            || safe_join(root, &format!("{p}.disabled")).is_ok_and(|f| f.exists())
                    })
                })
            {
                continue;
            }
            let details = self.project(provider, &pid)?;
            let options = self.versions(provider, &pid, Some(target), kind)?;
            let latest = options
                .iter()
                .find(|v| v.release_type == "release")
                .filter(|v| {
                    v.id != vid
                        && v.published.as_str()
                            > raw[if provider == Provider::Modrinth {
                                "date_published"
                            } else {
                                "fileDate"
                            }]
                            .as_str()
                            .unwrap_or("")
                })
                .map(|v| v.id.clone());
            let paths = record["files"].as_array().ok_or_else(fail)?;
            let mut missing = paths
                .iter()
                .filter_map(Value::as_str)
                .filter(|p| {
                    !safe_join(root, p).is_ok_and(|p| p.exists())
                        && !safe_join(root, &format!("{p}.disabled")).is_ok_and(|p| p.exists())
                })
                .count();
            if kind == Kind::Modpacks
                && record["target"].is_object()
                && record["target"]["loaderVersion"] != json!(target.loader_version)
            {
                missing += 1;
            }
            let item = InstalledProject {
                provider,
                project: details.project,
                kind,
                version: vid,
                version_name: version(provider, &raw)?.name,
                local_file: None,
                latest,
                missing,
                mods: paths
                    .iter()
                    .filter_map(Value::as_str)
                    .filter(|p| p.starts_with("mods/"))
                    .count(),
                files: paths
                    .iter()
                    .filter_map(Value::as_str)
                    .map(str::to_owned)
                    .collect(),
                resource_packs: paths
                    .iter()
                    .filter_map(Value::as_str)
                    .filter(|p| p.starts_with("resourcepacks/"))
                    .count(),
            };
            if kind == Kind::Modpacks {
                pack = Some(item);
            } else {
                projects.push(item);
            }
        }
        if let Some(p) = &pack {
            projects.retain(|extra| extra.files != p.files);
        }
        if !identify {
            return Ok(Inventory {
                pack,
                projects,
                files: vec![],
            });
        }
        // Hash lookup recognises installed files even when they came from a pack or local import.
        let mut hashes = BTreeMap::new();
        let mut total = 0u64;
        for folder in ["mods", "resourcepacks"] {
            let directory = safe_join(root, folder)?;
            if !directory.is_dir() {
                continue;
            }
            for entry in fs::read_dir(directory).map_err(io)?.take(256) {
                let entry = entry.map_err(io)?;
                let name = entry.file_name().to_string_lossy().to_string();
                let path = safe_join(root, &format!("{folder}/{name}"))?;
                let size = fs::metadata(&path).map_err(io)?.len();
                if !path.is_file()
                    || size > 512 * 1024 * 1024
                    || !(name.ends_with(".jar")
                        || name.ends_with(".jar.disabled")
                        || name.ends_with(".zip")
                        || name.ends_with(".zip.disabled"))
                {
                    continue;
                }
                total += size;
                if total > 2 * 1024 * 1024 * 1024 {
                    break;
                }
                let mut hash = Sha1::new();
                let mut file = fs::File::open(path).map_err(io)?.take(size + 1);
                let mut buf = [0; 65536];
                loop {
                    let n = file.read(&mut buf).map_err(io)?;
                    if n == 0 {
                        break;
                    }
                    hash.update(&buf[..n]);
                }
                hashes.insert(format!("{:x}", hash.finalize()), name);
            }
        }
        let mut files = vec![];
        if !hashes.is_empty() {
            let matched = self.mr_post(
                "version_files",
                &json!({"hashes":hashes.keys().collect::<Vec<_>>(),"algorithm":"sha1"}),
            )?;
            let updates=self.mr_post("version_files/update",&json!({"hashes":hashes.keys().collect::<Vec<_>>(),"algorithm":"sha1","loaders":[target.loader,"minecraft"],"game_versions":[target.minecraft],"version_types":["release"]}))?;
            let ids: Vec<_> = matched
                .as_object()
                .ok_or_else(fail)?
                .values()
                .filter_map(|v| v["project_id"].as_str())
                .collect::<BTreeSet<_>>()
                .into_iter()
                .collect();
            if !ids.is_empty() {
                let metadata = self.mr("projects", &[("ids", json!(ids).to_string())])?;
                for (hash, v) in matched.as_object().ok_or_else(fail)? {
                    if let Some(p) = metadata
                        .as_array()
                        .and_then(|a| a.iter().find(|p| p["id"] == v["project_id"]))
                    {
                        if let Some(name) = hashes.get(hash) {
                            files.push(InstalledFile {
                                provider: Provider::Modrinth,
                                name: name.clone(),
                                project: summary(p)?,
                            });
                            let managed_by_pack = pack.as_ref().is_some_and(|pack| {
                                pack.files.iter().any(|path| {
                                    path.ends_with(&format!(
                                        "/{}",
                                        name.trim_end_matches(".disabled")
                                    ))
                                })
                            });
                            if !managed_by_pack
                                && !projects
                                    .iter()
                                    .any(|item| item.project.id == p["id"].as_str().unwrap_or(""))
                            {
                                let current = version(Provider::Modrinth, v)?;
                                let next = &updates[hash];
                                let latest = next["id"]
                                    .as_str()
                                    .filter(|id| {
                                        *id != current.id
                                            && next["date_published"].as_str().unwrap_or("")
                                                > current.published.as_str()
                                    })
                                    .map(str::to_owned);
                                projects.push(InstalledProject {
                                    provider: Provider::Modrinth,
                                    project: summary(p)?,
                                    kind: if name.contains(".jar") {
                                        Kind::Mods
                                    } else {
                                        Kind::Resourcepacks
                                    },
                                    version: current.id,
                                    version_name: current.name,
                                    local_file: Some(name.clone()),
                                    latest,
                                    missing: 0,
                                    mods: usize::from(name.contains(".jar")),
                                    resource_packs: usize::from(name.contains(".zip")),
                                    files: vec![],
                                });
                            }
                        }
                    }
                }
            }
        }
        let cf_records = history["installs"]
            .as_array()
            .ok_or_else(fail)?
            .iter()
            .filter(|r| r["provider"] == "curseforge")
            .collect::<Vec<_>>();
        if !cf_records.is_empty() {
            let mod_ids = cf_records
                .iter()
                .filter_map(|r| r["project"].as_str()?.parse::<u64>().ok())
                .collect::<BTreeSet<_>>();
            let file_ids = cf_records
                .iter()
                .filter_map(|r| r["version"].as_str()?.parse::<u64>().ok())
                .collect::<BTreeSet<_>>();
            let metadata = self.cf_post("mods", &json!({"modIds":mod_ids}))?;
            let versions = self.cf_post("mods/files", &json!({"fileIds":file_ids}))?;
            for v in versions["data"].as_array().ok_or_else(fail)? {
                let Some(p) = metadata["data"]
                    .as_array()
                    .and_then(|a| a.iter().find(|p| p["id"] == v["modId"]))
                else {
                    continue;
                };
                let name = text(v, "fileName")?;
                let folder = match p["classId"].as_u64() {
                    Some(6) => "mods",
                    Some(12) => "resourcepacks",
                    _ => continue,
                };
                let file = if safe_join(root, &format!("{folder}/{name}"))?.is_file() {
                    name.clone()
                } else if safe_join(root, &format!("{folder}/{name}.disabled"))?.is_file() {
                    format!("{name}.disabled")
                } else {
                    continue;
                };
                files.retain(|f| f.name != file);
                files.push(InstalledFile {
                    provider: Provider::Curseforge,
                    name: file,
                    project: Project {
                        id: p["id"].as_u64().ok_or_else(fail)?.to_string(),
                        name: text(p, "name")?,
                        description: p["summary"].as_str().unwrap_or("").into(),
                        author: p["authors"][0]["name"].as_str().unwrap_or("").into(),
                        url: text(&p["links"], "websiteUrl")?,
                        downloads: p["downloadCount"].as_f64().unwrap_or(0.0) as u64,
                        icon_url: p["logo"]["thumbnailUrl"].as_str().map(str::to_owned),
                        categories: vec![],
                    },
                });
            }
        }
        Ok(Inventory {
            pack,
            projects,
            files,
        })
    }
}
