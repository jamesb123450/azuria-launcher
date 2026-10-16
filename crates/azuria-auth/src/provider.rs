use crate::{oauth, Account, AuthError, OpenBrowser, Stage};
use async_trait::async_trait;
use reqwest::{Client, RequestBuilder};
use serde::Deserialize;
use serde_json::{json, Value};
use std::{sync::Arc, time::Duration};

pub type Progress = Arc<dyn Fn(Stage) + Send + Sync>;
// Credentials never implement Debug or Serialize.
pub struct MicrosoftTokens {
    pub access_token: String,
    pub refresh_token: String,
}
pub struct SessionTokens {
    pub account: Account,
    pub access_token: String,
    pub expires_at: u64,
}
#[async_trait]
pub trait Provider: Send + Sync {
    async fn interactive(
        &self,
        open: OpenBrowser,
        progress: Progress,
    ) -> Result<MicrosoftTokens, AuthError>;
    async fn refresh(&self, refresh_token: &str) -> Result<MicrosoftTokens, AuthError>;
    async fn minecraft(
        &self,
        microsoft: &str,
        progress: Progress,
    ) -> Result<SessionTokens, AuthError>;
}
pub struct WebProvider {
    client: Client,
    urls: [String; 6],
}
impl WebProvider {
    pub fn new() -> Result<Self, AuthError> {
        let _ = rustls::crypto::ring::default_provider().install_default();
        let client = Client::builder()
            .timeout(Duration::from_secs(20))
            .redirect(reqwest::redirect::Policy::none())
            .user_agent("Azuria-Launcher")
            .build()
            .map_err(|_| {
                AuthError::new(
                    Stage::Microsoft,
                    "http",
                    "Secure account networking could not be initialized.",
                )
            })?;
        Ok(Self {
            client,
            urls: [
                oauth::TOKEN_URL,
                "https://user.auth.xboxlive.com/user/authenticate",
                "https://xsts.auth.xboxlive.com/xsts/authorize",
                "https://api.minecraftservices.com/authentication/login_with_xbox",
                "https://api.minecraftservices.com/entitlements/mcstore",
                "https://api.minecraftservices.com/minecraft/profile",
            ]
            .map(str::to_owned),
        })
    }
    // Do not propagate reqwest/serde errors: URLs or server responses may contain credentials.
    async fn json(&self, request: RequestBuilder, stage: Stage) -> Result<Value, AuthError> {
        let mut response = request.send().await.map_err(|_| {
            AuthError::new(
                stage,
                "network",
                "Could not reach the account service. Check your connection and retry.",
            )
        })?;
        let status = response.status();
        let mut body = Vec::new();
        while let Some(chunk) = response.chunk().await.map_err(|_| {
            AuthError::new(
                stage,
                "network",
                "The account service response was interrupted. Retry sign-in.",
            )
        })? {
            if body.len() + chunk.len() > 1024 * 1024 {
                return Err(AuthError::new(
                    stage,
                    "response",
                    "The account service returned an unexpected response.",
                ));
            }
            body.extend_from_slice(&chunk);
        }
        let value: Value = serde_json::from_slice(&body).map_err(|_| {
            AuthError::new(
                stage,
                "response",
                "The account service returned an unexpected response.",
            )
        })?;
        if !status.is_success() {
            return Err(service_error(stage, status.as_u16(), &value));
        }
        Ok(value)
    }
    fn tokens(value: Value, old_refresh: Option<&str>) -> Result<MicrosoftTokens, AuthError> {
        #[derive(Deserialize)]
        struct Response {
            access_token: String,
            refresh_token: Option<String>,
            token_type: String,
        }
        let tokens: Response =
            serde_json::from_value(value).map_err(|_| invalid(Stage::Microsoft))?;
        let refresh = tokens
            .refresh_token
            .or_else(|| old_refresh.map(str::to_owned))
            .filter(|token| !token.is_empty())
            .ok_or_else(|| invalid(Stage::Microsoft))?;
        if tokens.access_token.is_empty() || !tokens.token_type.eq_ignore_ascii_case("bearer") {
            return Err(invalid(Stage::Microsoft));
        }
        Ok(MicrosoftTokens {
            access_token: tokens.access_token,
            refresh_token: refresh,
        })
    }
}
fn invalid(stage: Stage) -> AuthError {
    AuthError::new(
        stage,
        "response",
        "The account service returned an unexpected response.",
    )
}
pub(crate) fn service_error(stage: Stage, status: u16, value: &Value) -> AuthError {
    if stage == Stage::Microsoft {
        if value["error"] == "invalid_grant" {
            return AuthError::new(
                stage,
                "reauthenticate",
                "Your saved Microsoft session has expired or was revoked. Sign in again.",
            );
        }
        if value["error"] == "invalid_client" || value["error"] == "unauthorized_client" {
            return AuthError::new(stage, "registration", "Microsoft rejected Azuria’s app registration. Check the client ID, supported accounts and desktop redirect URI.");
        }
        if value["error"] == "invalid_scope" {
            return AuthError::new(stage, "scope", "Microsoft did not accept Azuria’s requested Xbox sign-in permissions. The application registration needs to be checked.");
        }
    }
    if stage == Stage::Xbox {
        match value["XErr"].as_u64() {
            Some(2148916233) => return AuthError::new(stage, "xbox_profile", "This Microsoft account needs an Xbox profile before it can sign in to Minecraft."),
            Some(2148916238) => return AuthError::new(stage, "family", "Xbox requires family approval for this account. Review its Microsoft family settings, then retry."),
            _ => {}
        }
    }
    if stage == Stage::Minecraft && status == 403 {
        return AuthError::new(stage, "minecraft_access", "Microsoft and Xbox sign-in succeeded, but Minecraft Services denied Azuria access. The app registration’s Minecraft access must be verified.");
    }
    if stage == Stage::Profile && status == 404 {
        return AuthError::new(stage, "minecraft_profile", "No Minecraft Java profile was found for this account. Verify Java Edition access and complete profile setup, then retry.");
    }
    AuthError::new(
        stage,
        "service",
        "The account service could not complete this step. Retry sign-in.",
    )
}
#[async_trait]
impl Provider for WebProvider {
    async fn interactive(
        &self,
        open: OpenBrowser,
        progress: Progress,
    ) -> Result<MicrosoftTokens, AuthError> {
        progress(Stage::Browser);
        let authorization = oauth::authorize(open).await?;
        progress(Stage::Microsoft);
        let value = self
            .json(
                self.client.post(&self.urls[0]).form(&[
                    ("client_id", oauth::CLIENT_ID),
                    ("grant_type", "authorization_code"),
                    ("code", authorization.code.as_str()),
                    ("redirect_uri", authorization.redirect.as_str()),
                    ("code_verifier", authorization.verifier.as_str()),
                    ("scope", oauth::SCOPE),
                ]),
                Stage::Microsoft,
            )
            .await?;
        Self::tokens(value, None)
    }
    async fn refresh(&self, refresh_token: &str) -> Result<MicrosoftTokens, AuthError> {
        let value = self
            .json(
                self.client.post(&self.urls[0]).form(&[
                    ("client_id", oauth::CLIENT_ID),
                    ("grant_type", "refresh_token"),
                    ("refresh_token", refresh_token),
                    ("scope", oauth::SCOPE),
                ]),
                Stage::Microsoft,
            )
            .await?;
        Self::tokens(value, Some(refresh_token))
    }
    async fn minecraft(
        &self,
        microsoft: &str,
        progress: Progress,
    ) -> Result<SessionTokens, AuthError> {
        progress(Stage::Xbox);
        let user = self.json(self.client.post(&self.urls[1])
            .json(&json!({
                "Properties": { "AuthMethod": "RPS", "SiteName": "user.auth.xboxlive.com", "RpsTicket": format!("d={microsoft}") },
                "RelyingParty": "http://auth.xboxlive.com", "TokenType": "JWT"
            })), Stage::Xbox).await?;
        let user_token = user["Token"]
            .as_str()
            .filter(|s| !s.is_empty())
            .ok_or_else(|| invalid(Stage::Xbox))?;
        let user_hash = user["DisplayClaims"]["xui"][0]["uhs"]
            .as_str()
            .ok_or_else(|| invalid(Stage::Xbox))?;
        let xsts = self
            .json(
                self.client.post(&self.urls[2]).json(&json!({
                    "Properties": { "SandboxId": "RETAIL", "UserTokens": [user_token] },
                    "RelyingParty": "rp://api.minecraftservices.com/", "TokenType": "JWT"
                })),
                Stage::Xbox,
            )
            .await?;
        let xsts_token = xsts["Token"]
            .as_str()
            .filter(|s| !s.is_empty())
            .ok_or_else(|| invalid(Stage::Xbox))?;
        if xsts["DisplayClaims"]["xui"][0]["uhs"].as_str() != Some(user_hash) {
            return Err(invalid(Stage::Xbox));
        }

        progress(Stage::Minecraft);
        let minecraft = self
            .json(
                self.client.post(&self.urls[3]).json(
                    &json!({ "identityToken": format!("XBL3.0 x={user_hash};{xsts_token}") }),
                ),
                Stage::Minecraft,
            )
            .await?;
        let access = minecraft["access_token"]
            .as_str()
            .filter(|s| !s.is_empty())
            .ok_or_else(|| invalid(Stage::Minecraft))?;
        let lifetime = minecraft["expires_in"]
            .as_u64()
            .filter(|n| *n > 0 && *n <= 86400)
            .ok_or_else(|| invalid(Stage::Minecraft))?;
        progress(Stage::Profile);
        let entitlements = self
            .json(
                self.client.get(&self.urls[4]).bearer_auth(access),
                Stage::Profile,
            )
            .await?;
        let owns_java = entitlements["items"]
            .as_array()
            .ok_or_else(|| invalid(Stage::Profile))?
            .iter()
            .any(|item| {
                matches!(
                    item["name"].as_str(),
                    Some("game_minecraft" | "product_minecraft")
                )
            });
        if !owns_java {
            return Err(AuthError::new(
                Stage::Profile,
                "no_java_access",
                "This account does not currently have a Minecraft Java Edition entitlement.",
            ));
        }
        let profile = self
            .json(
                self.client.get(&self.urls[5]).bearer_auth(access),
                Stage::Profile,
            )
            .await?;
        let username = profile["name"]
            .as_str()
            .ok_or_else(|| invalid(Stage::Profile))?;
        let minecraft_id = profile["id"]
            .as_str()
            .ok_or_else(|| invalid(Stage::Profile))?;
        if username.is_empty()
            || username.len() > 16
            || !username
                .bytes()
                .all(|c| c.is_ascii_alphanumeric() || c == b'_')
            || minecraft_id.len() != 32
            || !minecraft_id.bytes().all(|c| c.is_ascii_hexdigit())
        {
            return Err(invalid(Stage::Profile));
        }
        Ok(SessionTokens {
            account: Account {
                username: username.into(),
                minecraft_id: minecraft_id.to_ascii_lowercase(),
            },
            access_token: access.into(),
            expires_at: crate::now().saturating_add(lifetime.saturating_sub(60)),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn token_rotation_and_errors_are_sanitized() {
        let value = json!({"access_token":"access", "token_type":"Bearer"});
        assert_eq!(
            WebProvider::tokens(value.clone(), Some("old"))
                .unwrap()
                .refresh_token,
            "old"
        );
        assert!(WebProvider::tokens(value, None).is_err());
        let error = service_error(
            Stage::Microsoft,
            400,
            &json!({"error":"invalid_grant","error_description":"private-token"}),
        );
        assert_eq!(error.code, "reauthenticate");
        assert!(!serde_json::to_string(&error)
            .unwrap()
            .contains("private-token"));
        assert_eq!(
            service_error(Stage::Minecraft, 403, &json!({})).code,
            "minecraft_access"
        );
        assert_eq!(
            service_error(Stage::Xbox, 401, &json!({"XErr":2148916238u64})).code,
            "family"
        );
    }
}

#[cfg(test)]
mod http_tests {
    use super::*;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    #[tokio::test]
    async fn complete_service_chain_uses_expected_tickets_and_profile() {
        let listener = tokio::net::TcpListener::bind(("127.0.0.1", 0))
            .await
            .unwrap();
        let root = format!("http://{}", listener.local_addr().unwrap());
        let fixture = tokio::spawn(async move {
            let responses = [
                json!({"access_token":"ms-token","refresh_token":"rotated","token_type":"Bearer"}),
                json!({"Token":"user-token","DisplayClaims":{"xui":[{"uhs":"hash"}]}}),
                json!({"Token":"xsts-token","DisplayClaims":{"xui":[{"uhs":"hash"}]}}),
                json!({"access_token":"mc-token","expires_in":3600}),
                json!({"items":[{"name":"game_minecraft"}]}),
                json!({"name":"Player","id":"a".repeat(32)}),
            ];
            for (index, response) in responses.iter().enumerate() {
                let (mut stream, _) = listener.accept().await.unwrap();
                let mut bytes = Vec::new();
                let mut chunk = [0; 4096];
                loop {
                    let count = stream.read(&mut chunk).await.unwrap();
                    assert!(count > 0);
                    bytes.extend_from_slice(&chunk[..count]);
                    if let Some(end) = bytes.windows(4).position(|part| part == b"\r\n\r\n") {
                        let headers = String::from_utf8_lossy(&bytes[..end]).to_ascii_lowercase();
                        let length = headers
                            .lines()
                            .find_map(|line| line.strip_prefix("content-length: "))
                            .map(|v| v.parse::<usize>().unwrap())
                            .unwrap_or(0);
                        if bytes.len() >= end + 4 + length {
                            break;
                        }
                    }
                }
                let request = String::from_utf8(bytes).unwrap();
                match index {
                    0 => {
                        assert!(request.contains("grant_type=refresh_token"));
                        assert!(request.contains(oauth::CLIENT_ID));
                    }
                    1 => assert!(request.contains("d=ms-token")),
                    2 => assert!(
                        request.contains("user-token")
                            && request.contains("rp://api.minecraftservices.com/")
                    ),
                    3 => assert!(request.contains("XBL3.0 x=hash;xsts-token")),
                    _ => assert!(request
                        .to_ascii_lowercase()
                        .contains("authorization: bearer mc-token")),
                }
                let body = response.to_string();
                stream.write_all(format!("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",body.len()).as_bytes()).await.unwrap();
            }
        });
        let mut provider = WebProvider::new().unwrap();
        provider.urls = std::array::from_fn(|index| format!("{root}/{index}"));
        let microsoft = provider.refresh("old-refresh").await.unwrap();
        assert_eq!(microsoft.refresh_token, "rotated");
        let session = provider
            .minecraft(&microsoft.access_token, Arc::new(|_| {}))
            .await
            .unwrap();
        assert_eq!(session.account.username, "Player");
        assert_eq!(session.access_token, "mc-token");
        assert!(session.expires_at > crate::now());
        fixture.await.unwrap();
    }
}
