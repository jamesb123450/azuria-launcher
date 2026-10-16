use super::*;
pub fn java(
    root: &Path,
    major: u64,
    component: &str,
    custom: Option<&str>,
    downloader: &Downloader,
    cancel: &AtomicBool,
) -> Result<PathBuf, String> {
    if let Some(path) = custom {
        let executable = PathBuf::from(path);
        if !executable.is_absolute() || !executable.is_file() {
            return Err(
                "Choose an absolute path to an installed Java executable in instance settings."
                    .into(),
            );
        }
        validate(&executable, major)?;
        return Ok(executable);
    }
    let home = safe_join(root, &format!("runtimes/{component}"))?;
    let catalog=downloader.json("https://piston-meta.mojang.com/v1/products/java-runtime/2ec0cc96c44e5a76b9c8b7c39df7210883d12871/all.json",8*1024*1024)?;
    let selected = catalog["windows-x64"][component]
        .as_array()
        .and_then(|a| a.first())
        .ok_or("No matching Mojang Java runtime is available. Choose a custom Java executable.")?;
    let manifest_path = safe_join(root, &format!("runtime-manifests/{component}.json"))?;
    downloader.artifact(&selected["manifest"], &manifest_path, 16 * 1024 * 1024)?;
    let manifest: Value = serde_json::from_slice(&fs::read(manifest_path).map_err(files::io)?)
        .map_err(|_| "Invalid Java runtime manifest.")?;
    let files = manifest["files"]
        .as_object()
        .ok_or("Missing Java runtime files.")?;
    for (name, file) in files {
        cancelled(cancel)?;
        let path = safe_join(&home, name)?;
        match file["type"].as_str() {
            Some("directory") => fs::create_dir_all(path).map_err(files::io)?,
            Some("file") => {
                downloader.artifact(&file["downloads"]["raw"], &path, 512 * 1024 * 1024)?
            }
            _ => {
                return Err(
                    "Unsupported Java runtime file type. Choose a custom Java installation.".into(),
                )
            }
        }
    }
    let java = find_java(&home, 0)?.ok_or("The prepared Java runtime has no executable.")?;
    validate(&java, major)?;
    Ok(java)
}

fn find_java(root: &Path, depth: usize) -> Result<Option<PathBuf>, String> {
    files::plain(root)?;
    if !root.exists() || depth > 4 {
        return Ok(None);
    }
    let exe = root.join("bin/java.exe");
    files::plain(&exe)?;
    if exe.is_file() {
        return Ok(Some(exe));
    }
    for entry in fs::read_dir(root).map_err(files::io)?.take(128) {
        let path = entry.map_err(files::io)?.path();
        files::plain(&path)?;
        if path.is_dir() {
            if let Some(java) = find_java(&path, depth + 1)? {
                return Ok(Some(java));
            }
        }
    }
    Ok(None)
}
pub fn major_version(text: &str) -> Option<u64> {
    let version = text.split('"').nth(1)?;
    let mut parts = version.split(['.', '-', '+']);
    let first = parts.next()?.parse().ok()?;
    if first == 1 {
        parts.next()?.parse().ok()
    } else {
        Some(first)
    }
}
fn validate(executable: &Path, expected: u64) -> Result<(), String> {
    // javaw.exe does not expose console version output; its sibling does.
    let probe = if executable
        .file_name()
        .is_some_and(|n| n.to_string_lossy().eq_ignore_ascii_case("javaw.exe"))
    {
        executable.with_file_name("java.exe")
    } else {
        executable.to_path_buf()
    };
    let mut command = Command::new(probe);
    command
        .arg("-version")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    let mut child = command
        .spawn()
        .map_err(|_| "Could not inspect Java. Choose a working java.exe or javaw.exe.")?;
    for _ in 0..50 {
        if let Some(status) = child.try_wait().map_err(files::io)? {
            let output = child.wait_with_output().map_err(files::io)?;
            let text = format!(
                "{} {}",
                String::from_utf8_lossy(&output.stdout),
                String::from_utf8_lossy(&output.stderr)
            );
            if status.success() && major_version(&text) == Some(expected) {
                return Ok(());
            }
            return Err(format!("This Minecraft version requires Java {expected}. Select a matching runtime or use automatic Java."));
        }
        std::thread::sleep(Duration::from_millis(100));
    }
    let _ = child.kill();
    let _ = child.wait();
    Err("Java version detection timed out. Choose another executable.".into())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn java_versions() {
        assert_eq!(major_version("openjdk version \"21.0.6\""), Some(21));
        assert_eq!(major_version("java version \"1.8.0_442\""), Some(8));
        assert_eq!(major_version("bad"), None);
    }
}
