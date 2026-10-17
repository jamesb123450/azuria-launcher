//! Windows x64 Vanilla preparation. Credentials are native-only and never serializable.
mod files;
mod metadata;
mod runtime;
use azuria_core::preferences::LaunchOptions;
pub use files::{safe_join, Downloader};
pub use metadata::{allowed, arguments};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::BTreeMap,
    fs,
    io::{BufRead, BufReader, Read, Write},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::Duration,
};

pub const MANIFEST: &str = "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";
#[derive(Clone, Debug, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Progress {
    pub stage: String,
    pub message: String,
    pub completed: u64,
    pub total: u64,
}
pub type Reporter = Arc<dyn Fn(Progress) + Send + Sync>;
pub fn report(progress: &Reporter, stage: &str, message: &str, completed: u64, total: u64) {
    progress(Progress {
        stage: stage.into(),
        message: message.into(),
        completed,
        total,
    });
}
pub fn cancelled(cancel: &AtomicBool) -> Result<(), String> {
    if cancel.load(Ordering::Relaxed) {
        Err("Preparation cancelled. Verified downloads are retained for retry.".into())
    } else {
        Ok(())
    }
}
pub struct Credentials {
    pub username: String,
    pub uuid: String,
    pub access_token: String,
    pub client_id: String,
    pub xuid: Option<String>,
}
pub struct Prepared {
    pub java: PathBuf,
    pub game: PathBuf,
    pub natives: PathBuf,
    pub libraries: PathBuf,
    pub assets: PathBuf,
    pub classpath: Vec<PathBuf>,
    pub metadata: Value,
    pub options: LaunchOptions,
    pub version: String,
    pub logging_argument: Option<String>,
}
impl Prepared {
    pub fn command_arguments(&self, account: &Credentials) -> Result<Vec<String>, String> {
        let index = self.metadata["assetIndex"]["id"]
            .as_str()
            .ok_or("Missing asset index.")?;
        let classpath = self
            .classpath
            .iter()
            .map(|p| p.to_str().ok_or("Unsupported character in library path."))
            .collect::<Result<Vec<_>, _>>()?
            .join(";");
        let mut vars = BTreeMap::from([
            ("auth_player_name", account.username.clone()),
            ("auth_uuid", account.uuid.clone()),
            ("auth_access_token", account.access_token.clone()),
            (
                "auth_session",
                format!("token:{}:{}", account.access_token, account.uuid),
            ),
            ("user_type", "msa".into()),
            ("version_name", self.version.clone()),
            (
                "version_type",
                self.metadata["type"].as_str().unwrap_or("release").into(),
            ),
            ("game_directory", self.game.display().to_string()),
            ("assets_root", self.assets.display().to_string()),
            (
                "game_assets",
                self.assets
                    .join("virtual")
                    .join(index)
                    .display()
                    .to_string(),
            ),
            ("assets_index_name", index.into()),
            ("natives_directory", self.natives.display().to_string()),
            ("library_directory", self.libraries.display().to_string()),
            ("classpath", classpath.clone()),
            ("classpath_separator", ";".into()),
            ("launcher_name", "Azuria".into()),
            ("launcher_version", env!("CARGO_PKG_VERSION").into()),
            ("resolution_width", self.options.window.width.to_string()),
            ("resolution_height", self.options.window.height.to_string()),
            ("user_properties", "{}".into()),
            ("clientid", account.client_id.clone()),
            ("auth_xuid", account.xuid.clone().unwrap_or_default()),
        ]);
        vars.insert(
            "quickPlayPath",
            self.game.join("quickplay.json").display().to_string(),
        );
        let mut args = if self.metadata["arguments"]["jvm"].is_array() {
            arguments(&self.metadata["arguments"]["jvm"], &vars, true)?
        } else {
            vec![
                format!("-Djava.library.path={}", self.natives.display()),
                "-cp".into(),
                classpath,
            ]
        };
        if let Some(logging) = &self.logging_argument {
            args.push(logging.clone());
        }
        args.extend(self.options.java_arguments.clone());
        args.push(format!("-Xmx{}M", self.options.memory_mb));
        args.push(
            self.metadata["mainClass"]
                .as_str()
                .filter(|s| !s.is_empty())
                .ok_or("Missing Minecraft main class.")?
                .into(),
        );
        if self.metadata["arguments"]["game"].is_array() {
            args.extend(arguments(&self.metadata["arguments"]["game"], &vars, true)?);
        } else {
            let legacy = self.metadata["minecraftArguments"]
                .as_str()
                .ok_or("Unsupported Minecraft argument format.")?;
            let parsed =
                shell_words::split(legacy).map_err(|_| "Invalid legacy game arguments.")?;
            args.extend(metadata::substitute(parsed, &vars)?);
            args.extend([
                "--width".into(),
                self.options.window.width.to_string(),
                "--height".into(),
                self.options.window.height.to_string(),
            ]);
        }
        if self.options.window.fullscreen {
            args.push("--fullscreen".into());
        }
        Ok(args)
    }
    pub fn start(&self, account: Credentials) -> Result<Running, String> {
        let args = self.command_arguments(&account)?;
        let logs = safe_join(&self.game, "logs")?;
        fs::create_dir_all(&logs).map_err(|_| "Could not create the instance logs folder.")?;
        let log_path = safe_join(&logs, "azuria-launch.log")?;
        let log = fs::OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .open(log_path)
            .map_err(|_| {
                "Could not open the launcher log. Close other programs using this instance."
            })?;
        let log = Arc::new(Mutex::new((log, 0usize)));
        let mut command = Command::new(&self.java);
        command
            .current_dir(&self.game)
            .args(args)
            .envs(&self.options.environment)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x08000000);
        }
        let mut child = command.spawn().map_err(|_| {
            "Could not start Java. Check the configured executable and antivirus permissions."
        })?;
        let mut secrets = vec![account.access_token];
        secrets.extend(
            self.options
                .environment
                .values()
                .filter(|s| s.len() > 3)
                .cloned(),
        );
        let mut readers = vec![];
        for pipe in [
            child
                .stdout
                .take()
                .map(|s| Box::new(s) as Box<dyn std::io::Read + Send>),
            child
                .stderr
                .take()
                .map(|s| Box::new(s) as Box<dyn std::io::Read + Send>),
        ]
        .into_iter()
        .flatten()
        {
            let log = log.clone();
            let secrets = secrets.clone();
            readers.push(std::thread::spawn(move || {
                let mut reader = BufReader::new(pipe);
                loop {
                    let mut line = vec![];
                    let read = reader.by_ref().take(65536).read_until(b'\n', &mut line);
                    if !matches!(read,Ok(n) if n>0) {
                        break;
                    }
                    let text = if line.len() == 65536 && line.last() != Some(&b'\n') {
                        loop {
                            line.clear();
                            let read = reader.by_ref().take(65536).read_until(b'\n', &mut line);
                            if !matches!(read,Ok(n) if n>0) || line.last() == Some(&b'\n') {
                                break;
                            }
                        }
                        "[Oversized log line omitted]\n".into()
                    } else {
                        redact(&String::from_utf8_lossy(&line), &secrets)
                    };
                    if let Ok(mut output) = log.lock() {
                        if output.1 < 20 * 1024 * 1024 {
                            let _ = output.0.write_all(text.as_bytes());
                            output.1 += text.len();
                        }
                    }
                }
            }));
        }
        Ok(Running { child, readers })
    }
}
pub struct Running {
    child: Child,
    readers: Vec<std::thread::JoinHandle<()>>,
}
impl Running {
    pub fn wait(self) -> Result<Option<i32>, String> {
        self.wait_with_cancel(Arc::new(AtomicBool::new(false)))
    }
    pub fn wait_with_cancel(mut self, cancel: Arc<AtomicBool>) -> Result<Option<i32>, String> {
        let status = loop {
            if let Some(status) = self
                .child
                .try_wait()
                .map_err(|_| "Could not read the game exit status.")?
            {
                break status;
            }
            if cancel.load(Ordering::Relaxed) {
                if self.child.kill().is_err() {
                    if let Some(status) = self
                        .child
                        .try_wait()
                        .map_err(|_| "Could not read the game exit status.")?
                    {
                        break status;
                    }
                    return Err("Could not stop Minecraft. Close it from the game window.".into());
                }
                break self
                    .child
                    .wait()
                    .map_err(|_| "Could not wait for Minecraft to stop.")?;
            }
            std::thread::sleep(Duration::from_millis(100));
        };
        for reader in self.readers {
            let _ = reader.join();
        }
        Ok(status.code())
    }
}
pub fn redact(text: &str, secrets: &[String]) -> String {
    let mut result = text.to_owned();
    for secret in secrets.iter().filter(|s| !s.is_empty()) {
        result = result.replace(secret, "[hidden]");
    }
    if [
        "access_token",
        "refresh_token",
        "authorization:",
        "--accesstoken",
    ]
    .iter()
    .any(|k| result.to_lowercase().contains(k))
    {
        "[Credential line hidden]\n".into()
    } else {
        result
    }
}

pub fn prepare(
    root: &Path,
    game: &Path,
    version: &str,
    options: LaunchOptions,
    progress: Reporter,
    cancel: Arc<AtomicBool>,
) -> Result<Prepared, String> {
    options.validate()?;
    if !game.is_absolute() || !root.is_absolute() {
        return Err("Launcher storage must use an absolute path.".into());
    }
    for ancestor in root.ancestors() {
        files::plain(ancestor)?;
    }
    fs::create_dir_all(root).map_err(|_| "Could not create the game cache.")?;
    let downloader = Downloader::new(progress.clone(), cancel.clone())?;
    report(
        &progress,
        "metadata",
        "Finding the selected Minecraft version",
        0,
        0,
    );
    let manifest = downloader.json(MANIFEST, 8 * 1024 * 1024)?;
    let entry = manifest["versions"]
        .as_array()
        .and_then(|a| a.iter().find(|v| v["id"].as_str() == Some(version)))
        .ok_or("This Minecraft version is no longer listed by Mojang. Choose another version.")?;
    let versions = safe_join(root, "versions")?;
    fs::create_dir_all(&versions).map_err(files::io)?;
    let meta_path = safe_join(&versions, &format!("{version}.json"))?;
    downloader.artifact(entry, &meta_path, 16 * 1024 * 1024)?;
    let metadata: Value = serde_json::from_slice(&fs::read(&meta_path).map_err(files::io)?)
        .map_err(|_| "The downloaded version metadata is invalid.")?;
    if metadata["complianceLevel"].as_u64().unwrap_or(0) > 1 {
        return Err("This version requires a newer launcher protocol. Update Azuria first.".into());
    }
    let libraries = safe_join(root, "libraries")?;
    let assets = safe_join(root, "assets")?;
    let natives = safe_join(game, &format!(".azuria/natives/{version}"))?;
    fs::create_dir_all(&natives).map_err(files::io)?;
    let client = safe_join(&versions, &format!("{version}.jar"))?;
    report(&progress, "libraries", "Preparing game libraries", 0, 0);
    downloader.artifact(&metadata["downloads"]["client"], &client, 256 * 1024 * 1024)?;
    let mut classpath = vec![];
    for library in metadata["libraries"]
        .as_array()
        .ok_or("Missing game libraries.")?
    {
        cancelled(&cancel)?;
        if !allowed(&library["rules"], true)? {
            continue;
        }
        if library["downloads"]["artifact"].is_object() {
            let artifact = &library["downloads"]["artifact"];
            let path = safe_join(
                &libraries,
                artifact["path"].as_str().ok_or("Missing library path.")?,
            )?;
            downloader.artifact(artifact, &path, 256 * 1024 * 1024)?;
            classpath.push(path);
        }
        if let Some(classifier) = library["natives"]["windows"].as_str() {
            let key = classifier.replace("${arch}", "64");
            let artifact = &library["downloads"]["classifiers"][&key];
            let path = safe_join(
                &libraries,
                artifact["path"]
                    .as_str()
                    .ok_or("Missing Windows native library.")?,
            )?;
            downloader.artifact(artifact, &path, 256 * 1024 * 1024)?;
            let excludes = library["extract"]["exclude"]
                .as_array()
                .map(|a| {
                    a.iter()
                        .filter_map(Value::as_str)
                        .map(str::to_owned)
                        .collect::<Vec<_>>()
                })
                .unwrap_or_default();
            files::extract_zip(&path, &natives, &excludes, &cancel)?;
        }
    }
    classpath.push(client);
    report(
        &progress,
        "assets",
        "Preparing textures, sounds and other assets",
        0,
        0,
    );
    let index = &metadata["assetIndex"];
    let index_path = safe_join(
        &assets,
        &format!(
            "indexes/{}.json",
            index["id"]
                .as_str()
                .ok_or("Missing asset index identifier.")?
        ),
    )?;
    downloader.artifact(index, &index_path, 64 * 1024 * 1024)?;
    let index: Value = serde_json::from_slice(&fs::read(index_path).map_err(files::io)?)
        .map_err(|_| "Invalid asset index.")?;
    let objects = index["objects"]
        .as_object()
        .ok_or("Missing asset objects.")?;
    // A bounded pool avoids serial round trips for thousands of small assets.
    let mut unique = std::collections::BTreeMap::new();
    for asset in objects.values() {
        let hash = asset["hash"]
            .as_str()
            .filter(|h| h.len() == 40 && h.bytes().all(|c| c.is_ascii_hexdigit()))
            .ok_or("Invalid asset hash.")?;
        unique.insert(hash, asset);
    }
    let jobs = unique.into_iter().collect::<Vec<_>>();
    let next = std::sync::atomic::AtomicUsize::new(0);
    let complete = std::sync::atomic::AtomicUsize::new(0);
    let failure = Mutex::new(None::<String>);
    std::thread::scope(|scope| {
        for _ in 0..8 {
            scope.spawn(|| loop {
                if failure.lock().unwrap().is_some() {break;}
                let n=next.fetch_add(1,Ordering::Relaxed);
                let Some((hash,asset))=jobs.get(n) else {break;};
                let result=(|| {
                    cancelled(&cancel)?;
                    let path=safe_join(&assets,&format!("objects/{}/{}",&hash[..2],hash))?;
                    let metadata=serde_json::json!({
                        "url":format!("https://resources.download.minecraft.net/{}/{}",&hash[..2],hash),
                        "sha1":hash,
                        "size":asset["size"]
                    });
                    downloader.artifact(&metadata,&path,128*1024*1024)
                })();
                if let Err(error)=result {
                    let mut first=failure.lock().unwrap();
                    if first.is_none(){*first=Some(error);}
                    break;
                }
                let done=complete.fetch_add(1,Ordering::Relaxed)+1;
                if done.is_multiple_of(25)||done==jobs.len(){report(&progress,"assets","Preparing game assets",done as u64,jobs.len() as u64);}
            });
        }
    });
    if let Some(error) = failure
        .into_inner()
        .map_err(|_| "Asset preparation failed.")?
    {
        return Err(error);
    }
    if index["virtual"].as_bool() == Some(true) || index["map_to_resources"].as_bool() == Some(true)
    {
        for (name, asset) in objects {
            cancelled(&cancel)?;
            let hash = asset["hash"].as_str().ok_or("Invalid asset hash.")?;
            let path = safe_join(&assets, &format!("objects/{}/{}", &hash[..2], hash))?;
            if index["virtual"].as_bool() == Some(true)
                || index["map_to_resources"].as_bool() == Some(true)
            {
                let destination = if index["map_to_resources"].as_bool() == Some(true) {
                    safe_join(game, &format!("resources/{name}"))?
                } else {
                    safe_join(
                        &assets,
                        &format!(
                            "virtual/{}/{name}",
                            metadata["assetIndex"]["id"].as_str().unwrap()
                        ),
                    )?
                };
                files::copy_verified(&path, &destination, hash)?;
            }
        }
    }
    let logging_argument = if metadata["logging"]["client"].is_object() {
        let logging = &metadata["logging"]["client"];
        let file = &logging["file"];
        let path = safe_join(
            root,
            &format!(
                "log-configs/{}",
                file["id"]
                    .as_str()
                    .ok_or("Missing logging configuration identifier.")?
            ),
        )?;
        downloader.artifact(file, &path, 8 * 1024 * 1024)?;
        Some(
            logging["argument"]
                .as_str()
                .ok_or("Missing logging configuration argument.")?
                .replace("${path}", &path.display().to_string()),
        )
    } else {
        None
    };
    let major = metadata["javaVersion"]["majorVersion"]
        .as_u64()
        .unwrap_or(8);
    report(&progress, "java", "Checking the Java runtime", 0, 0);
    let java = runtime::java(
        root,
        major,
        metadata["javaVersion"]["component"]
            .as_str()
            .unwrap_or("jre-legacy"),
        options.java_path.as_deref(),
        &downloader,
        &cancel,
    )?;
    cancelled(&cancel)?;
    Ok(Prepared {
        java,
        game: game.into(),
        natives,
        libraries,
        assets,
        classpath,
        metadata,
        options,
        version: version.into(),
        logging_argument,
    })
}
