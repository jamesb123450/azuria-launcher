use super::*;
use reqwest::blocking::Client;
use sha1::{Digest, Sha1};
use sha2::Sha256;
use std::{
    io::{Read, Write},
    path::Component,
};
pub fn io(_: impl std::fmt::Display) -> String {
    "Could not read or write launcher files. Check disk space, folder permissions and antivirus access, then retry.".into()
}
pub fn plain(path: &Path) -> Result<(), String> {
    if let Ok(m) = fs::symlink_metadata(path) {
        #[cfg(windows)]
        {
            use std::os::windows::fs::MetadataExt;
            if m.file_attributes() & 0x400 != 0 {
                return Err("Linked launcher paths are not supported.".into());
            }
        }
        if m.file_type().is_symlink() {
            return Err("Linked launcher paths are not supported.".into());
        }
    }
    Ok(())
}
pub fn safe_join(root: &Path, name: &str) -> Result<PathBuf, String> {
    if name.is_empty()
        || name.contains(['\\', ':', '\0'])
        || Path::new(name)
            .components()
            .any(|c| !matches!(c, Component::Normal(_)))
        || name.split('/').any(|n| {
            n.is_empty() || n.ends_with(['.', ' ']) || {
                let stem = n.split('.').next().unwrap_or("").to_ascii_uppercase();
                matches!(stem.as_str(), "CON" | "NUL" | "AUX" | "PRN")
                    || (stem.len() == 4
                        && (stem.starts_with("COM") || stem.starts_with("LPT"))
                        && stem.as_bytes()[3].is_ascii_digit())
            }
        })
    {
        return Err("Unsafe path in game metadata. No game files were changed.".into());
    }
    let path = root.join(name);
    for ancestor in path.ancestors() {
        plain(ancestor)?;
    }
    Ok(path)
}
fn trusted_url(url: &reqwest::Url) -> bool {
    url.scheme() == "https"
        && url.port().is_none()
        && url.username().is_empty()
        && url.password().is_none()
        && matches!(
            url.host_str(),
            Some(
                "piston-meta.mojang.com"
                    | "piston-data.mojang.com"
                    | "libraries.minecraft.net"
                    | "resources.download.minecraft.net"
                    | "launchermeta.mojang.com"
                    | "launcher.mojang.com"
                    | "launchercontent.mojang.com"
                    | "meta.fabricmc.net"
                    | "maven.fabricmc.net"
            )
        )
}
pub struct Downloader {
    client: Client,
    progress: Reporter,
    cancel: Arc<AtomicBool>,
}
impl Downloader {
    pub fn new(progress: Reporter, cancel: Arc<AtomicBool>) -> Result<Self, String> {
        let _ = rustls::crypto::ring::default_provider().install_default();
        let client = Client::builder()
            .https_only(true)
            .connect_timeout(Duration::from_secs(20))
            .timeout(Duration::from_secs(180))
            .redirect(reqwest::redirect::Policy::custom(|attempt| {
                if attempt.previous().len() >= 6 || !trusted_url(attempt.url()) {
                    attempt.stop()
                } else {
                    attempt.follow()
                }
            }))
            .user_agent("Azuria-Launcher/0.1")
            .build()
            .map_err(|_| "Could not initialize secure game downloads.")?;
        Ok(Self {
            client,
            progress,
            cancel,
        })
    }
    fn response(&self, url: &str) -> Result<reqwest::blocking::Response, String> {
        cancelled(&self.cancel)?;
        let parsed = reqwest::Url::parse(url).map_err(|_| "Invalid game download URL.")?;
        if !trusted_url(&parsed) {
            return Err(
                "Unrecognized game download source. Update Azuria before using this version."
                    .into(),
            );
        }
        let response = self.client.get(parsed).send().map_err(|_| {
            "Could not reach the game download service. Check your connection and retry."
        })?;
        if matches!(response.status().as_u16(), 400 | 404) {
            return Err(format!("The selected game or loader files are unavailable (HTTP {}). Check the Minecraft and loader versions in instance settings.", response.status().as_u16()));
        }
        if !response.status().is_success() {
            return Err(format!(
                "The download service returned HTTP {}. Retry shortly.",
                response.status().as_u16()
            ));
        }
        Ok(response)
    }
    pub fn json(&self, url: &str, max: u64) -> Result<Value, String> {
        let response = self.response(url)?;
        let mut bytes = vec![];
        response
            .take(max + 1)
            .read_to_end(&mut bytes)
            .map_err(|_| "Metadata download was interrupted. Check your connection and retry.")?;
        if bytes.len() as u64 > max {
            return Err("Game metadata exceeded its size limit.".into());
        }
        serde_json::from_slice(&bytes)
            .map_err(|_| "The game service returned invalid metadata.".into())
    }
    pub(crate) fn checksum(&self, url: &str) -> Result<String, String> {
        let mut bytes = Vec::new();
        self.response(url)?
            .take(257)
            .read_to_end(&mut bytes)
            .map_err(|_| "Could not read the Fabric library checksum.")?;
        let hash = std::str::from_utf8(&bytes)
            .map_err(|_| "Invalid Fabric library checksum.")?
            .trim();
        if hash.len() != 40 || !hash.bytes().all(|c| c.is_ascii_hexdigit()) {
            return Err("Invalid Fabric library checksum.".into());
        }
        Ok(hash.into())
    }
    pub fn artifact(&self, meta: &Value, path: &Path, max: u64) -> Result<(), String> {
        cancelled(&self.cancel)?;
        plain(path)?;
        let (kind, expected) = if let Some(hash) = meta["sha256"].as_str() {
            ("sha256", hash)
        } else {
            (
                "sha1",
                meta["sha1"]
                    .as_str()
                    .ok_or("The download has no verification hash.")?,
            )
        };
        let expected_len = if kind == "sha256" { 64 } else { 40 };
        if expected.len() != expected_len || !expected.bytes().all(|c| c.is_ascii_hexdigit()) {
            return Err("Invalid download verification hash.".into());
        }
        let size = meta["size"].as_u64();
        if size.is_some_and(|n| n > max) {
            return Err("This download exceeds the supported file size.".into());
        }
        if verified(path, kind, expected, size)? {
            return Ok(());
        }
        fs::create_dir_all(path.parent().ok_or("Invalid cache path.")?).map_err(io)?;
        let temp = path.with_extension(format!("azuria-{}.part", std::process::id()));
        plain(&temp)?;
        if temp.exists() {
            fs::remove_file(&temp).map_err(io)?;
        }
        let result = (|| {
            let response =
                self.response(meta["url"].as_str().ok_or("Missing game download URL.")?)?;
            let mut output = fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&temp)
                .map_err(io)?;
            let mut source = response;
            let mut read = 0u64;
            let mut buffer = [0; 65536];
            let mut last = std::time::Instant::now();
            loop {
                cancelled(&self.cancel)?;
                let n = source.read(&mut buffer).map_err(|_| {
                    "Game download was interrupted. Retry to reuse completed files."
                })?;
                if n == 0 {
                    break;
                }
                read += n as u64;
                if read > max {
                    return Err("Download exceeded its size limit.".into());
                }
                output.write_all(&buffer[..n]).map_err(io)?;
                if last.elapsed() > Duration::from_millis(200) {
                    report(
                        &self.progress,
                        "download",
                        &format!(
                            "Downloading {}",
                            path.file_name().unwrap_or_default().to_string_lossy()
                        ),
                        read,
                        size.unwrap_or(0),
                    );
                    last = std::time::Instant::now();
                }
            }
            output.sync_all().map_err(io)?;
            drop(output);
            if !verified(&temp, kind, expected, size)? {
                return Err(
                    "Download verification failed. The file was not installed; retry the download."
                        .into(),
                );
            }
            plain(path)?;
            if path.exists() {
                fs::remove_file(path).map_err(io)?;
            }
            fs::rename(&temp, path).map_err(io)
        })();
        if result.is_err() {
            let _ = fs::remove_file(&temp);
        }
        result
    }
}
pub fn verified(path: &Path, kind: &str, hash: &str, size: Option<u64>) -> Result<bool, String> {
    plain(path)?;
    if !path.exists() {
        return Ok(false);
    }
    let mut file = fs::File::open(path).map_err(io)?;
    if size.is_some_and(|n| file.metadata().map(|m| m.len() != n).unwrap_or(true)) {
        return Ok(false);
    }
    let mut sha1 = Sha1::new();
    let mut sha256 = Sha256::new();
    let mut buffer = [0; 65536];
    loop {
        let n = file.read(&mut buffer).map_err(io)?;
        if n == 0 {
            break;
        }
        if kind == "sha256" {
            sha256.update(&buffer[..n]);
        } else {
            sha1.update(&buffer[..n]);
        }
    }
    let actual = if kind == "sha256" {
        format!("{:x}", sha256.finalize())
    } else {
        format!("{:x}", sha1.finalize())
    };
    Ok(actual.eq_ignore_ascii_case(hash))
}
pub fn copy_verified(source: &Path, target: &Path, hash: &str) -> Result<(), String> {
    if verified(target, "sha1", hash, None)? {
        return Ok(());
    }
    fs::create_dir_all(target.parent().ok_or("Invalid asset path.")?).map_err(io)?;
    plain(target)?;
    fs::copy(source, target).map_err(io)?;
    if !verified(target, "sha1", hash, None)? {
        return Err("Could not verify the prepared game asset.".into());
    }
    Ok(())
}
pub fn extract_zip(
    archive: &Path,
    target: &Path,
    excludes: &[String],
    cancel: &AtomicBool,
) -> Result<(), String> {
    let file = fs::File::open(archive).map_err(io)?;
    let mut zip =
        zip::ZipArchive::new(file).map_err(|_| "Downloaded archive is not a valid ZIP.")?;
    let mut total = 0u64;
    if zip.len() > 50000 {
        return Err("Archive contains too many files.".into());
    }
    for n in 0..zip.len() {
        cancelled(cancel)?;
        let mut entry = zip
            .by_index(n)
            .map_err(|_| "Could not read the downloaded archive.")?;
        if entry.is_dir() {
            continue;
        }
        let name = entry.name().to_owned();
        if excludes.iter().any(|prefix| name.starts_with(prefix)) || name.starts_with("META-INF/") {
            continue;
        }
        if entry.unix_mode().is_some_and(|m| m & 0o170000 == 0o120000) {
            return Err("Linked archive entries are not supported.".into());
        }
        total = total
            .checked_add(entry.size())
            .ok_or("Archive is too large.")?;
        if entry.size() > 256 * 1024 * 1024 || total > 2 * 1024 * 1024 * 1024 {
            return Err("Archive exceeded its extraction limit.".into());
        }
        let path = safe_join(target, &name)?;
        fs::create_dir_all(path.parent().ok_or("Invalid extraction path.")?).map_err(io)?;
        let temp = path.with_extension("azuria-extract.part");
        plain(&temp)?;
        if temp.exists() {
            fs::remove_file(&temp).map_err(io)?;
        }
        let mut output = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temp)
            .map_err(io)?;
        let count = std::io::copy(&mut entry.by_ref().take(256 * 1024 * 1024 + 1), &mut output)
            .map_err(|_| "Archive extraction failed its integrity check.")?;
        if count != entry.size() {
            let _ = fs::remove_file(&temp);
            return Err("Archive size did not match its manifest.".into());
        }
        output.sync_all().map_err(io)?;
        drop(output);
        plain(&path)?;
        if path.exists() {
            fs::remove_file(&path).map_err(io)?;
        }
        fs::rename(temp, path).map_err(io)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn download_hosts_and_redirects_are_restricted() {
        for url in [
            "https://meta.fabricmc.net/v2/versions",
            "https://maven.fabricmc.net/library.jar",
            "https://libraries.minecraft.net/library.jar",
        ] {
            assert!(trusted_url(&reqwest::Url::parse(url).unwrap()));
        }
        for url in [
            "http://maven.fabricmc.net/library.jar",
            "https://maven.fabricmc.net.evil.example/library.jar",
            "https://user@maven.fabricmc.net/library.jar",
            "https://maven.fabricmc.net:8443/library.jar",
        ] {
            assert!(!trusted_url(&reqwest::Url::parse(url).unwrap()));
        }
    }
    fn archive(path: &Path, name: &str) {
        let file = fs::File::create(path).unwrap();
        let mut zip = zip::ZipWriter::new(file);
        zip.start_file(name, zip::write::SimpleFileOptions::default())
            .unwrap();
        zip.write_all(b"native bytes").unwrap();
        zip.finish().unwrap();
    }
    #[test]
    fn native_archives_extract_and_cannot_escape() {
        let d = tempfile::tempdir().unwrap();
        let file = d.path().join("test.zip");
        let target = d.path().join("natives");
        archive(&file, "folder/library.dll");
        extract_zip(&file, &target, &[], &AtomicBool::new(false)).unwrap();
        assert_eq!(
            fs::read(target.join("folder/library.dll")).unwrap(),
            b"native bytes"
        );
        archive(&file, "../escape.dll");
        assert!(extract_zip(&file, &target, &[], &AtomicBool::new(false)).is_err());
        assert!(!d.path().join("escape.dll").exists());
    }
    #[cfg(unix)]
    #[test]
    fn linked_cache_path_is_rejected() {
        let d = tempfile::tempdir().unwrap();
        let external = tempfile::tempdir().unwrap();
        std::os::unix::fs::symlink(external.path(), d.path().join("linked")).unwrap();
        assert!(safe_join(d.path(), "linked/library.jar").is_err());
    }
}
