use azuria_core::preferences::LaunchOptions;
use azuria_launch::{allowed, arguments, redact, safe_join, Credentials, Downloader, Prepared};
use serde_json::json;
use sha1::{Digest, Sha1};
use std::{
    collections::BTreeMap,
    fs,
    path::PathBuf,
    sync::{atomic::AtomicBool, Arc},
};
fn fixture(game: PathBuf) -> Prepared {
    Prepared {
        java: game.join("java.exe"),
        natives: game.join(".azuria/natives/test"),
        libraries: game.join("cache/libraries"),
        assets: game.join("cache/assets"),
        classpath: vec![
            game.join("cache/library with spaces.jar"),
            game.join("cache/client.jar"),
        ],
        game,
        metadata: json!({"type":"release","assetIndex":{"id":"17"},"mainClass":"net.minecraft.client.main.Main","arguments":{"jvm":["-Djava.library.path=${natives_directory}","-cp","${classpath}"],"game":["--username","${auth_player_name}","--accessToken","${auth_access_token}","--gameDir","${game_directory}",{"rules":[{"action":"allow","features":{"has_custom_resolution":true}}],"value":["--width","${resolution_width}","--height","${resolution_height}"]}]}}),
        options: LaunchOptions::default(),
        version: "1.21.1".into(),
        logging_argument: Some("-Dlog4j.configurationFile=C:\\cache\\client.xml".into()),
    }
}
fn account() -> Credentials {
    Credentials {
        username: "Player".into(),
        uuid: "0123456789abcdef0123456789abcdef".into(),
        access_token: "PRIVATE-LAUNCH-TOKEN".into(),
        client_id: "6979bfed-98b9-4801-8c21-f046c0ca82b3".into(),
        xuid: Some("1234567890".into()),
    }
}
#[test]
fn windows_rules_obey_order_arch_and_features() {
    assert!(allowed(&serde_json::Value::Null, true).unwrap());
    assert!(!allowed(&json!([{"action":"allow","os":{"name":"osx"}}]), true).unwrap());
    assert!(allowed(
        &json!([{"action":"allow"},{"action":"disallow","os":{"name":"linux"}}]),
        true
    )
    .unwrap());
    assert!(!allowed(
        &json!([{"action":"allow","os":{"name":"windows","arch":"x86"}}]),
        true
    )
    .unwrap());
    assert!(allowed(
        &json!([{"action":"allow","os":{"name":"windows","arch":"amd64"}}]),
        true
    )
    .unwrap());
    assert!(!allowed(
        &json!([{"action":"allow","features":{"is_demo_user":true}}]),
        true
    )
    .unwrap());
    assert!(!allowed(&json!([{"action":"allow","os":{"version":"["}}]), true).is_ok());
}
#[test]
fn arguments_are_vectors_not_shell_commands_and_preserve_spaces() {
    let root = PathBuf::from("C:/Users/A Player/instances/Test ${name}");
    let mut p = fixture(root.clone());
    p.options.memory_mb = 8192;
    p.options.window.fullscreen = true;
    p.options.java_arguments = vec!["-Dcustom=hello world".into()];
    let args = p.command_arguments(&account()).unwrap();
    assert!(args.contains(&root.display().to_string()));
    assert!(args.contains(&"-Dcustom=hello world".into()));
    assert!(args.contains(&"-Xmx8192M".into()));
    assert!(args.contains(&"--fullscreen".into()));
    assert!(args
        .iter()
        .any(|a| a.contains("library with spaces.jar;") && a.ends_with("client.jar")));
    assert!(
        args.iter().position(|a| a == "-Xmx8192M").unwrap()
            < args
                .iter()
                .position(|a| a == "net.minecraft.client.main.Main")
                .unwrap()
    );
    assert!(args.contains(&"PRIVATE-LAUNCH-TOKEN".into()));
    assert!(args.contains(&"-Dlog4j.configurationFile=C:\\cache\\client.xml".into()));
}
#[test]
fn unknown_arguments_fail_closed_and_legacy_arguments_are_supported() {
    let vars = BTreeMap::from([("path", "a ${literal} folder".into())]);
    assert_eq!(
        arguments(&json!(["${path}"]), &vars, true).unwrap(),
        vec!["a ${literal} folder"]
    );
    assert!(arguments(&json!(["${unknown}"]), &vars, true).is_err());
    let mut p = fixture("C:/game".into());
    p.metadata.as_object_mut().unwrap().remove("arguments");
    p.metadata["minecraftArguments"] =
        json!("--username ${auth_player_name} --gameDir ${game_directory}");
    assert!(p
        .command_arguments(&account())
        .unwrap()
        .contains(&"C:/game".into()));
}
#[test]
fn traversal_windows_device_names_and_linked_paths_are_rejected() {
    let d = tempfile::tempdir().unwrap();
    for name in [
        "../outside",
        "/absolute",
        "C:/absolute",
        "a\\b",
        "foo:stream",
        "foo/../bar",
        "foo/CON.txt",
        "foo/NUL",
        "foo/bar.",
        "foo/bar ",
        "foo//bar",
    ] {
        assert!(safe_join(d.path(), name).is_err(), "{name}");
    }
    assert!(safe_join(d.path(), "org/library/1.0/library.jar").is_ok());
}
#[test]
fn verified_cache_reuse_needs_no_network_and_corruption_does_not_replace_files() {
    let d = tempfile::tempdir().unwrap();
    let path = d.path().join("cached.jar");
    fs::write(&path, b"valid file").unwrap();
    let hash = format!("{:x}", Sha1::digest(b"valid file"));
    let downloader = Downloader::new(Arc::new(|_| {}), Arc::new(AtomicBool::new(false))).unwrap();
    let meta = json!({"url":"https://invalid.example/not-contacted","sha1":hash,"size":10});
    downloader.artifact(&meta, &path, 100).unwrap();
    fs::write(&path, b"corrupted").unwrap();
    assert!(downloader.artifact(&meta, &path, 100).is_err());
    assert_eq!(fs::read(&path).unwrap(), b"corrupted");
    assert!(!path
        .with_extension(format!("azuria-{}.part", std::process::id()))
        .exists());
}
#[test]
fn cancellation_prevents_network_and_keeps_existing_cache() {
    let d = tempfile::tempdir().unwrap();
    let path = d.path().join("cached.jar");
    fs::write(&path, b"keep").unwrap();
    let downloader = Downloader::new(Arc::new(|_| {}), Arc::new(AtomicBool::new(true))).unwrap();
    assert!(downloader
        .artifact(&json!({}), &path, 100)
        .unwrap_err()
        .contains("cancelled"));
    assert_eq!(fs::read(path).unwrap(), b"keep");
}
#[test]
fn credentials_and_sensitive_log_lines_are_hidden() {
    let secret = "sensitive-session".to_string();
    assert_eq!(
        redact("session sensitive-session", &[secret]),
        "session [hidden]"
    );
    assert!(!redact("Authorization: Bearer private", &[]).contains("private"));
}
#[cfg(unix)]
#[test]
fn process_lifecycle_captures_output_without_exposing_credentials() {
    use std::os::unix::fs::PermissionsExt;
    let d = tempfile::tempdir().unwrap();
    let java = d.path().join("fake-java");
    fs::write(
        &java,
        "#!/bin/sh\nprintf '%s\\n' \"$*\"\nprintf 'environment=%s\\n' \"$PRIVATE_ENV\"\nexit 0\n",
    )
    .unwrap();
    fs::set_permissions(&java, fs::Permissions::from_mode(0o700)).unwrap();
    let mut p = fixture(d.path().into());
    p.java = java;
    p.options
        .environment
        .insert("PRIVATE_ENV".into(), "SECRET-ENVIRONMENT".into());
    assert_eq!(p.start(account()).unwrap().wait().unwrap(), Some(0));
    let log = fs::read_to_string(d.path().join("logs/azuria-launch.log")).unwrap();
    assert!(!log.contains("PRIVATE-LAUNCH-TOKEN"));
    assert!(!log.contains("SECRET-ENVIRONMENT"));
    assert!(log.contains("hidden"));
}

#[test]
fn official_mojang_1211_arguments_expand_without_unknown_placeholders() {
    let mut prepared =
        fixture("C:/Users/Player/AppData/Roaming/AzuriaLauncher/instances/My world".into());
    prepared.metadata = serde_json::from_str(include_str!("fixtures/mojang-1.21.1.json")).unwrap();
    let args = prepared.command_arguments(&account()).unwrap();
    assert!(args.contains(&"net.minecraft.client.main.Main".into()));
    assert!(!args.iter().any(|arg| arg.contains("${")));
    assert!(!args.contains(&"--demo".into()));
    assert!(args.contains(&"--accessToken".into()));
    assert!(args.contains(&"6979bfed-98b9-4801-8c21-f046c0ca82b3".into()));
    assert!(args.contains(&"1234567890".into()));
}

#[cfg(unix)]
#[test]
fn stop_terminates_the_owned_game_process() {
    use std::os::unix::fs::PermissionsExt;
    let directory = tempfile::tempdir().unwrap();
    let java = directory.path().join("fake-java");
    fs::write(&java, "#!/bin/sh\nexec sleep 30\n").unwrap();
    fs::set_permissions(&java, fs::Permissions::from_mode(0o700)).unwrap();
    let mut prepared = fixture(directory.path().into());
    prepared.java = java;
    let running = prepared.start(account()).unwrap();
    let started = std::time::Instant::now();
    assert_ne!(
        running
            .wait_with_cancel(Arc::new(AtomicBool::new(true)))
            .unwrap(),
        Some(0)
    );
    assert!(started.elapsed() < std::time::Duration::from_secs(3));
}

#[test]
fn invalid_download_pool_limits_fail_before_preparation() {
    use std::sync::{atomic::AtomicBool, Arc};
    let dir = tempfile::tempdir().unwrap();
    let options = azuria_core::preferences::LaunchOptions::default();
    for limit in [0, 17] {
        let result = azuria_launch::prepare_with_download_limit(
            dir.path(),
            dir.path(),
            "1.21.1",
            None,
            options.clone(),
            Arc::new(|_| {}),
            Arc::new(AtomicBool::new(false)),
            limit,
        );
        assert!(result.err().unwrap().contains("concurrent downloads"));
    }
}
