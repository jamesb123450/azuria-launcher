//! Native-only authentication. Public views deliberately contain no credentials.
pub mod messaging;
mod oauth;
mod provider;
mod service;
mod vault;

pub use oauth::CLIENT_ID;
pub use provider::{MicrosoftTokens, Progress, Provider, SessionTokens, WebProvider};
pub use service::AuthService;
pub use vault::{NativeVault, SecretVault};

use serde::{Deserialize, Serialize};
use std::sync::Arc;

#[derive(Clone, Copy, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Stage {
    Browser,
    Microsoft,
    Xbox,
    Minecraft,
    Profile,
    Storage,
    Cancelled,
}
#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AuthError {
    pub stage: Stage,
    pub code: String,
    pub message: String,
}
impl AuthError {
    pub fn new(stage: Stage, code: &str, message: &str) -> Self {
        Self {
            stage,
            code: code.into(),
            message: message.into(),
        }
    }
    pub fn cancelled() -> Self {
        Self::new(Stage::Cancelled, "cancelled", "Sign-in was cancelled.")
    }
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Account {
    pub username: String,
    pub minecraft_id: String,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountView {
    pub supported: bool,
    pub account: Option<Account>,
    pub verified: bool,
    pub has_saved_session: bool,
}
// Never derive Debug on types containing tokens.
#[derive(Clone, Serialize, Deserialize)]
pub struct SavedSession {
    pub refresh_token: String,
    pub account: Account,
}
pub type OpenBrowser = Arc<dyn Fn(&str) -> Result<(), AuthError> + Send + Sync>;

fn now() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|value| value.as_secs())
        .unwrap_or(0)
}
