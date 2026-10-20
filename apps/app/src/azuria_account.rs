//! Azuria sessions are independent of Microsoft/Minecraft sessions.
//! No passwords or refresh tokens cross the frontend IPC boundary.
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Mutex,
};
use std::time::{Duration, Instant};
use tauri::State;

#[derive(Default)]
pub struct AzuriaAccounts {
    busy: AtomicBool,
    pending: Mutex<Option<(String, Instant)>>,
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
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct View {
    configured: bool,
    supported: bool,
    account: Option<Profile>,
}
#[derive(Serialize)]
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
    #[cfg(windows)]
    crate::browser::open_web(&format!(
        "https://accounts.azuriasmp.org/#challenge={challenge}"
    ))
    .map_err(str::to_string)?;
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
            .map_err(|_| "Account storage is unavailable.".to_string())? =
            Some((verifier, Instant::now()));
        Ok(())
    }
}
#[tauri::command]
pub async fn azuria_complete(
    state: State<'_, AzuriaAccounts>,
    code: String,
) -> Result<View, String> {
    let _operation = state.operation()?;
    let config = config().ok_or("Azuria accounts are not configured.")?;
    let code = code.trim();
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
        .pending
        .lock()
        .map_err(|_| "Account storage is unavailable.".to_string())? = None;
    Ok(result)
}
#[tauri::command]
pub async fn azuria_sign_out(state: State<'_, AzuriaAccounts>) -> Result<View, String> {
    let _operation = state.operation()?;
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
}
