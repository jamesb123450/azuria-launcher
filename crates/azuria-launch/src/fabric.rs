//! Fabric's launcher profiles inherit Mojang metadata; never replace the base assets/runtime.
use super::*;
use serde_json::json;

fn identifier(value: &str) -> Result<(), String> {
    if value.is_empty()
        || value.len() > 128
        || !value
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || b"._-+".contains(&c))
    {
        return Err(
            "Select a valid Minecraft and Fabric loader version in instance settings.".into(),
        );
    }
    Ok(())
}
fn coordinate(name: &str) -> Result<(String, String), String> {
    let parts = name.split(':').collect::<Vec<_>>();
    if parts.len() != 3 {
        return Err("Unsupported Fabric library coordinate.".into());
    }
    for part in &parts {
        identifier(part)?;
    }
    if parts
        .iter()
        .any(|p| p.starts_with('.') || p.ends_with('.') || p.contains(".."))
    {
        return Err("Invalid Fabric library coordinate.".into());
    }
    Ok((
        format!("{}:{}", parts[0], parts[1]),
        format!(
            "{}/{}/{}/{}-{}.jar",
            parts[0].replace('.', "/"),
            parts[1],
            parts[2],
            parts[1],
            parts[2]
        ),
    ))
}
fn artifact(library: &Value) -> Result<Value, String> {
    let (_, path) = coordinate(
        library["name"]
            .as_str()
            .ok_or("Missing Fabric library coordinate.")?,
    )?;
    if library["url"].as_str() != Some("https://maven.fabricmc.net/") {
        return Err(
            "This Fabric profile uses an unsupported library source. Update Azuria first.".into(),
        );
    }
    let mut result = json!({"path":path,"url":format!("https://maven.fabricmc.net/{path}")});
    for (key, len) in [("sha256", 64), ("sha1", 40)] {
        if let Some(hash) = library.get(key) {
            let hash = hash
                .as_str()
                .filter(|s| s.len() == len && s.bytes().all(|c| c.is_ascii_hexdigit()))
                .ok_or("Invalid Fabric library verification hash.")?;
            result[key] = hash.into();
        }
    }
    if let Some(size) = library.get("size") {
        if size.as_u64().is_none_or(|n| n > 256 * 1024 * 1024) {
            return Err("Invalid Fabric library size.".into());
        }
        result["size"] = size.clone();
    }
    Ok(result)
}
fn validate(profile: &Value, game: &str, loader: &str, hashes: bool) -> Result<(), String> {
    identifier(game)?;
    identifier(loader)?;
    if profile["inheritsFrom"].as_str() != Some(game)
        || profile["id"].as_str() != Some(format!("fabric-loader-{loader}-{game}").as_str())
    {
        return Err("Fabric does not match the selected Minecraft/loader versions. Choose a compatible pair in instance settings.".into());
    }
    let main = profile["mainClass"]
        .as_str()
        .ok_or("Missing Fabric main class.")?;
    if !matches!(
        main,
        "net.fabricmc.loader.impl.launch.knot.KnotClient"
            | "net.fabricmc.loader.launch.knot.KnotClient"
    ) {
        return Err("Unsupported Fabric client entry point. Update Azuria first.".into());
    }
    for kind in ["jvm", "game"] {
        let args = profile["arguments"][kind]
            .as_array()
            .ok_or("Invalid Fabric launch arguments.")?;
        if args.len() > 256
            || args.iter().any(|a| {
                a.as_str()
                    .is_none_or(|s| s.len() > 8192 || s.contains('\0'))
            })
        {
            return Err("Unsupported Fabric launch arguments.".into());
        }
    }
    let libraries = profile["libraries"]
        .as_array()
        .filter(|l| !l.is_empty() && l.len() <= 256)
        .ok_or("Invalid Fabric libraries.")?;
    let mut names = std::collections::BTreeSet::new();
    for library in libraries {
        let name = library["name"]
            .as_str()
            .ok_or("Missing Fabric library name.")?;
        let (key, _) = coordinate(name)?;
        if !names.insert(key) {
            return Err("Duplicate library in Fabric profile.".into());
        }
        let meta = artifact(library)?;
        if hashes && meta["sha256"].is_null() && meta["sha1"].is_null() {
            return Err("Fabric library is missing its verification checksum.".into());
        }
    }
    for required in [
        format!("net.fabricmc:fabric-loader:{loader}"),
        format!("net.fabricmc:intermediary:{game}"),
    ] {
        if !libraries
            .iter()
            .any(|l| l["name"].as_str() == Some(&required))
        {
            return Err(
                "Fabric profile is missing the selected loader or Minecraft mappings.".into(),
            );
        }
    }
    Ok(())
}
pub(crate) fn profile(
    root: &Path,
    game: &str,
    loader: &str,
    downloader: &Downloader,
    cancel: &AtomicBool,
) -> Result<Value, String> {
    cancelled(cancel)?;
    identifier(game)?;
    identifier(loader)?;
    let path = safe_join(root, &format!("loaders/fabric/{game}/{loader}.json"))?;
    if path.exists() && fs::metadata(&path).map_err(files::io)?.len() <= 4 * 1024 * 1024 {
        let cached = serde_json::from_reader::<_, Value>(fs::File::open(&path).map_err(files::io)?);
        if let Ok(profile) = cached {
            if validate(&profile, game, loader, true).is_ok() {
                return Ok(profile);
            }
        }
    }
    let mut profile = downloader
        .json(
            &format!("https://meta.fabricmc.net/v2/versions/loader/{game}/{loader}/profile/json"),
            4 * 1024 * 1024,
        )
        .map_err(|e| format!("Could not prepare Fabric {loader} for Minecraft {game}: {e}"))?;
    validate(&profile, game, loader, false)?;
    for library in profile["libraries"]
        .as_array_mut()
        .ok_or("Missing Fabric libraries.")?
    {
        cancelled(cancel)?;
        let meta = artifact(library)?;
        if meta["sha256"].is_null() && meta["sha1"].is_null() {
            let url = format!(
                "{}.sha1",
                meta["url"].as_str().ok_or("Missing Fabric library URL.")?
            );
            library["sha1"] = downloader.checksum(&url)?.into();
        }
    }
    validate(&profile, game, loader, true)?;
    cancelled(cancel)?;
    fs::create_dir_all(path.parent().ok_or("Invalid Fabric cache path.")?).map_err(files::io)?;
    let temp = path.with_extension("json.part");
    files::plain(&temp)?;
    if temp.exists() {
        fs::remove_file(&temp).map_err(files::io)?;
    }
    let mut output = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temp)
        .map_err(files::io)?;
    output
        .write_all(&serde_json::to_vec(&profile).map_err(|_| "Invalid Fabric profile.")?)
        .map_err(files::io)?;
    output.sync_all().map_err(files::io)?;
    drop(output);
    cancelled(cancel)?;
    if path.exists() {
        fs::remove_file(&path).map_err(files::io)?;
    }
    fs::rename(temp, path).map_err(files::io)?;
    Ok(profile)
}
pub(crate) fn merge(
    base: &Value,
    profile: &Value,
    game: &str,
    loader: &str,
) -> Result<Value, String> {
    validate(profile, game, loader, true)?;
    // Fabric targets modern Minecraft. Fail explicitly instead of dropping legacy JVM/game arguments.
    if !base["arguments"]["jvm"].is_array() || !base["arguments"]["game"].is_array() {
        return Err("This Minecraft version is not supported for Fabric launching in Azuria. Choose a modern Fabric-compatible version.".into());
    }
    let mut merged = base.clone();
    merged["id"] = profile["id"].clone();
    merged["mainClass"] = profile["mainClass"].clone();
    for kind in ["jvm", "game"] {
        let args = merged["arguments"][kind]
            .as_array_mut()
            .ok_or("Missing Minecraft arguments.")?;
        args.extend(
            profile["arguments"][kind]
                .as_array()
                .ok_or("Missing Fabric arguments.")?
                .iter()
                .cloned(),
        );
    }
    let libraries = merged["libraries"]
        .as_array_mut()
        .ok_or("Missing Minecraft libraries.")?;
    for library in profile["libraries"]
        .as_array()
        .ok_or("Missing Fabric libraries.")?
    {
        let name = library["name"]
            .as_str()
            .ok_or("Missing Fabric library name.")?;
        let (key, _) = coordinate(name)?;
        libraries.retain(|l| {
            let parts = l["name"]
                .as_str()
                .unwrap_or("")
                .split(':')
                .collect::<Vec<_>>();
            // Keep native classifiers even if a loader replaces the main artifact.
            parts.len() != 3 || format!("{}:{}", parts[0], parts[1]) != key
        });
        libraries.push(json!({"name":name,"downloads":{"artifact":artifact(library)?}}));
    }
    Ok(merged)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn profile_fixture() -> Value {
        let mut p: Value =
            serde_json::from_str(include_str!("../tests/fixtures/fabric-1.21.1-0.16.10.json"))
                .unwrap();
        for library in p["libraries"].as_array_mut().unwrap() {
            if library["sha1"].is_null() && library["sha256"].is_null() {
                library["sha1"] = "0".repeat(40).into();
            }
        }
        p
    }
    #[test]
    fn merge_preserves_mojang_assets_java_and_arguments_and_replaces_conflicts() {
        let mut base: Value =
            serde_json::from_str(include_str!("../tests/fixtures/mojang-1.21.1.json")).unwrap();
        base["assetIndex"] = json!({"id":"17"});
        base["javaVersion"] = json!({"majorVersion":21,"component":"java-runtime-delta"});
        base["downloads"] = json!({"client":{"sha1":"test"}});
        base["libraries"] = json!([{"name":"org.ow2.asm:asm:old"}]);
        let p = profile_fixture();
        let merged = merge(&base, &p, "1.21.1", "0.16.10").unwrap();
        assert_eq!(merged["assetIndex"], base["assetIndex"]);
        assert_eq!(merged["javaVersion"], base["javaVersion"]);
        assert_eq!(merged["downloads"], base["downloads"]);
        assert_eq!(merged["mainClass"], p["mainClass"]);
        assert_eq!(merged["arguments"]["game"], base["arguments"]["game"]);
        assert!(
            merged["arguments"]["jvm"].as_array().unwrap().len()
                > base["arguments"]["jvm"].as_array().unwrap().len()
        );
        assert!(!merged["libraries"]
            .as_array()
            .unwrap()
            .iter()
            .any(|l| l["name"] == "org.ow2.asm:asm:old"));
    }
    #[test]
    fn fabric_command_preserves_paths_overrides_and_authenticated_arguments() {
        let mut base: Value =
            serde_json::from_str(include_str!("../tests/fixtures/mojang-1.21.1.json")).unwrap();
        base["libraries"] = json!([]);
        base["assetIndex"] = json!({"id":"17"});
        let profile = profile_fixture();
        let metadata = merge(&base, &profile, "1.21.1", "0.16.10").unwrap();
        let game = PathBuf::from("C:/Users/A Player/instances/Fabric world");
        let options = LaunchOptions {
            memory_mb: 8192,
            java_arguments: vec!["-Dcustom=value with spaces".into()],
            ..LaunchOptions::default()
        };
        let prepared = Prepared {
            java: game.join("java.exe"),
            natives: game.join("natives"),
            libraries: game.join("libraries"),
            assets: game.join("assets"),
            classpath: vec![
                game.join("fabric-loader.jar"),
                game.join("intermediary.jar"),
                game.join("client.jar"),
            ],
            metadata,
            options,
            version: "1.21.1".into(),
            logging_argument: None,
            game: game.clone(),
        };
        let args = prepared
            .command_arguments(&Credentials {
                username: "Player".into(),
                uuid: "0123456789abcdef0123456789abcdef".into(),
                access_token: "TEST-TOKEN".into(),
                client_id: "test".into(),
                xuid: None,
            })
            .unwrap();
        assert!(args.contains(&game.display().to_string()));
        assert!(args.contains(&"-Xmx8192M".into()));
        assert!(args.contains(&"-Dcustom=value with spaces".into()));
        assert!(args.contains(&"TEST-TOKEN".into()));
        assert!(args.contains(&"net.fabricmc.loader.impl.launch.knot.KnotClient".into()));
        assert!(!args.contains(&"net.minecraft.client.main.Main".into()));
        assert!(args
            .iter()
            .any(|a| a.contains("fabric-loader.jar;") && a.contains("intermediary.jar;")));
    }
    #[test]
    fn rejects_mismatches_missing_hashes_unsafe_coordinates_sources_and_legacy() {
        let p = profile_fixture();
        assert!(validate(&p, "1.20.1", "0.16.10", true).is_err());
        assert!(validate(&p, "1.21.1", "0.16.9", true).is_err());
        for bad in ["../evil:a:1", "a:b:../1", "a:b:1:classifier", "a:b:1@jar"] {
            assert!(coordinate(bad).is_err());
        }
        let mut bad = p.clone();
        bad["libraries"][0]["url"] = "https://evil.example/".into();
        assert!(validate(&bad, "1.21.1", "0.16.10", true).is_err());
        let mut bad = p.clone();
        bad["libraries"][0]
            .as_object_mut()
            .unwrap()
            .remove("sha256");
        bad["libraries"][0].as_object_mut().unwrap().remove("sha1");
        assert!(validate(&bad, "1.21.1", "0.16.10", true).is_err());
        assert!(merge(
            &json!({"minecraftArguments":"--username Player"}),
            &p,
            "1.21.1",
            "0.16.10"
        )
        .is_err());
    }
    #[test]
    fn cached_profile_is_pinned_and_cancellation_prevents_network() {
        let d = tempfile::tempdir().unwrap();
        let path = d.path().join("loaders/fabric/1.21.1/0.16.10.json");
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(&path, serde_json::to_vec(&profile_fixture()).unwrap()).unwrap();
        let cancel = Arc::new(AtomicBool::new(false));
        let downloader = Downloader::new(Arc::new(|_| {}), cancel.clone()).unwrap();
        assert!(profile(d.path(), "1.21.1", "0.16.10", &downloader, &cancel).is_ok());
        cancel.store(true, Ordering::Relaxed);
        assert!(profile(d.path(), "1.21.1", "0.16.10", &downloader, &cancel).is_err());
        assert!(profile(d.path(), "1.21.1", "0.16.9", &downloader, &cancel).is_err());
        assert!(profile(d.path(), "../escape", "0.16.10", &downloader, &cancel).is_err());
    }
    #[test]
    #[ignore = "downloads official Fabric metadata and libraries; run explicitly"]
    fn official_fabric_profile_and_libraries_smoke() {
        let d = tempfile::tempdir().unwrap();
        let cancel = Arc::new(AtomicBool::new(false));
        let downloader = Downloader::new(Arc::new(|_| {}), cancel.clone()).unwrap();
        let p = profile(d.path(), "1.21.1", "0.16.10", &downloader, &cancel).unwrap();
        for library in p["libraries"].as_array().unwrap() {
            let meta = artifact(library).unwrap();
            let target = safe_join(d.path(), meta["path"].as_str().unwrap()).unwrap();
            downloader
                .artifact(&meta, &target, 256 * 1024 * 1024)
                .unwrap();
            // A second call verifies and reuses the cached artifact without downloading.
            downloader
                .artifact(&meta, &target, 256 * 1024 * 1024)
                .unwrap();
        }
        let cached = profile(d.path(), "1.21.1", "0.16.10", &downloader, &cancel).unwrap();
        assert_eq!(p, cached);
    }
}
