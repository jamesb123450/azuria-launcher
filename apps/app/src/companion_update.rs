//! Companion updates are optional during launch. Only verified, compatible JARs are selected.
use base64::{engine::general_purpose::STANDARD, Engine};
use minisign_verify::{PublicKey, Signature};
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::{
    fs::{self, File},
    io::{self, Cursor, Read, Write},
    path::Path,
    time::Duration,
};

const FEED: &str = "https://github.com/jamesb123450/azuria-releases/releases/download/companion-feed-v1/companion.json";
const BUNDLED: &[u8] = include_bytes!("../bundled/azuria-companion-mod.jar");
const MAX_JAR: usize = 1024 * 1024;
const MAX_FEED: usize = 2 * MAX_JAR;
const LEGACY: [(&str, &str); 3] = [
    (
        "0.1.0",
        "a3cc76cdceac23cca7f5fc2b3c13f79782d40275f5ebc54d98d4c97f304990f6",
    ),
    (
        "0.2.0",
        "f1a191d470665d685e805a181862c4b4a1c12298d6e8cde790bd18bf04a3602c",
    ),
    (
        "0.2.1",
        "03c0ac5de114f24771f601e9e26efca7966c7c1def713291622cc98d62a0f7ec",
    ),
];

#[derive(Deserialize)]
struct Envelope {
    jar: String,
    signature: String,
}

fn hash(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn jar_version(jar: &[u8]) -> Option<[u32; 3]> {
    let mut archive = zip::ZipArchive::new(Cursor::new(jar)).ok()?;
    let entry = archive.by_name("fabric.mod.json").ok()?;
    let mut text = Vec::new();
    entry.take(8193).read_to_end(&mut text).ok()?;
    if text.len() > 8192 {
        return None;
    }
    let metadata: serde_json::Value = serde_json::from_slice(&text).ok()?;
    if metadata["id"] != "azuria_capes"
        || metadata["depends"]["minecraft"] != "1.21.1"
        || metadata["depends"]["fabricloader"] != ">=0.16.14"
        || metadata["custom"]["azuria:bridge"] != 1
    {
        return None;
    }
    let parts: Vec<_> = metadata["version"].as_str()?.split('.').collect();
    let [major, minor, patch] = parts.as_slice() else {
        return None;
    };
    Some([
        major.parse().ok()?,
        minor.parse().ok()?,
        patch.parse().ok()?,
    ])
}

fn decode_text(value: &str) -> Option<String> {
    String::from_utf8(STANDARD.decode(value.trim()).ok()?).ok()
}

fn real_public_key() -> Option<PublicKey> {
    let config: serde_json::Value =
        serde_json::from_str(include_str!("../tauri.conf.json")).ok()?;
    let encoded = config["plugins"]["updater"]["pubkey"].as_str()?;
    PublicKey::decode(&decode_text(encoded)?).ok()
}

fn verified(feed: &[u8]) -> Option<(Vec<u8>, [u32; 3])> {
    let envelope: Envelope = serde_json::from_slice(feed).ok()?;
    let jar = STANDARD.decode(envelope.jar).ok()?;
    if jar.len() > MAX_JAR {
        return None;
    }
    let signature = Signature::decode(&decode_text(&envelope.signature)?).ok()?;
    real_public_key()?.verify(&jar, &signature, false).ok()?;
    let version = jar_version(&jar)?;
    Some((jar, version))
}

async fn download() -> Option<Vec<u8>> {
    let mut response = reqwest::Client::builder()
        .https_only(true)
        .timeout(Duration::from_secs(4))
        .build()
        .ok()?
        .get(FEED)
        .send()
        .await
        .ok()?
        .error_for_status()
        .ok()?;
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.ok()? {
        if bytes.len() + chunk.len() > MAX_FEED {
            return None;
        }
        bytes.extend_from_slice(&chunk);
    }
    Some(bytes)
}

fn read(path: &Path, max: usize) -> io::Result<Option<Vec<u8>>> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if metadata.is_file() && metadata.len() <= max as u64 => {
            let mut bytes = Vec::new();
            File::open(path)?
                .take(max as u64 + 1)
                .read_to_end(&mut bytes)?;
            if bytes.len() <= max {
                return Ok(Some(bytes));
            }
        }
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error),
        _ => {}
    }
    Err(io::Error::new(
        io::ErrorKind::InvalidData,
        "Unexpected companion file",
    ))
}

fn replace(path: &Path, bytes: &[u8]) -> io::Result<()> {
    let parent = path.parent().ok_or(io::ErrorKind::InvalidInput)?;
    let mut staged = tempfile::NamedTempFile::new_in(parent)?;
    staged.write_all(bytes)?;
    staged.as_file().sync_all()?;
    staged.persist(path).map_err(|error| error.error)?;
    Ok(())
}

pub fn install(game: &Path, online: bool) -> Result<(), String> {
    install_from(game, || {
        if online {
            tauri::async_runtime::block_on(download())
        } else {
            None
        }
    })
}

fn install_from(game: &Path, fetch: impl FnOnce() -> Option<Vec<u8>>) -> Result<(), String> {
    let io_error =
        |_: io::Error| "Could not update the managed Azuria companion files.".to_string();
    let mods = azuria_launch::safe_join(game, "mods")?;
    fs::create_dir_all(&mods).map_err(io_error)?;
    let destination = azuria_launch::safe_join(game, "mods/azuria-companion-mod.jar")?;
    let cache = azuria_launch::safe_join(game, "mods/.azuria-companion-cache.json")?;
    let ownership = azuria_launch::safe_join(game, "mods/.azuria-companion-managed")?;
    let known = read(&ownership, 195).map_err(io_error)?.unwrap_or_default();
    let known = String::from_utf8_lossy(&known);

    let current = read(&destination, MAX_JAR).map_err(io_error)?;
    let current_hash = current.as_deref().map(hash);
    if let Some(digest) = &current_hash {
        if !known.lines().any(|line| line == digest) && digest != &hash(BUNDLED) {
            return Err(
                "Move the unmanaged azuria-companion-mod.jar out of the mods folder and retry."
                    .into(),
            );
        }
    }

    let previous = azuria_launch::safe_join(game, "mods/azuria-companion.jar")?;
    let previous_hash = read(&previous, MAX_JAR)
        .map_err(io_error)?
        .as_deref()
        .map(hash);
    if previous_hash
        .as_deref()
        .is_some_and(|digest| !known.lines().any(|line| line == digest))
    {
        return Err(
            "Move the unmanaged azuria-companion.jar out of the mods folder and retry.".into(),
        );
    }

    let mut legacy = Vec::new();
    for (version, expected) in LEGACY {
        let name = format!("azuria-capes-{version}.jar");
        let path = azuria_launch::safe_join(game, &format!("mods/{name}"))?;
        if let Some(bytes) = read(&path, MAX_JAR).map_err(io_error)? {
            if hash(&bytes) != expected {
                return Err(format!(
                    "Move the modified {name} out of the mods folder before updating."
                ));
            }
            legacy.push(path);
        }
    }

    let mut selected = BUNDLED.to_vec();
    let mut version = jar_version(BUNDLED).ok_or("Invalid bundled companion metadata.")?;
    let cached = match read(&cache, MAX_FEED) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == io::ErrorKind::InvalidData => None,
        Err(error) => return Err(io_error(error)),
    };
    if let Some((jar, cached)) = cached.as_deref().and_then(verified) {
        if cached > version {
            selected = jar;
            version = cached;
        }
    }
    if let Some(feed) = fetch() {
        if let Some((jar, remote)) = verified(&feed) {
            if remote > version && replace(&cache, &feed).is_ok() {
                selected = jar;
            }
        }
    }

    let digest = hash(&selected);
    if current_hash.as_deref() != Some(&digest) {
        // Keep both previous paths recognised if the migration is interrupted.
        let journal = format!(
            "{digest}\n{}\n{}\n",
            current_hash.as_deref().unwrap_or(""),
            previous_hash.as_deref().unwrap_or(""),
        );
        replace(&ownership, journal.as_bytes()).map_err(io_error)?;
        replace(&destination, &selected).map_err(io_error)?;
    }
    if previous_hash.is_some() {
        fs::remove_file(previous).map_err(io_error)?;
    }
    for path in legacy {
        fs::remove_file(path).map_err(io_error)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn offline_preparation_migrates_the_old_bundle_and_preserves_custom_files() {
        let game = tempfile::tempdir().unwrap();
        let mods = game.path().join("mods");
        fs::create_dir(&mods).unwrap();
        let old = mods.join("azuria-capes-0.1.0.jar");
        fs::write(&old, include_bytes!("../bundled/azuria-capes-0.1.0.jar")).unwrap();
        let current = mods.join("azuria-companion-mod.jar");
        let custom = mods.join("other-mod.jar");
        fs::write(&custom, b"unrelated").unwrap();

        install_from(game.path(), || Some(b"invalid feed".to_vec())).unwrap();
        assert!(!old.exists());
        assert_eq!(fs::read(&current).unwrap(), BUNDLED);
        assert_eq!(fs::read(custom).unwrap(), b"unrelated");
        install_from(game.path(), || None).unwrap();

        fs::write(&current, b"player's own replacement").unwrap();
        assert!(install_from(game.path(), || None).is_err());
        assert_eq!(fs::read(current).unwrap(), b"player's own replacement");
    }

    #[test]
    fn upgrade_renames_only_the_previous_managed_jar() {
        let game = tempfile::tempdir().unwrap();
        let mods = game.path().join("mods");
        fs::create_dir(&mods).unwrap();
        let old = mods.join("azuria-companion.jar");
        fs::write(&old, b"previous build").unwrap();
        assert!(install_from(game.path(), || None).is_err());
        assert_eq!(fs::read(&old).unwrap(), b"previous build");

        fs::write(
            mods.join(".azuria-companion-managed"),
            hash(b"previous build"),
        )
        .unwrap();
        install_from(game.path(), || None).unwrap();
        assert!(!old.exists());
        assert_eq!(
            fs::read(mods.join("azuria-companion-mod.jar")).unwrap(),
            BUNDLED
        );
    }

    #[test]
    fn interrupted_replacement_keeps_the_previous_managed_copy_upgradeable() {
        let game = tempfile::tempdir().unwrap();
        let mods = game.path().join("mods");
        fs::create_dir(&mods).unwrap();
        let current = mods.join("azuria-companion-mod.jar");
        fs::write(&current, b"previous build").unwrap();
        fs::write(
            mods.join(".azuria-companion-managed"),
            format!("{}\n{}\n", hash(BUNDLED), hash(b"previous build")),
        )
        .unwrap();
        install_from(game.path(), || None).unwrap();
        assert_eq!(fs::read(current).unwrap(), BUNDLED);
    }
}
