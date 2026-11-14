//! Per-game loopback connection. Minecraft never receives Azuria account tokens.
use super::*;
use serde_json::{json, Value};
use std::{
    io::{BufRead, BufReader, Read, Write},
    net::{Ipv4Addr, TcpListener, TcpStream},
    sync::Arc,
};

pub struct Companion {
    alive: Arc<AtomicBool>,
}
impl Drop for Companion {
    fn drop(&mut self) {
        self.alive.store(false, Ordering::Release);
    }
}
impl Companion {
    pub fn start(app: tauri::AppHandle) -> Result<(Self, String, String), String> {
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).map_err(|e| e.to_string())?;
        let port = listener.local_addr().map_err(|e| e.to_string())?.port();
        listener.set_nonblocking(true).map_err(|e| e.to_string())?;
        let mut random = [0; 32];
        getrandom::fill(&mut random).map_err(|e| e.to_string())?;
        let key = URL_SAFE_NO_PAD.encode(random);
        let secret = key.clone();
        let alive = Arc::new(AtomicBool::new(true));
        let running = alive.clone();
        std::thread::Builder::new()
            .name("azuria-companion".into())
            .spawn(move || {
                while running.load(Ordering::Acquire) {
                    match listener.accept() {
                        Ok((stream, _)) => serve(stream, &secret, &app),
                        Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                            std::thread::sleep(Duration::from_millis(25));
                        }
                        Err(_) => break,
                    }
                }
            })
            .map_err(|e| e.to_string())?;
        Ok((Self { alive }, port.to_string(), key))
    }
}

#[derive(Deserialize)]
struct Request {
    key: String,
    action: String,
    target: Option<String>,
    username: Option<String>,
    body: Option<String>,
    id: Option<String>,
    typing: Option<bool>,
    status: Option<String>,
}

fn serve(mut stream: TcpStream, key: &str, app: &tauri::AppHandle) {
    let timeout = Some(Duration::from_secs(2));
    if stream.set_read_timeout(timeout).is_err() || stream.set_write_timeout(timeout).is_err() {
        return;
    }
    let mut line = String::new();
    let read = BufReader::new(&stream).take(8193).read_line(&mut line);
    if !matches!(read, Ok(1..=8192)) || !line.ends_with('\n') {
        return;
    }
    let Ok(request) = serde_json::from_str::<Request>(&line) else {
        return;
    };
    if request.key != key {
        return;
    }
    let reply = tauri::async_runtime::block_on(dispatch(app, request));
    let value = match reply {
        Ok(data) => json!({"data": data}),
        Err(error) => json!({"error": error}),
    };
    let _ = writeln!(stream, "{value}");
}

async fn dispatch(app: &tauri::AppHandle, r: Request) -> Result<Value, String> {
    let state = app.state::<AzuriaAccounts>();
    match r.action.as_str() {
        "friends" => {
            let view = azuria_friends(
                app.state::<AzuriaAccounts>(),
                FriendAction::Snapshot,
                None,
                None,
            )
            .await?;
            // Presence may be unavailable on a backend that has not deployed the upgrade yet.
            let presence = azuria_presence(app.state::<AzuriaAccounts>(), None, None, None)
                .await
                .unwrap_or(Value::Null);
            let mut data = serde_json::to_value(view).map_err(|e| e.to_string())?;
            let account = azuria_status(state)
                .await
                .ok()
                .and_then(|view| view.account);
            let account = account.filter(|account| data["accountId"] == account.id);
            let presence = presence
                .as_object()
                .filter(|_| presence["accountId"] == data["accountId"])
                .map_or(Value::Null, |_| presence["data"].clone());
            data["name"] = json!(account.and_then(|p| p.display_name.or(p.username)));
            data["presence"] = presence;
            Ok(data)
        }
        "add" => {
            let view = azuria_friends(
                app.state::<AzuriaAccounts>(),
                FriendAction::Find,
                None,
                r.username,
            )
            .await?;
            let target = view
                .matches
                .into_iter()
                .next()
                .ok_or("Azuria user not found.")?;
            if target.relationship != "none" {
                return Err("This player is already a friend or has a pending request.".into());
            }
            azuria_friends(state, FriendAction::Send, Some(target.id), None).await?;
            Ok(Value::Null)
        }
        "accept" | "decline" => {
            let action = if r.action == "accept" {
                FriendAction::Accept
            } else {
                FriendAction::Decline
            };
            azuria_friends(state, action, r.target, None).await?;
            Ok(Value::Null)
        }
        "presence" => {
            if r.status
                .as_deref()
                .is_some_and(|s| !matches!(s, "online" | "away" | "busy" | "offline"))
                || r.target.as_deref().is_some_and(|s| !valid_friend_target(s))
            {
                return Err("Invalid presence selection.".into());
            }
            let changed = r.status.is_some();
            let result = azuria_presence(state, r.status, r.target, r.typing).await?;
            if changed {
                let _ = app.emit("azuria-companion-status", &result);
            }
            Ok(result)
        }
        "history" | "send" | "read" | "inbox" => {
            azuria_messages(state, r.action, r.target, r.id.clone(), r.id, r.body).await
        }
        _ => Err("Unsupported companion action.".into()),
    }
}
