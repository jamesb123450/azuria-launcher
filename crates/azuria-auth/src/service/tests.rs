use super::*;
use crate::MicrosoftTokens;
use async_trait::async_trait;
use std::sync::{Arc, Mutex as StdMutex};
#[derive(Clone, Default)]
struct Vault {
    secret: Arc<StdMutex<Option<String>>>,
    fail: Arc<StdMutex<bool>>,
}
impl SecretVault for Vault {
    fn supported(&self) -> bool {
        true
    }
    fn read(&self) -> Result<Option<String>, AuthError> {
        Ok(self.secret.lock().unwrap().clone())
    }
    fn write(&self, secret: &str) -> Result<(), AuthError> {
        if *self.fail.lock().unwrap() {
            return Err(AuthError::new(
                Stage::Storage,
                "test",
                "Storage unavailable",
            ));
        }
        *self.secret.lock().unwrap() = Some(secret.into());
        Ok(())
    }
    fn clear(&self) -> Result<(), AuthError> {
        if *self.fail.lock().unwrap() {
            return Err(AuthError::new(
                Stage::Storage,
                "test",
                "Storage unavailable",
            ));
        }
        *self.secret.lock().unwrap() = None;
        Ok(())
    }
}
struct Fake {
    fail: bool,
    wait: bool,
}
#[async_trait]
impl Provider for Fake {
    async fn interactive(&self, _: OpenBrowser, _: Progress) -> Result<MicrosoftTokens, AuthError> {
        if self.wait {
            std::future::pending::<()>().await;
        }
        self.refresh("").await
    }
    async fn refresh(&self, _: &str) -> Result<MicrosoftTokens, AuthError> {
        Ok(MicrosoftTokens {
            access_token: "microsoft-secret".into(),
            refresh_token: "rotated-secret".into(),
        })
    }
    async fn minecraft(&self, _: &str, _: Progress) -> Result<SessionTokens, AuthError> {
        if self.fail {
            return Err(AuthError::new(
                Stage::Profile,
                "no_java_access",
                "No Java access",
            ));
        }
        Ok(SessionTokens {
            account: Account {
                username: "Player".into(),
                minecraft_id: "a".repeat(32),
            },
            access_token: "minecraft-secret".into(),
            expires_at: crate::now() + 3600,
            xuid: None,
        })
    }
}
fn progress() -> Progress {
    Arc::new(|_| {})
}
fn open() -> OpenBrowser {
    Arc::new(|_| Ok(()))
}
#[tokio::test]
async fn commits_only_verified_accounts_and_never_serializes_tokens() {
    let vault = Vault::default();
    let service = AuthService::new(
        Fake {
            fail: false,
            wait: false,
        },
        vault.clone(),
    );
    let view = service.sign_in(open(), progress()).await.unwrap();
    assert!(view.verified && view.has_saved_session);
    let public = serde_json::to_string(&view).unwrap();
    assert!(!public.contains("secret") && !public.contains("token"));
    let saved = vault.read().unwrap().unwrap();
    assert!(saved.contains("rotated-secret"));
    assert!(!saved.contains("minecraft-secret") && !saved.contains("microsoft-secret"));
    service.sign_out().await.unwrap();
    assert!(vault.read().unwrap().is_none());
    assert!(service.status().await.account.is_none());
}
#[tokio::test]
async fn failed_verification_does_not_save_new_account() {
    let vault = Vault::default();
    let service = AuthService::new(
        Fake {
            fail: true,
            wait: false,
        },
        vault.clone(),
    );
    assert!(service.sign_in(open(), progress()).await.is_err());
    assert!(vault.read().unwrap().is_none());
    assert!(!service.status().await.verified);
}
#[tokio::test]
async fn refresh_rotation_survives_later_network_failure() {
    let vault = Vault::default();
    vault
        .write(
            &serde_json::to_string(&SavedSession {
                refresh_token: "old-secret".into(),
                account: Account {
                    username: "Cached".into(),
                    minecraft_id: "b".repeat(32),
                },
            })
            .unwrap(),
        )
        .unwrap();
    let service = AuthService::new(
        Fake {
            fail: true,
            wait: false,
        },
        vault.clone(),
    );
    assert!(service.restore(progress()).await.is_err());
    assert!(vault.read().unwrap().unwrap().contains("rotated-secret"));
    let view = service.status().await;
    assert!(!view.verified && view.has_saved_session);
    assert_eq!(view.account.unwrap().username, "Cached");
}
#[tokio::test]
async fn storage_failure_never_claims_success() {
    let vault = Vault::default();
    let service = AuthService::new(
        Fake {
            fail: false,
            wait: false,
        },
        vault.clone(),
    );
    service.sign_in(open(), progress()).await.unwrap();
    *vault.fail.lock().unwrap() = true;
    assert!(service.sign_out().await.is_err());
    assert!(service.status().await.has_saved_session);
    assert!(service.sign_in(open(), progress()).await.is_err());
}
#[tokio::test]
async fn cancellation_drops_work_and_allows_retry() {
    let service = AuthService::new(
        Fake {
            fail: false,
            wait: true,
        },
        Vault::default(),
    );
    let sign_in = service.sign_in(open(), progress());
    tokio::pin!(sign_in);
    tokio::select! { _ = &mut sign_in => panic!("should wait"), _ = tokio::task::yield_now() => {} }
    assert_eq!(
        service.sign_in(open(), progress()).await.unwrap_err().code,
        "busy"
    );
    service.cancel().await;
    assert_eq!(sign_in.await.unwrap_err().code, "cancelled");
    assert!(service.status().await.account.is_none());
    assert!(service.begin().await.is_ok());
}

#[tokio::test]
async fn failed_account_switch_preserves_existing_cached_identity_and_credentials() {
    let vault = Vault::default();
    let saved = serde_json::to_string(&SavedSession {
        refresh_token: "existing".into(),
        account: Account {
            username: "Existing".into(),
            minecraft_id: "b".repeat(32),
        },
    })
    .unwrap();
    vault.write(&saved).unwrap();
    let service = AuthService::new(
        Fake {
            fail: true,
            wait: false,
        },
        vault.clone(),
    );
    assert!(service.restore(progress()).await.is_err());
    let before = vault.read().unwrap();
    assert!(service.sign_in(open(), progress()).await.is_err());
    assert_eq!(vault.read().unwrap(), before);
    assert_eq!(service.status().await.account.unwrap().username, "Existing");
    assert!(!service.status().await.verified);
}

#[tokio::test]
async fn sign_out_during_authentication_prevents_late_account_commit() {
    let vault = Vault::default();
    let service = AuthService::new(
        Fake {
            fail: false,
            wait: true,
        },
        vault.clone(),
    );
    let login = service.sign_in(open(), progress());
    tokio::pin!(login);
    tokio::select! { _ = &mut login => panic!("should wait"), _ = tokio::task::yield_now() => {} }
    service.sign_out().await.unwrap();
    assert_eq!(login.await.unwrap_err().code, "cancelled");
    assert!(vault.read().unwrap().is_none());
    assert!(service.status().await.account.is_none());
}

#[tokio::test(start_paused = true)]
async fn stalled_login_times_out_and_releases_pending_state() {
    let service = AuthService::new(
        Fake {
            fail: false,
            wait: true,
        },
        Vault::default(),
    );
    let error = service.sign_in(open(), progress()).await.unwrap_err();
    assert_eq!(error.code, "timeout");
    assert!(service.begin().await.is_ok());
    assert!(service.status().await.account.is_none());
}

#[tokio::test]
async fn native_launch_handoff_refreshes_expired_sessions_and_requires_verified_account() {
    let service = AuthService::new(
        Fake {
            fail: false,
            wait: false,
        },
        Vault::default(),
    );
    assert!(service.launch_session(progress()).await.is_err());
    service.sign_in(open(), progress()).await.unwrap();
    let session = service.launch_session(progress()).await.unwrap();
    assert_eq!(session.access_token, "minecraft-secret");
    {
        let mut inner = service.inner.lock().await;
        inner.session.as_mut().unwrap().expires_at = 0;
    }
    assert!(service.launch_session(progress()).await.unwrap().expires_at > crate::now() + 60);
    let view = serde_json::to_string(&service.status().await).unwrap();
    assert!(!view.contains("secret"));
    service.sign_out().await.unwrap();
    assert!(service.launch_session(progress()).await.is_err());
}
