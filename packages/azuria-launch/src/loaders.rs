//! Official loader catalogues and profile merging. All loader versions are pinned before installation.
use super::*;
use azuria_core::Loader;
use serde_json::json;

pub(crate) fn identifier(value: &str) -> Result<(), String> {
    if value.is_empty()
        || value.len() > 128
        || value.starts_with('.')
        || value.ends_with('.')
        || value.contains("..")
        || !value
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || b"._-+".contains(&c))
    {
        return Err("Choose a valid Minecraft and loader version.".into());
    }
    Ok(())
}
pub(crate) fn coordinate(name: &str) -> Result<String, String> {
    let (name, extension) = name.split_once('@').unwrap_or((name, "jar"));
    identifier(extension)?;
    let parts = name.split(':').collect::<Vec<_>>();
    if !(3..=4).contains(&parts.len()) {
        return Err("Invalid loader library coordinate.".into());
    }
    for part in &parts {
        identifier(part)?;
    }
    let classifier = parts.get(3).map(|s| format!("-{s}")).unwrap_or_default();
    Ok(format!(
        "{}/{}/{}/{}-{}{classifier}.{extension}",
        parts[0].replace('.', "/"),
        parts[1],
        parts[2],
        parts[1],
        parts[2]
    ))
}
pub(crate) fn neo_prefix(game: &str) -> String {
    if let Some(rest) = game.strip_prefix("1.") {
        let mut parts = rest.split('.');
        format!(
            "{}.{}.",
            parts.next().unwrap_or(""),
            parts.next().unwrap_or("0")
        )
    } else {
        format!("{game}.")
    }
}
pub fn resolve_loader_version(
    loader: Loader,
    game: &str,
    requested: &str,
    progress: Reporter,
    cancel: Arc<AtomicBool>,
) -> Result<String, String> {
    identifier(game)?;
    identifier(requested)?;
    cancelled(&cancel)?;
    if loader == Loader::Vanilla {
        return Err("Vanilla does not have a loader version.".into());
    }
    if !matches!(requested, "stable" | "latest") {
        return Ok(requested.into());
    }
    if loader == Loader::Fabric {
        return resolve_fabric_version(game, requested, progress, cancel);
    }
    let d = Downloader::new(progress, cancel)?;
    if loader == Loader::Quilt {
        let catalogue = d.json(
            &format!("https://meta.quiltmc.org/v3/versions/loader/{game}"),
            8 * 1024 * 1024,
        )?;
        let entries = catalogue
            .as_array()
            .filter(|a| a.len() <= 4096)
            .ok_or("Invalid Quilt catalogue.")?;
        for entry in entries {
            if let Some(version) = entry["loader"]["version"].as_str() {
                identifier(version)?;
                if requested == "latest"
                    || entry["loader"]["stable"]
                        .as_bool()
                        .unwrap_or_else(|| stable(version))
                {
                    return Ok(version.into());
                }
            }
        }
    } else {
        let (base, artifact) = forge_repository(loader.clone(), game)?;
        let text = d.text(
            &format!("{base}{artifact}/maven-metadata.xml"),
            8 * 1024 * 1024,
        )?;
        let prefix = if loader == Loader::Forge || game == "1.20.1" {
            format!("{game}-")
        } else {
            neo_prefix(game)
        };
        let pattern = regex::Regex::new(r"<version>([^<]+)</version>").unwrap();
        let mut versions = pattern
            .captures_iter(&text)
            .filter_map(|c| {
                let raw = c.get(1)?.as_str();
                if !raw.starts_with(&prefix) {
                    return None;
                }
                let version = if loader == Loader::Forge || game == "1.20.1" {
                    &raw[prefix.len()..]
                } else {
                    raw
                };
                (identifier(version).is_ok() && (requested == "latest" || stable(version)))
                    .then(|| version.to_owned())
            })
            .collect::<Vec<_>>();
        // Repositories may rebuild metadata out of publication order.
        versions.sort_by_cached_key(|v| numeric_key(v));
        if let Some(version) = versions.pop() {
            return Ok(version);
        }
    }
    Err(format!(
        "No {requested} {loader:?} loader is available for Minecraft {game}. Choose a compatible version."
    ))
}
fn numeric_key(version: &str) -> String {
    let digits = regex::Regex::new(r"[0-9]+").unwrap();
    digits
        .replace_all(version, |c: &regex::Captures<'_>| {
            c[0].parse::<u64>()
                .map(|n| format!("{n:020}"))
                .unwrap_or_else(|_| c[0].into())
        })
        .into_owned()
}

fn stable(version: &str) -> bool {
    let value = version.to_ascii_lowercase();
    !["alpha", "beta", "snapshot", "rc"]
        .iter()
        .any(|s| value.contains(s))
}
pub(crate) fn forge_repository(
    loader: Loader,
    game: &str,
) -> Result<(&'static str, &'static str), String> {
    match loader {
        Loader::Forge => Ok((
            "https://maven.minecraftforge.net/",
            "net/minecraftforge/forge",
        )),
        Loader::NeoForge if game == "1.20.1" => Ok((
            "https://maven.neoforged.net/releases/",
            "net/neoforged/forge",
        )),
        Loader::NeoForge => Ok((
            "https://maven.neoforged.net/releases/",
            "net/neoforged/neoforge",
        )),
        _ => Err("Not a Forge-family loader.".into()),
    }
}
// Replace matching library coordinates, preserving native classifiers and base game assets.
pub(crate) fn merge(base: &Value, profile: &Value, game: &str) -> Result<Value, String> {
    if profile["inheritsFrom"].as_str() != Some(game) {
        return Err("The loader profile targets a different Minecraft version.".into());
    }
    let main = profile["mainClass"]
        .as_str()
        .filter(|s| {
            !s.is_empty()
                && s.len() <= 256
                && s.bytes()
                    .all(|c| c.is_ascii_alphanumeric() || b"._$".contains(&c))
        })
        .ok_or("Invalid loader main class.")?;
    let mut merged = base.clone();
    merged["mainClass"] = main.into();
    merged["id"] = profile["id"].clone();
    if let Some(legacy) = profile["minecraftArguments"].as_str() {
        merged["minecraftArguments"] = legacy.into();
        merged["arguments"] = Value::Null;
    } else {
        for kind in ["jvm", "game"] {
            if let Some(extra) = profile["arguments"][kind].as_array() {
                if extra.len() > 512 {
                    return Err("Too many loader arguments.".into());
                }
                let args = merged["arguments"][kind]
                    .as_array_mut()
                    .ok_or("This loader requires a newer Minecraft argument format.")?;
                args.extend(extra.iter().cloned());
            }
        }
    }
    let libs = merged["libraries"]
        .as_array_mut()
        .ok_or("Missing Minecraft libraries.")?;
    for library in profile["libraries"]
        .as_array()
        .filter(|a| a.len() <= 1024)
        .ok_or("Invalid loader libraries.")?
    {
        let name = library["name"]
            .as_str()
            .ok_or("Missing library coordinate.")?;
        coordinate(name)?;
        let key = library_key(name);
        libs.retain(|l| l["name"].as_str().map(library_key).as_ref() != Some(&key));
        libs.push(library.clone());
    }
    Ok(merged)
}
fn library_key(name: &str) -> String {
    let parts = name.split(':').collect::<Vec<_>>();
    format!(
        "{}:{}:{}",
        parts.first().unwrap_or(&""),
        parts.get(1).unwrap_or(&""),
        parts.get(3).unwrap_or(&"")
    )
}
pub(crate) fn quilt(
    root: &Path,
    game: &str,
    version: &str,
    d: &Downloader,
) -> Result<Value, String> {
    identifier(game)?;
    identifier(version)?;
    let mut profile = d.json(
        &format!("https://meta.quiltmc.org/v3/versions/loader/{game}/{version}/profile/json"),
        4 * 1024 * 1024,
    )?;
    if profile["id"].as_str() != Some(format!("quilt-loader-{version}-{game}").as_str())
        || profile["inheritsFrom"].as_str() != Some(game)
        || profile["mainClass"].as_str() != Some("org.quiltmc.loader.impl.launch.knot.KnotClient")
    {
        return Err("Quilt does not match the selected Minecraft and loader versions.".into());
    }
    let libraries = profile["libraries"]
        .as_array_mut()
        .filter(|a| !a.is_empty() && a.len() <= 256)
        .ok_or("Invalid Quilt libraries.")?;
    if !libraries
        .iter()
        .any(|l| l["name"].as_str() == Some(format!("org.quiltmc:quilt-loader:{version}").as_str()))
    {
        return Err("Missing selected Quilt loader.".into());
    }
    for library in libraries {
        let path = coordinate(
            library["name"]
                .as_str()
                .ok_or("Missing Quilt library name.")?,
        )?;
        let base = library["url"]
            .as_str()
            .ok_or("Missing Quilt library source.")?;
        if !matches!(
            base,
            "https://maven.fabricmc.net/" | "https://maven.quiltmc.org/repository/release/"
        ) {
            return Err("Unrecognized Quilt library source.".into());
        }
        let url = format!("{base}{path}");
        let hash = d.checksum(&format!("{url}.sha1"))?;
        let artifact = json!({"path":path,"url":url,"sha1":hash});
        d.artifact(
            &artifact,
            &safe_join(&root.join("libraries"), &path)?,
            256 * 1024 * 1024,
        )?;
        library["downloads"] = json!({"artifact":artifact});
    }
    Ok(profile)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn coordinates_handle_classifiers_and_extensions_without_traversal() {
        assert_eq!(
            coordinate("net.neoforged:neoform:1.21.1:mappings@txt").unwrap(),
            "net/neoforged/neoform/1.21.1/neoform-1.21.1-mappings.txt"
        );
        for bad in [
            "../x:y:z",
            "a:b:..",
            "a:b:c:d:e",
            "a:b:c@../exe",
            "a:b:c/evil",
        ] {
            assert!(coordinate(bad).is_err(), "{bad}");
        }
        assert_eq!(neo_prefix("1.21.1"), "21.1.");
        assert_eq!(neo_prefix("26.1.2"), "26.1.2.");
    }
    #[test]
    fn profile_merge_replaces_main_artifacts_but_keeps_natives_and_assets() {
        let base = json!({"assetIndex":{"id":"17"},"javaVersion":{"majorVersion":21},"mainClass":"base.Main","arguments":{"jvm":["-cp","${classpath}"],"game":["--username","${auth_player_name}"]},"libraries":[{"name":"org.ow2.asm:asm:9.0"},{"name":"org.ow2.asm:asm:9.0:natives-windows"}]});
        let profile = json!({"id":"quilt-loader-1-1.21.1","inheritsFrom":"1.21.1","mainClass":"org.quiltmc.loader.impl.launch.knot.KnotClient","arguments":{"game":[]},"libraries":[{"name":"org.ow2.asm:asm:9.7"}]});
        let merged = merge(&base, &profile, "1.21.1").unwrap();
        assert_eq!(merged["libraries"].as_array().unwrap().len(), 2);
        assert_eq!(merged["assetIndex"], base["assetIndex"]);
        assert_eq!(merged["javaVersion"], base["javaVersion"]);
        assert_eq!(merged["arguments"], base["arguments"]);
        assert!(merge(&base, &profile, "1.20.1").is_err());
    }
    #[test]
    #[ignore = "downloads official Quilt metadata and verified libraries"]
    fn official_quilt_install_smoke() {
        let root = tempfile::tempdir().unwrap();
        let cancel = Arc::new(AtomicBool::new(false));
        let d = Downloader::new(Arc::new(|_| {}), cancel).unwrap();
        let profile = quilt(root.path(), "1.20.1", "0.28.1", &d).unwrap();
        assert_eq!(profile["inheritsFrom"], "1.20.1");
        for lib in profile["libraries"].as_array().unwrap() {
            let a = &lib["downloads"]["artifact"];
            let p = safe_join(&root.path().join("libraries"), a["path"].as_str().unwrap()).unwrap();
            assert!(files::verified(&p, "sha1", a["sha1"].as_str().unwrap(), None).unwrap());
        }
    }
    #[test]
    fn official_quilt_fixture_preserves_mojang_runtime_and_arguments() {
        let profile: Value =
            serde_json::from_str(include_str!("../tests/fixtures/quilt-1.20.1-0.28.1.json"))
                .unwrap();
        let base = json!({"mainClass":"net.minecraft.client.main.Main","arguments":{"jvm":["-cp","${classpath}"],"game":[]},"libraries":[],"assetIndex":{"id":"5"},"javaVersion":{"majorVersion":17}});
        let merged = merge(&base, &profile, "1.20.1").unwrap();
        assert_eq!(
            merged["mainClass"],
            "org.quiltmc.loader.impl.launch.knot.KnotClient"
        );
        assert_eq!(merged["assetIndex"], base["assetIndex"]);
        assert_eq!(merged["javaVersion"], base["javaVersion"]);
        assert_eq!(merged["arguments"]["jvm"], base["arguments"]["jvm"]);
    }
    #[test]
    fn numeric_release_order_does_not_treat_nine_as_newer_than_ten() {
        assert!(numeric_key("47.3.10") > numeric_key("47.3.9"));
        assert!(numeric_key("21.1.172") > numeric_key("21.1.99"));
    }
}
