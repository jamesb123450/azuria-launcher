//! Azuria sessions are independent of Microsoft/Minecraft sessions.
//! No sign-in passwords or refresh tokens are returned to the frontend.
mod messaging;
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Mutex,
};
use std::time::{Duration, Instant};
use tauri::{Emitter, Manager, State};

#[derive(Default)]
pub struct AzuriaAccounts {
    busy: AtomicBool,
    pending: Mutex<Option<(String, Instant)>>,
    connection: Mutex<ConnectionUpdate>,
    completed_challenge: Mutex<Option<String>>,
}
struct Operation<'a>(&'a AtomicBool);
impl Drop for Operation<'_> {
    fn drop(&mut self) {
        self.0.store(false, Ordering::Release);
    }
}
impl AzuriaAccounts {
    fn operation(&self) -> Result<Operation<'_>, String> {
        if self.busy.swap(true, Ordering::Acquire) {
            return Err("An account request is already running.".into());
        }
        Ok(Operation(&self.busy))
    }
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct View {
    configured: bool,
    supported: bool,
    account: Option<Profile>,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Profile {
    id: String,
    email: String,
    username: Option<String>,
    display_name: Option<String>,
}
#[derive(Deserialize)]
struct User {
    id: String,
    email: Option<String>,
    email_confirmed_at: Option<String>,
}
#[derive(Deserialize)]
struct Tokens {
    access_token: String,
    refresh_token: String,
    user: User,
}
#[derive(Deserialize)]
struct StoredProfile {
    username: String,
    display_name: String,
}
struct Config {
    url: String,
    key: &'static str,
}
fn config() -> Option<Config> {
    let raw = option_env!("AZURIA_SUPABASE_URL")?;
    let parsed = reqwest::Url::parse(raw).ok()?;
    let key = option_env!("AZURIA_SUPABASE_PUBLISHABLE_KEY")?;
    if parsed.scheme() != "https"
        || !parsed.host_str()?.ends_with(".supabase.co")
        || !parsed.username().is_empty()
        || parsed.password().is_some()
        || parsed.port().is_some()
        || parsed.path() != "/"
        || parsed.query().is_some()
        || parsed.fragment().is_some()
        || !key.starts_with("sb_publishable_")
        || key.contains("YOUR_")
    {
        return None;
    }
    Some(Config {
        url: raw.trim_end_matches('/').into(),
        key,
    })
}
fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|_| "Could not start the account connection.".into())
}
#[cfg(windows)]
fn entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new("com.azuria.launcher.azuria", "refresh-token")
        .map_err(|_| "Windows Credential Manager is unavailable.".into())
}
fn saved() -> Result<Option<String>, String> {
    #[cfg(windows)]
    {
        match entry()?.get_password() {
            Ok(value) => Ok(Some(value)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(_) => Err("Could not read your saved Azuria session.".into()),
        }
    }
    #[cfg(not(windows))]
    {
        Ok(None)
    }
}
fn save(_token: &str) -> Result<(), String> {
    #[cfg(windows)]
    {
        entry()?
            .set_password(_token)
            .map_err(|_| "Could not save your Azuria session securely. Sign in again.".into())
    }
    #[cfg(not(windows))]
    {
        Err("Azuria sign-in requires the Windows desktop app.".into())
    }
}
fn clear() -> Result<(), String> {
    #[cfg(windows)]
    {
        match entry()?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(_) => Err("Could not remove your saved Azuria session.".into()),
        }
    }
    #[cfg(not(windows))]
    {
        Ok(())
    }
}
fn empty() -> View {
    View {
        configured: config().is_some(),
        supported: cfg!(windows),
        account: None,
    }
}
async fn profile(config: &Config, tokens: Tokens) -> Result<View, String> {
    if tokens.user.email_confirmed_at.is_none() {
        return Err("Verify your email before connecting the launcher.".into());
    }
    // Save rotations before fetching optional profile data, so a transient failure
    // never strands the launcher with a refresh token that has already rotated.
    save(&tokens.refresh_token)?;
    let response = client()?
        .get(format!("{}/rest/v1/profiles", config.url))
        .header("apikey", config.key)
        .bearer_auth(&tokens.access_token)
        .query(&[
            ("id", format!("eq.{}", tokens.user.id)),
            ("select", "username,display_name".into()),
        ])
        .send()
        .await;
    let details = match response {
        Ok(response) if response.status().is_success() => response
            .json::<Vec<StoredProfile>>()
            .await
            .ok()
            .and_then(|mut rows| rows.pop()),
        _ => None,
    };
    Ok(View {
        configured: true,
        supported: cfg!(windows),
        account: Some(Profile {
            id: tokens.user.id,
            email: tokens.user.email.unwrap_or_default(),
            username: details.as_ref().map(|p| p.username.clone()),
            display_name: details.map(|p| p.display_name),
        }),
    })
}
async fn refresh(config: &Config, token: String) -> Result<Tokens, String> {
    let response = client()?.post(format!("{}/auth/v1/token?grant_type=refresh_token", config.url)).header("apikey", config.key).json(&serde_json::json!({"refresh_token": token})).send().await.map_err(|_| "Could not reach Azuria. Your saved session has been kept; try again when you’re online.".to_string())?;
    if matches!(response.status().as_u16(), 400 | 401 | 403) {
        clear()?;
        return Err("Your Azuria session has expired. Sign in again.".into());
    }
    if !response.status().is_success() {
        return Err("Azuria accounts are temporarily unavailable. Try again later.".into());
    }
    response
        .json()
        .await
        .map_err(|_| "The account service returned an invalid response.".into())
}
#[tauri::command]
pub fn azuria_configuration() -> View {
    empty()
}
#[tauri::command]
pub async fn azuria_status(state: State<'_, AzuriaAccounts>) -> Result<View, String> {
    let _operation = state.operation()?;
    let Some(config) = config() else {
        return Ok(empty());
    };
    match saved()? {
        Some(token) => profile(&config, refresh(&config, token).await?).await,
        None => Ok(empty()),
    }
}
#[tauri::command]
pub fn azuria_begin(state: State<'_, AzuriaAccounts>) -> Result<(), String> {
    let _operation = state.operation()?;
    if config().is_none() {
        return Err("Azuria accounts have not been configured in this build.".into());
    }
    let mut bytes = [0_u8; 32];
    getrandom::fill(&mut bytes)
        .map_err(|_| "Could not create a secure sign-in request.".to_string())?;
    let verifier = URL_SAFE_NO_PAD.encode(bytes);
    let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
    #[cfg(not(windows))]
    {
        let _ = challenge;
        return Err("Azuria sign-in requires the Windows desktop app.".into());
    }
    #[cfg(windows)]
    {
        *state
            .pending
            .lock()
            .map_err(|_| "Account storage is unavailable.")? = Some((verifier, Instant::now()));
        *state
            .completed_challenge
            .lock()
            .map_err(|_| "Account storage is unavailable.")? = None;
        *state
            .connection
            .lock()
            .map_err(|_| "Account storage is unavailable.")? = ConnectionUpdate::default();
        if let Err(error) = crate::browser::open_web(&format!(
            "https://accounts.azuriasmp.org/#challenge={challenge}"
        )) {
            *state
                .pending
                .lock()
                .map_err(|_| "Account storage is unavailable.")? = None;
            return Err(error.to_string());
        }
        Ok(())
    }
}
#[tauri::command]
pub async fn azuria_complete(
    state: State<'_, AzuriaAccounts>,
    code: String,
) -> Result<View, String> {
    let _operation = state.operation()?;
    complete(&state, code.trim()).await
}
async fn complete(state: &AzuriaAccounts, code: &str) -> Result<View, String> {
    let config = config().ok_or("Azuria accounts are not configured.")?;
    if code.len() != 43
        || !code
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"_-".contains(&b))
    {
        return Err("Paste the full connection code shown in your browser.".into());
    }
    let verifier = {
        let pending = state
            .pending
            .lock()
            .map_err(|_| "Account storage is unavailable.".to_string())?;
        let (verifier, started) = pending
            .as_ref()
            .ok_or("Start sign-in from this launcher first.")?;
        if started.elapsed() > Duration::from_secs(900) {
            return Err("This sign-in request expired. Start again.".into());
        }
        verifier.clone()
    };
    let response = client()?
        .post(format!("{}/functions/v1/account-action", config.url))
        .header("apikey", config.key)
        .json(&serde_json::json!({"action":"redeem","code":code,"verifier":verifier}))
        .send()
        .await
        .map_err(|_| "Could not reach Azuria. Check your connection and retry.".to_string())?;
    if !response.status().is_success() {
        return Err("That code expired, was already used or belongs to another launcher. Start sign-in again.".into());
    }
    let tokens: Tokens = response
        .json()
        .await
        .map_err(|_| "Could not read the account response. Start sign-in again.".to_string())?;
    let result = profile(&config, tokens).await?;
    *state
        .completed_challenge
        .lock()
        .map_err(|_| "Account storage is unavailable.")? =
        Some(URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes())));
    *state
        .pending
        .lock()
        .map_err(|_| "Account storage is unavailable.".to_string())? = None;
    Ok(result)
}
#[tauri::command]
pub async fn azuria_sign_out(state: State<'_, AzuriaAccounts>) -> Result<View, String> {
    let _operation = state.operation()?;
    *state
        .connection
        .lock()
        .map_err(|_| "Account storage is unavailable.")? = ConnectionUpdate::default();
    let token = saved()?;
    // Forget locally even when offline. Never let a network failure prevent removal.
    clear()?;
    *state
        .pending
        .lock()
        .map_err(|_| "Account storage is unavailable.".to_string())? = None;
    if let (Some(config), Some(token)) = (config(), token) {
        // Revoke server-side when reachable. No rotation is written back to disk.
        if let Ok(tokens) = refresh(&config, token).await {
            let _ = client()?
                .post(format!("{}/auth/v1/logout?scope=local", config.url))
                .header("apikey", config.key)
                .bearer_auth(tokens.access_token)
                .send()
                .await;
        }
    }
    Ok(empty())
}
#[tauri::command]
pub fn azuria_manage() -> Result<(), String> {
    #[cfg(windows)]
    {
        crate::browser::open_web("https://accounts.azuriasmp.org/").map_err(str::to_string)
    }
    #[cfg(not(windows))]
    {
        Err("Open https://accounts.azuriasmp.org in your browser.".into())
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FriendAction {
    Snapshot,
    Find,
    Send,
    Accept,
    Decline,
    Cancel,
    Remove,
    Block,
    Unblock,
}
#[derive(Deserialize, Serialize)]
pub struct Relationship {
    kind: String,
    account_id: String,
    username: String,
    display_name: String,
    since: String,
}
#[derive(Deserialize, Serialize)]
pub struct FriendMatch {
    id: String,
    username: String,
    display_name: String,
    relationship: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FriendsView {
    account_id: String,
    entries: Option<Vec<Relationship>>,
    matches: Vec<FriendMatch>,
    mutation_applied: bool,
    warning: Option<String>,
}
fn valid_friend_target(value: &str) -> bool {
    value.len() == 36
        && value.bytes().enumerate().all(|(i, c)| {
            if [8, 13, 18, 23].contains(&i) {
                c == b'-'
            } else {
                c.is_ascii_hexdigit()
            }
        })
}
fn friend_call(
    action: &FriendAction,
    target: Option<&str>,
    username: Option<&str>,
) -> Result<(&'static str, serde_json::Value), String> {
    use FriendAction::*;
    match action {
        Snapshot => Ok(("friend_snapshot", serde_json::json!({}))),
        Find => {
            let name = username.unwrap_or_default().trim().to_ascii_lowercase();
            if !(3..=24).contains(&name.len())
                || !name
                    .bytes()
                    .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'_')
            {
                return Err(
                    "Enter a full Azuria username using 3–24 letters, numbers or underscores."
                        .into(),
                );
            }
            Ok(("find_friend", serde_json::json!({"p_username": name})))
        }
        _ => {
            let target = target
                .filter(|value| valid_friend_target(value))
                .ok_or("Choose a valid Azuria account.")?;
            match action {
                Send => Ok((
                    "send_friend_request",
                    serde_json::json!({"p_target":target}),
                )),
                Accept | Decline => Ok((
                    "respond_friend_request",
                    serde_json::json!({"p_sender":target,"p_accept":matches!(action, Accept)}),
                )),
                Cancel => Ok((
                    "cancel_friend_request",
                    serde_json::json!({"p_target":target}),
                )),
                Remove => Ok(("remove_friend", serde_json::json!({"p_target":target}))),
                Block => Ok(("block_user", serde_json::json!({"p_target":target}))),
                Unblock => Ok(("unblock_user", serde_json::json!({"p_target":target}))),
                _ => unreachable!(),
            }
        }
    }
}
async fn friends_rpc(
    config: &Config,
    access: &str,
    name: &str,
    body: &serde_json::Value,
) -> Result<serde_json::Value, String> {
    let mut response = client()?.post(format!("{}/rest/v1/rpc/{name}", config.url))
        .header("apikey", config.key).bearer_auth(access).json(body).send().await
        .map_err(|_| "Could not confirm the request. Check your connection and refresh Friends before trying again.".to_string())?;
    let status = response.status();
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|_| {
        "Could not read the friends response. Refresh Friends before retrying.".to_string()
    })? {
        if bytes.len() + chunk.len() > 2 * 1024 * 1024 {
            return Err("The friends response is too large. Try again later.".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    let value: serde_json::Value =
        serde_json::from_slice(&bytes).unwrap_or(serde_json::Value::Null);
    if !status.is_success() {
        let message = match value.get("code").and_then(|v| v.as_str()) {
            Some("P0001") => "Too many requests. Wait a little before trying again.",
            Some("42501") => "Reconnect your Azuria account and make sure your email and profile are set up.",
            Some("22023" | "23505") => "This request is no longer available, is already pending or cannot be sent. Refresh Friends.",
            Some("PGRST202" | "42883") => "Friends are not configured on the account service yet.",
            _ => "Could not complete the friends request. Refresh Friends and try again.",
        };
        return Err(message.into());
    }
    Ok(value)
}
#[tauri::command]
pub async fn azuria_friends(
    state: State<'_, AzuriaAccounts>,
    action: FriendAction,
    target: Option<String>,
    username: Option<String>,
) -> Result<FriendsView, String> {
    let (name, body) = friend_call(&action, target.as_deref(), username.as_deref())?;
    let _operation = state.operation()?;
    let config = config().ok_or("Azuria accounts are not configured in this build.")?;
    let token = saved()?.ok_or("Sign in to your Azuria account first.")?;
    let tokens = refresh(&config, token).await?;
    if tokens.user.email_confirmed_at.is_none() {
        return Err("Verify your email first.".into());
    }
    save(&tokens.refresh_token)?;
    let value = friends_rpc(&config, &tokens.access_token, name, &body).await?;
    let mut result = FriendsView {
        account_id: tokens.user.id,
        entries: None,
        matches: vec![],
        mutation_applied: false,
        warning: None,
    };
    match action {
        FriendAction::Snapshot => {
            result.entries = Some(
                serde_json::from_value(value)
                    .map_err(|_| "Could not read your friends list.".to_string())?,
            )
        }
        FriendAction::Find => {
            result.matches = serde_json::from_value(value)
                .map_err(|_| "Could not read the search result.".to_string())?
        }
        _ => {
            result.mutation_applied = true;
            match friends_rpc(&config, &tokens.access_token, "friend_snapshot", &serde_json::json!({})).await
                .and_then(|value| serde_json::from_value(value).map_err(|_| "Could not read your friends list.".to_string())) {
                Ok(entries) => result.entries = Some(entries),
                Err(_) => result.warning = Some("Your change was saved, but the list could not refresh. Use Refresh to see the latest requests.".into()),
            }
        }
    }
    Ok(result)
}

#[tauri::command]
pub async fn azuria_messages(
    state: State<'_, AzuriaAccounts>,
    action: String,
    target: Option<String>,
    before: Option<String>,
    client_id: Option<String>,
    body: Option<String>,
) -> Result<serde_json::Value, String> {
    messaging::request(state, action, target, before, client_id, body)
        .await
        .map_err(|error| {
            if error.contains("not configured on the account service") {
                String::from("Encrypted messaging is not configured yet. Apply the latest messaging database migration.")
            } else {
                error
            }
        })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn operations_cannot_race_refresh_rotation_or_sign_out() {
        let state = AzuriaAccounts::default();
        let operation = state.operation().unwrap();
        assert!(state.operation().is_err());
        drop(operation);
        assert!(state.operation().is_ok());
    }
    #[test]
    fn verifier_and_challenge_use_the_expected_url_safe_format() {
        let verifier = URL_SAFE_NO_PAD.encode([7_u8; 32]);
        let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
        assert_eq!(verifier.len(), 43);
        assert_eq!(challenge.len(), 43);
        assert_ne!(verifier, challenge);
    }
    #[test]
    fn friend_commands_validate_targets_and_cannot_select_arbitrary_rpc_names() {
        assert!(friend_call(&FriendAction::Remove, Some("../admin"), None).is_err());
        assert!(friend_call(&FriendAction::Find, None, Some("%")).is_err());
        let id = "22222222-2222-4222-8222-222222222222";
        let (name, body) = friend_call(&FriendAction::Accept, Some(id), None).unwrap();
        assert_eq!(name, "respond_friend_request");
        assert_eq!(body["p_accept"], true);
        assert_eq!(body["p_sender"], id);
        let (_, body) = friend_call(&FriendAction::Find, None, Some(" Player_1 ")).unwrap();
        assert_eq!(body["p_username"], "player_1");
    }
}

#[derive(Deserialize, Serialize)]
pub struct NewsStory {
    slug: String,
    title: String,
    summary: String,
    cover_path: String,
    cover_alt: String,
    image_position: String,
    published_at: String,
}
#[derive(Serialize)]
pub struct NewsFeed {
    url: String,
    stories: Vec<NewsStory>,
}
/// Published news is public and never refreshes or reads an account session.
#[tauri::command]
pub async fn azuria_news() -> Result<NewsFeed, String> {
    let Some(config) = config() else {
        return Ok(NewsFeed {
            url: String::new(),
            stories: vec![],
        });
    };
    let response = client()?
        .post(format!("{}/rest/v1/rpc/news_public", config.url))
        .header("apikey", config.key)
        .json(&serde_json::json!({}))
        .send()
        .await
        .map_err(|_| "News could not be loaded. Check your connection.")?;
    if !response.status().is_success() {
        return Err("News could not be loaded. Please try again later.".into());
    }
    let mut stories: Vec<NewsStory> = response
        .json()
        .await
        .map_err(|_| "News could not be read.")?;
    stories.truncate(3);
    Ok(NewsFeed {
        url: config.url,
        stories,
    })
}

#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionUpdate {
    connecting: bool,
    view: Option<View>,
    error: Option<String>,
}
#[tauri::command]
pub fn azuria_connection(state: State<'_, AzuriaAccounts>) -> Result<ConnectionUpdate, String> {
    let update = state
        .connection
        .lock()
        .map_err(|_| "Account storage is unavailable.")?
        .clone();
    Ok(update)
}
#[tauri::command]
pub fn azuria_cancel(state: State<'_, AzuriaAccounts>) -> Result<(), String> {
    let _operation = state.operation()?;
    *state
        .pending
        .lock()
        .map_err(|_| "Account storage is unavailable.")? = None;
    *state
        .connection
        .lock()
        .map_err(|_| "Account storage is unavailable.")? = ConnectionUpdate::default();
    Ok(())
}
fn matches_pending(state: &AzuriaAccounts, challenge: &str) -> Result<(), String> {
    let pending = state
        .pending
        .lock()
        .map_err(|_| "Account storage is unavailable.")?;
    let (verifier, started) = pending
        .as_ref()
        .ok_or("Start sign-in from this launcher, then approve it in your browser.")?;
    crate::auth_callback::validate_request(verifier, started.elapsed(), challenge)
}
fn notify_connection(app: &tauri::AppHandle, update: ConnectionUpdate) {
    let state = app.state::<AzuriaAccounts>();
    if let Ok(mut stored) = state.connection.lock() {
        *stored = update.clone();
    }
    // No authorization code, verifier or session token enters the frontend event.
    let _ = app.emit_to("main", "azuria-connection", update);
}
pub fn receive_callback(app: tauri::AppHandle, raw: &str) {
    let Some((code, challenge)) = crate::auth_callback::parse(raw) else {
        return;
    };
    if app
        .state::<AzuriaAccounts>()
        .completed_challenge
        .lock()
        .ok()
        .as_deref()
        .and_then(|value| value.as_deref())
        == Some(challenge.as_str())
    {
        return;
    }
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
    tauri::async_runtime::spawn(async move {
        let state = app.state::<AzuriaAccounts>();
        let result = async {
            let _operation = state.operation().map_err(|_| "The launcher is finishing another account request. Click Open Azuria Launcher again in your browser.")?;
            matches_pending(&state, &challenge)?;
            notify_connection(
                &app,
                ConnectionUpdate {
                    connecting: true,
                    ..Default::default()
                },
            );
            complete(&state, &code).await
        }
        .await;
        let update = match result {
            Ok(view) => ConnectionUpdate {
                view: Some(view),
                ..Default::default()
            },
            Err(error) => ConnectionUpdate {
                error: Some(error),
                ..Default::default()
            },
        };
        notify_connection(&app, update);
    });
}
