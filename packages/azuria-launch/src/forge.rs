//! Forge-family installers: verified official archives, client processors and reusable verified outputs.
use super::*;
use azuria_core::Loader;
use loaders::{coordinate, forge_repository, identifier};
use serde_json::json;
use sha1::{Digest, Sha1};

fn archive_bytes(
    zip: &mut zip::ZipArchive<fs::File>,
    name: &str,
    max: u64,
) -> Result<Vec<u8>, String> {
    let mut entry = zip
        .by_name(name)
        .map_err(|_| format!("Missing installer entry: {name}"))?;
    if entry.size() > max || entry.unix_mode().is_some_and(|m| m & 0o170000 == 0o120000) {
        return Err("Unsafe installer entry.".into());
    }
    let mut bytes = Vec::new();
    entry
        .by_ref()
        .take(max + 1)
        .read_to_end(&mut bytes)
        .map_err(files::io)?;
    if bytes.len() as u64 > max {
        return Err("Installer entry exceeded its size limit.".into());
    }
    Ok(bytes)
}
fn save(path: &Path, bytes: &[u8]) -> Result<(), String> {
    files::plain(path)?;
    fs::create_dir_all(path.parent().ok_or("Invalid installer path.")?).map_err(files::io)?;
    let temp = path.with_extension("azuria.part");
    files::plain(&temp)?;
    fs::write(&temp, bytes).map_err(files::io)?;
    if path.exists() {
        fs::remove_file(path).map_err(files::io)?;
    }
    fs::rename(temp, path).map_err(files::io)
}
fn hash(path: &Path) -> Result<String, String> {
    files::plain(path)?;
    let mut file = fs::File::open(path).map_err(files::io)?;
    let mut hash = Sha1::new();
    let mut buffer = [0; 65536];
    loop {
        let n = file.read(&mut buffer).map_err(files::io)?;
        if n == 0 {
            break;
        }
        hash.update(&buffer[..n]);
    }
    Ok(format!("{:x}", hash.finalize()))
}
fn library(
    zip: &mut zip::ZipArchive<fs::File>,
    libraries: &Path,
    library: &mut Value,
    d: &Downloader,
) -> Result<(), String> {
    let name = library["name"]
        .as_str()
        .ok_or("Missing installer library name.")?;
    let path = coordinate(name)?;
    let target = safe_join(libraries, &path)?;
    let mut artifact = library["downloads"]["artifact"].clone();
    if artifact.is_null() {
        let base = library["url"]
            .as_str()
            .unwrap_or(if name.starts_with("net.minecraftforge:") {
                "https://maven.minecraftforge.net/"
            } else {
                "https://libraries.minecraft.net/"
            });
        let url = format!("{}{path}", base.trim_end_matches('/').to_owned() + "/");
        artifact = json!({"path":path,"url":url,"sha1":d.checksum(&format!("{url}.sha1"))?});
    }
    if artifact["path"].as_str() != Some(&path) {
        return Err("Installer library path does not match its coordinate.".into());
    }
    if artifact["url"].as_str().is_some_and(|s| !s.is_empty()) {
        d.artifact(&artifact, &target, 512 * 1024 * 1024)?;
    } else if let Ok(bytes) = archive_bytes(zip, &format!("maven/{path}"), 512 * 1024 * 1024) {
        save(&target, &bytes)?;
        if let Some(expected) = artifact["sha1"].as_str() {
            if !files::verified(&target, "sha1", expected, artifact["size"].as_u64())? {
                return Err("Embedded installer library failed verification.".into());
            }
        }
    }
    // Empty URLs identify embedded or processor-generated artifacts, never a remote fallback.
    library["downloads"] = json!({"artifact":artifact});
    Ok(())
}
fn token(value: &str, vars: &BTreeMap<String, String>, libraries: &Path) -> Result<String, String> {
    if let Some(value) = value.strip_prefix('[').and_then(|s| s.strip_suffix(']')) {
        return Ok(safe_join(libraries, &coordinate(value)?)?
            .display()
            .to_string());
    }
    if let Some(value) = value.strip_prefix('\'').and_then(|s| s.strip_suffix('\'')) {
        return Ok(value.into());
    }
    let mut value = value.to_owned();
    for _ in 0..16 {
        let Some(start) = value.find('{') else {
            return Ok(value);
        };
        let end = value[start..]
            .find('}')
            .map(|n| n + start)
            .ok_or("Invalid installer placeholder.")?;
        let replacement = vars
            .get(&value[start + 1..end])
            .ok_or("Unknown installer placeholder.")?;
        value.replace_range(start..=end, replacement);
    }
    Err("Recursive installer placeholders.".into())
}
fn output_path(root: &Path, value: &str) -> Result<PathBuf, String> {
    let path = Path::new(value);
    let relative = path
        .strip_prefix(root)
        .map_err(|_| "Installer output escapes its cache.")?;
    safe_join(root, &relative.to_string_lossy().replace('\\', "/"))
}
fn main_class(jar: &Path) -> Result<String, String> {
    let mut zip = zip::ZipArchive::new(fs::File::open(jar).map_err(files::io)?)
        .map_err(|_| "Invalid installer processor JAR.")?;
    let bytes = archive_bytes(&mut zip, "META-INF/MANIFEST.MF", 1024 * 1024)?;
    let manifest = String::from_utf8(bytes)
        .map_err(|_| "Invalid processor manifest.")?
        .replace("\r\n ", "")
        .replace("\n ", "");
    let main = manifest
        .lines()
        .find_map(|l| l.strip_prefix("Main-Class: "))
        .ok_or("Processor has no Main-Class.")?
        .trim();
    if main.is_empty()
        || main.len() > 256
        || !main
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || b"._$".contains(&c))
    {
        return Err("Invalid processor main class.".into());
    }
    Ok(main.into())
}
fn client_processor(p: &Value) -> Result<bool, String> {
    if p["sides"].is_null() {
        return Ok(true);
    }
    Ok(p["sides"]
        .as_array()
        .ok_or("Invalid installer processor sides.")?
        .iter()
        .any(|s| s.as_str() == Some("client")))
}
fn run(
    java: &Path,
    root: &Path,
    jar: &Path,
    classpath: Vec<PathBuf>,
    args: Vec<String>,
    cancel: &AtomicBool,
    log: &Path,
) -> Result<(), String> {
    cancelled(cancel)?;
    for path in &classpath {
        files::plain(path)?;
        if !path.is_file() {
            return Err("An installer processor library is missing. Retry preparation.".into());
        }
    }
    let classpath = std::env::join_paths(classpath).map_err(|_| "Invalid installer classpath.")?;
    files::plain(log)?;
    let output = fs::OpenOptions::new()
        .create(true)
        .truncate(true)
        .write(true)
        .open(log)
        .map_err(files::io)?;
    let mut command = Command::new(java);
    command
        .current_dir(root)
        .arg("-cp")
        .arg(classpath)
        .arg(main_class(jar)?)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::from(output.try_clone().map_err(files::io)?))
        .stderr(Stdio::from(output));
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    let mut child = command
        .spawn()
        .map_err(|_| "Could not run the loader installer. Check your Java configuration.")?;
    let start = std::time::Instant::now();
    loop {
        let status = match child.try_wait() {
            Ok(status) => status,
            Err(_) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err("Could not monitor the loader installer.".into());
            }
        };
        if let Some(status) = status {
            return if status.success() {
                Ok(())
            } else {
                Err(format!(
                    "Loader installer failed (exit {}). Details: {}",
                    status
                        .code()
                        .map(|c| c.to_string())
                        .unwrap_or_else(|| "unknown".into()),
                    log.display()
                ))
            };
        }
        if cancel.load(Ordering::Relaxed)
            || start.elapsed() > Duration::from_secs(600)
            || fs::metadata(log)
                .map(|m| m.len() > 64 * 1024 * 1024)
                .unwrap_or(false)
        {
            let _ = child.kill();
            let _ = child.wait();
            cancelled(cancel)?;
            return Err(format!(
                "Loader installer exceeded its time or log limit. Details: {}",
                log.display()
            ));
        }
        std::thread::sleep(Duration::from_millis(100));
    }
}
#[allow(clippy::too_many_arguments)]
pub(crate) fn install(
    root: &Path,
    game: &str,
    loader: Loader,
    version: &str,
    base: &Value,
    client: &Path,
    java: &Path,
    d: &Downloader,
    progress: &Reporter,
    cancel: &AtomicBool,
) -> Result<Value, String> {
    identifier(game)?;
    identifier(version)?;
    let (repository, artifact) = forge_repository(loader.clone(), game)?;
    let full = if loader == Loader::Forge || game == "1.20.1" {
        format!("{game}-{version}")
    } else {
        version.into()
    };
    let file = artifact.rsplit('/').next().unwrap();
    let url = format!("{repository}{artifact}/{full}/{file}-{full}-installer.jar");
    let installer_hash = d.checksum(&format!("{url}.sha1"))?;
    let cache = safe_join(
        root,
        &format!(
            "loaders/{}/{game}/{version}",
            if loader == Loader::Forge {
                "forge"
            } else {
                "neoforge"
            }
        ),
    )?;
    fs::create_dir_all(&cache).map_err(files::io)?;
    let installer = safe_join(&cache, "installer.jar")?;
    d.artifact(
        &json!({"url":url,"sha1":installer_hash}),
        &installer,
        64 * 1024 * 1024,
    )?;
    let mut zip = zip::ZipArchive::new(fs::File::open(&installer).map_err(files::io)?)
        .map_err(|_| "Invalid loader installer archive.")?;
    if zip.len() > 20000 {
        return Err("Too many installer entries.".into());
    }
    let install: Value = serde_json::from_slice(&archive_bytes(
        &mut zip,
        "install_profile.json",
        8 * 1024 * 1024,
    )?)
    .map_err(|_| "Invalid installer profile.")?;
    // Legacy Forge (1.12 and earlier) supplies versionInfo and an embedded universal JAR.
    let mut profile = if install["versionInfo"].is_object() {
        install["versionInfo"].clone()
    } else {
        if install["minecraft"].as_str() != Some(game) {
            return Err("The loader installer targets another Minecraft version.".into());
        }
        let entry = install["json"]
            .as_str()
            .unwrap_or("/version.json")
            .trim_start_matches('/');
        safe_join(&cache, entry)?;
        serde_json::from_slice(&archive_bytes(&mut zip, entry, 4 * 1024 * 1024)?)
            .map_err(|_| "Invalid loader version profile.")?
    };
    let profile_id = profile["id"].as_str().ok_or("Missing loader profile ID.")?;
    identifier(profile_id)?;
    if profile["inheritsFrom"].as_str() != Some(game) {
        return Err("The loader profile targets another Minecraft version.".into());
    }
    let libraries = safe_join(root, "libraries")?;
    fs::create_dir_all(&libraries).map_err(files::io)?;
    if let Some(name) = install["install"]["path"].as_str() {
        let path = coordinate(name)?;
        let entry = install["install"]["filePath"]
            .as_str()
            .ok_or("Missing legacy Forge universal JAR.")?;
        safe_join(&cache, entry)?;
        save(
            &safe_join(&libraries, &path)?,
            &archive_bytes(&mut zip, entry, 256 * 1024 * 1024)?,
        )?;
        // Legacy profiles omit checksums for their embedded universal JAR.
        if let Some(libs) = profile["libraries"].as_array_mut() {
            for lib in libs {
                if lib["name"].as_str() == Some(name) {
                    lib["downloads"] = json!({"artifact":{"path":path,"url":"","sha1":hash(&safe_join(&libraries,&path)?)?}});
                }
            }
        }
    }
    for list in [
        install["libraries"].as_array().cloned().unwrap_or_default(),
        profile["libraries"]
            .as_array()
            .cloned()
            .ok_or("Missing loader libraries.")?,
    ] {
        if list.len() > 1024 {
            return Err("Too many loader libraries.".into());
        }
        for mut lib in list {
            cancelled(cancel)?;
            library(&mut zip, &libraries, &mut lib, d)?;
            if let Some(libs) = profile["libraries"].as_array_mut() {
                if let Some(target) = libs.iter_mut().find(|v| v["name"] == lib["name"]) {
                    *target = lib;
                }
            }
        }
    }
    let mut vars = BTreeMap::from([
        ("SIDE".into(), "client".into()),
        ("MINECRAFT_VERSION".into(), game.into()),
        ("MINECRAFT_JAR".into(), client.display().to_string()),
        ("INSTALLER".into(), installer.display().to_string()),
        ("ROOT".into(), cache.display().to_string()),
        ("LIBRARY_DIR".into(), libraries.display().to_string()),
    ]);
    let mut generated = Vec::<PathBuf>::new();
    if let Some(data) = install["data"].as_object() {
        if data.len() > 256 {
            return Err("Too many installer data entries.".into());
        }
        for (key, entry) in data {
            identifier(key)?;
            let value = entry["client"]
                .as_str()
                .ok_or("Missing client installer data.")?;
            let resolved = if let Some(name) = value.strip_prefix('/') {
                let target = safe_join(&cache, name)?;
                save(&target, &archive_bytes(&mut zip, name, 256 * 1024 * 1024)?)?;
                target.display().to_string()
            } else {
                token(value, &vars, &libraries)?
            };
            if value.starts_with('[') {
                generated.push(PathBuf::from(&resolved));
            }
            vars.insert(key.clone(), resolved);
        }
    }
    let stamp = safe_join(&cache, "installed.json")?;
    let previous = fs::read(&stamp)
        .ok()
        .and_then(|b| serde_json::from_slice::<Value>(&b).ok());
    let cached = if let Some(previous) = previous {
        previous["installerSha1"].as_str() == Some(&installer_hash)
            && previous["files"].as_array().is_some_and(|items| {
                !items.is_empty()
                    && items.iter().all(|item| {
                        item["path"]
                            .as_str()
                            .and_then(|p| safe_join(root, p).ok())
                            .zip(item["sha1"].as_str())
                            .is_some_and(|(p, h)| {
                                files::verified(&p, "sha1", h, None).unwrap_or(false)
                            })
                    })
            })
    } else {
        false
    };
    let processors = install["processors"]
        .as_array()
        .cloned()
        .unwrap_or_default();
    if processors.len() > 128 {
        return Err("Too many installer processors.".into());
    }
    if !cached {
        for (index, p) in processors.iter().enumerate() {
            cancelled(cancel)?;
            if !client_processor(p)? {
                continue;
            }
            report(
                progress,
                "loader",
                &format!(
                    "Installing {loader:?}: step {} of {}",
                    index + 1,
                    processors.len()
                ),
                index as u64,
                processors.len() as u64,
            );
            let args = p["args"]
                .as_array()
                .filter(|a| a.len() <= 512)
                .ok_or("Invalid processor arguments.")?
                .iter()
                .map(|a| {
                    token(
                        a.as_str()
                            .filter(|s| s.len() <= 32768 && !s.contains('\0'))
                            .ok_or("Invalid processor argument.")?,
                        &vars,
                        &libraries,
                    )
                })
                .collect::<Result<Vec<_>, _>>()?;
            let mut outputs = Vec::new();
            if let Some(items) = p["outputs"].as_object() {
                for (name, expected) in items {
                    let path = output_path(root, &token(name, &vars, &libraries)?)?;
                    let expected = token(
                        expected
                            .as_str()
                            .ok_or("Invalid processor output checksum.")?,
                        &vars,
                        &libraries,
                    )?;
                    if expected.len() != 40 || !expected.bytes().all(|c| c.is_ascii_hexdigit()) {
                        return Err("Invalid processor output checksum.".into());
                    }
                    generated.push(path.clone());
                    outputs.push((path, expected));
                }
            }
            if !outputs.is_empty()
                && outputs
                    .iter()
                    .all(|(p, h)| files::verified(p, "sha1", h, None).unwrap_or(false))
            {
                continue;
            }
            // Download mappings ourselves so they use the same source/hash/cancellation policy as the client.
            if args.windows(2).any(|a| a == ["--task", "DOWNLOAD_MOJMAPS"]) {
                let index = args
                    .iter()
                    .position(|a| a == "--output")
                    .ok_or("Missing mappings output.")?;
                let target =
                    output_path(root, args.get(index + 1).ok_or("Missing mappings path.")?)?;
                d.artifact(
                    &base["downloads"]["client_mappings"],
                    &target,
                    32 * 1024 * 1024,
                )?;
            } else {
                let jar = safe_join(
                    &libraries,
                    &coordinate(p["jar"].as_str().ok_or("Missing processor JAR.")?)?,
                )?;
                let mut cp = vec![jar.clone()];
                for name in p["classpath"]
                    .as_array()
                    .filter(|a| a.len() <= 256)
                    .ok_or("Invalid processor classpath.")?
                {
                    cp.push(safe_join(
                        &libraries,
                        &coordinate(name.as_str().ok_or("Invalid processor library.")?)?,
                    )?);
                }
                run(
                    java,
                    &cache,
                    &jar,
                    cp,
                    args,
                    cancel,
                    &safe_join(&cache, &format!("processor-{index}.log"))?,
                )?;
            }
            for (path, expected) in outputs {
                if !files::verified(&path, "sha1", &expected, None)? {
                    return Err(
                        "Loader processor output failed verification. Retry preparation.".into(),
                    );
                }
            }
        }
        if !processors.is_empty() {
            if let Some(path) = vars.get("PATCHED") {
                if !output_path(root, path)?.is_file() {
                    return Err(
                        "The loader did not produce its patched client. Retry preparation.".into(),
                    );
                }
            }
            let mut items = Vec::new();
            for path in generated.into_iter().filter(|p| p.is_file()) {
                let relative = path
                    .strip_prefix(root)
                    .map_err(|_| "Loader output escapes cache.")?
                    .to_string_lossy()
                    .replace('\\', "/");
                safe_join(root, &relative)?;
                items.push(json!({"path":relative,"sha1":hash(&path)?}));
            }
            save(
                &stamp,
                &serde_json::to_vec(&json!({"installerSha1":installer_hash,"files":items}))
                    .map_err(files::io)?,
            )?;
        }
    }
    // Every runtime artifact must now be present and verified, including generated/embedded libraries.
    for library in profile["libraries"]
        .as_array()
        .ok_or("Missing loader libraries.")?
    {
        let a = &library["downloads"]["artifact"];
        let path = safe_join(
            &libraries,
            a["path"].as_str().ok_or("Missing loader artifact path.")?,
        )?;
        d.artifact(a, &path, 512 * 1024 * 1024)?;
    }
    Ok(profile)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn tokens_are_literal_arguments_not_shell_commands() {
        let root = PathBuf::from("C:/Cache With Spaces/libraries");
        let vars = BTreeMap::from([
            ("SIDE".into(), "client".into()),
            ("NAME".into(), "'literal'".into()),
        ]);
        assert_eq!(token("'1.20.1-abc'", &vars, &root).unwrap(), "1.20.1-abc");
        assert_eq!(
            token("--side={SIDE}", &vars, &root).unwrap(),
            "--side=client"
        );
        assert!(token("{UNKNOWN}", &vars, &root).is_err());
        assert!(token("[a:b:../bad]", &vars, &root).is_err());
    }
    #[test]
    fn server_processors_are_never_run_and_outputs_cannot_escape() {
        assert!(!client_processor(&json!({"sides":["server"]})).unwrap());
        assert!(client_processor(&json!({"sides":["client"]})).unwrap());
        assert!(client_processor(&json!({})).unwrap());
        let d = tempfile::tempdir().unwrap();
        assert!(output_path(d.path(), &d.path().join("../escape").display().to_string()).is_err());
    }
    #[test]
    fn official_installer_fixtures_target_the_expected_clients() {
        for (install, profile, game) in [
            (
                include_str!("../tests/fixtures/forge-install_profile.json"),
                include_str!("../tests/fixtures/forge-version.json"),
                "1.20.1",
            ),
            (
                include_str!("../tests/fixtures/neoforge-install_profile.json"),
                include_str!("../tests/fixtures/neoforge-version.json"),
                "1.21.1",
            ),
        ] {
            let install: Value = serde_json::from_str(install).unwrap();
            let profile: Value = serde_json::from_str(profile).unwrap();
            assert_eq!(install["minecraft"], game);
            assert_eq!(profile["inheritsFrom"], game);
            for library in install["libraries"]
                .as_array()
                .unwrap()
                .iter()
                .chain(profile["libraries"].as_array().unwrap())
            {
                assert_eq!(
                    coordinate(library["name"].as_str().unwrap()).unwrap(),
                    library["downloads"]["artifact"]["path"]
                );
            }
            assert!(install["processors"]
                .as_array()
                .unwrap()
                .iter()
                .any(|p| client_processor(p).unwrap()));
        }
    }
    #[test]
    #[ignore = "downloads official Minecraft/loader files and runs client processors; requires Java"]
    fn official_forge_family_install_smoke() {
        let kind = std::env::var("AZURIA_SMOKE_LOADER").unwrap_or_else(|_| "forge".into());
        let (loader, game, version) = if kind == "neoforge" {
            (Loader::NeoForge, "1.21.1", "21.1.172")
        } else {
            (Loader::Forge, "1.20.1", "47.3.0")
        };
        let temp = tempfile::tempdir().unwrap();
        let root = std::env::var_os("AZURIA_SMOKE_CACHE")
            .map(PathBuf::from)
            .unwrap_or_else(|| temp.path().into());
        fs::create_dir_all(&root).unwrap();
        let cancel = Arc::new(AtomicBool::new(false));
        let progress: Reporter = Arc::new(|p| eprintln!("{}: {}", p.stage, p.message));
        let d = Downloader::new(progress.clone(), cancel.clone()).unwrap();
        let manifest = d.json(MANIFEST, 8 * 1024 * 1024).unwrap();
        let entry = manifest["versions"]
            .as_array()
            .unwrap()
            .iter()
            .find(|v| v["id"] == game)
            .unwrap();
        let base = d
            .json(entry["url"].as_str().unwrap(), 16 * 1024 * 1024)
            .unwrap();
        let client = root.join("client.jar");
        d.artifact(&base["downloads"]["client"], &client, 256 * 1024 * 1024)
            .unwrap();
        let java = std::env::var_os("AZURIA_SMOKE_JAVA")
            .map(PathBuf::from)
            .unwrap_or_else(|| "/usr/bin/java".into());
        let profile = install(
            &root,
            game,
            loader.clone(),
            version,
            &base,
            &client,
            &java,
            &d,
            &progress,
            &cancel,
        )
        .unwrap();
        assert_eq!(profile["inheritsFrom"], game);
        let merged = loaders::merge(&base, &profile, game).unwrap();
        assert_eq!(merged["mainClass"], profile["mainClass"]);
        // Repeating preparation must validate and reuse the processor outputs.
        install(
            &root, game, loader, version, &base, &client, &java, &d, &progress, &cancel,
        )
        .unwrap();
    }
    #[test]
    fn official_forge_profiles_expand_module_paths_and_ignore_the_unpatched_client() {
        for (profile, game) in [
            (
                include_str!("../tests/fixtures/forge-version.json"),
                "1.20.1",
            ),
            (
                include_str!("../tests/fixtures/neoforge-version.json"),
                "1.21.1",
            ),
        ] {
            let profile: Value = serde_json::from_str(profile).unwrap();
            let base = json!({"mainClass":"net.minecraft.client.main.Main","arguments":{"jvm":["-cp","${classpath}"],"game":["--username","${auth_player_name}","--accessToken","${auth_access_token}"]},"libraries":[],"assetIndex":{"id":"17"}});
            let p = Prepared {
                java: "C:/Java/bin/java.exe".into(),
                game: "C:/My Games/Profile".into(),
                natives: "C:/Cache/natives".into(),
                libraries: "C:/My Cache/libraries".into(),
                assets: "C:/Cache/assets".into(),
                classpath: vec![format!("C:/Cache/{game}.jar").into()],
                metadata: loaders::merge(&base, &profile, game).unwrap(),
                options: LaunchOptions::default(),
                version: game.into(),
                logging_argument: None,
            };
            let args = p
                .command_arguments(&Credentials {
                    username: "Player".into(),
                    uuid: "0123456789abcdef0123456789abcdef".into(),
                    access_token: "test-only-token".into(),
                    client_id: "test".into(),
                    xuid: None,
                })
                .unwrap();
            assert!(args
                .iter()
                .any(|s| s.starts_with("-DignoreList=") && s.ends_with(&format!(",{game}.jar"))));
            assert!(args
                .iter()
                .any(|s| s.contains("C:/My Cache/libraries/cpw/mods/bootstraplauncher")));
            assert!(!args.iter().any(|s| s.contains("${")));
            assert!(args.contains(&"test-only-token".into()));
        }
    }
}
