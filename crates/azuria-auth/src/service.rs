use crate::{
    Account, AccountView, AuthError, OpenBrowser, Progress, Provider, SavedSession, SecretVault,
    SessionTokens, Stage,
};
use std::time::Duration;
use tokio::sync::{watch, Mutex};

struct Inner {
    account: Option<Account>,
    has_saved_session: bool,
    session: Option<SessionTokens>,
    generation: u64,
    pending: Option<watch::Sender<bool>>,
}
pub struct AuthService<P: Provider, V: SecretVault> {
    provider: P,
    vault: V,
    inner: Mutex<Inner>,
}
impl<P: Provider, V: SecretVault> AuthService<P, V> {
    pub fn new(provider: P, vault: V) -> Self {
        Self {
            provider,
            vault,
            inner: Mutex::new(Inner {
                account: None,
                has_saved_session: false,
                session: None,
                generation: 0,
                pending: None,
            }),
        }
    }
    fn view(&self, inner: &Inner) -> AccountView {
        AccountView {
            supported: self.vault.supported(),
            account: inner.account.clone(),
            verified: inner
                .session
                .as_ref()
                .is_some_and(|session| session.expires_at > crate::now()),
            has_saved_session: inner.has_saved_session,
        }
    }
    pub async fn status(&self) -> AccountView {
        let inner = self.inner.lock().await;
        self.view(&inner)
    }
    async fn begin(&self) -> Result<(u64, watch::Receiver<bool>), AuthError> {
        if !self.vault.supported() {
            return Err(AuthError::new(
                Stage::Storage,
                "platform",
                "Microsoft sign-in is available in the Windows desktop app.",
            ));
        }
        let mut inner = self.inner.lock().await;
        if inner.pending.is_some() {
            return Err(AuthError::new(
                Stage::Microsoft,
                "busy",
                "Another account operation is already in progress.",
            ));
        }
        inner.generation += 1;
        let (sender, receiver) = watch::channel(false);
        inner.pending = Some(sender);
        Ok((inner.generation, receiver))
    }
    async fn controlled<T>(
        &self,
        mut cancelled: watch::Receiver<bool>,
        action: impl std::future::Future<Output = Result<T, AuthError>>,
    ) -> Result<T, AuthError> {
        tokio::select! {
            biased;
            _ = async {
                loop {
                    if *cancelled.borrow() || cancelled.changed().await.is_err() { break; }
                }
            } => Err(AuthError::cancelled()),
            _ = tokio::time::sleep(Duration::from_secs(300)) =>
                Err(AuthError::new(Stage::Browser, "timeout", "Sign-in timed out. Close the browser tab and try again.")),
            result = action => result,
        }
    }
    async fn finish(
        &self,
        generation: u64,
        result: Result<(SessionTokens, String), AuthError>,
        progress: Progress,
    ) -> Result<AccountView, AuthError> {
        let mut inner = self.inner.lock().await;
        if inner.generation != generation || inner.pending.is_none() {
            return Err(AuthError::cancelled());
        }
        inner.pending = None;
        let (session, refresh_token) = result?;
        progress(Stage::Storage);
        // Only commit a new account after Minecraft verification and durable secure storage.
        let saved = SavedSession {
            refresh_token,
            account: session.account.clone(),
        };
        let secret = serde_json::to_string(&saved).map_err(|_| {
            AuthError::new(
                Stage::Storage,
                "credentials",
                "Could not save the account securely.",
            )
        })?;
        self.vault.write(&secret)?;
        inner.account = Some(session.account.clone());
        inner.session = Some(session);
        inner.has_saved_session = true;
        Ok(self.view(&inner))
    }
    pub async fn sign_in(
        &self,
        open: OpenBrowser,
        progress: Progress,
    ) -> Result<AccountView, AuthError> {
        let (generation, cancelled) = self.begin().await?;
        let result = self
            .controlled(cancelled, async {
                let microsoft = self.provider.interactive(open, progress.clone()).await?;
                let session = self
                    .provider
                    .minecraft(&microsoft.access_token, progress.clone())
                    .await?;
                Ok((session, microsoft.refresh_token))
            })
            .await;
        self.finish(generation, result, progress).await
    }
    pub async fn restore(&self, progress: Progress) -> Result<AccountView, AuthError> {
        if !self.vault.supported() {
            return Ok(self.status().await);
        }
        let (generation, cancelled) = self.begin().await?;
        let result = self
            .controlled(cancelled, async {
                let saved = {
                    let mut inner = self.inner.lock().await;
                    if inner.generation != generation || inner.pending.is_none() {
                        return Err(AuthError::cancelled());
                    }
                    let secret = self.vault.read()?;
                    let Some(secret) = secret else {
                        return Ok(None);
                    };
                    let saved: SavedSession = serde_json::from_str(&secret).map_err(|_| {
                        AuthError::new(
                            Stage::Storage,
                            "saved_session",
                            "The saved account could not be read. Remove it and sign in again.",
                        )
                    })?;
                    if saved.refresh_token.is_empty() {
                        return Err(AuthError::new(
                            Stage::Storage,
                            "saved_session",
                            "The saved account is incomplete. Remove it and sign in again.",
                        ));
                    }
                    inner.account = Some(saved.account.clone());
                    inner.has_saved_session = true;
                    inner.session = None;
                    saved
                };
                progress(Stage::Microsoft);
                let microsoft = self.provider.refresh(&saved.refresh_token).await?;
                {
                    // Save rotated refresh credentials before later network calls can fail.
                    // This is the same account; new interactive account switches are committed only in finish().
                    let inner = self.inner.lock().await;
                    if inner.generation != generation || inner.pending.is_none() {
                        return Err(AuthError::cancelled());
                    }
                    let rotated = SavedSession {
                        refresh_token: microsoft.refresh_token.clone(),
                        account: saved.account,
                    };
                    let secret = serde_json::to_string(&rotated).map_err(|_| {
                        AuthError::new(
                            Stage::Storage,
                            "credentials",
                            "Could not save the account securely.",
                        )
                    })?;
                    self.vault.write(&secret)?;
                }
                let session = self
                    .provider
                    .minecraft(&microsoft.access_token, progress.clone())
                    .await?;
                Ok(Some((session, microsoft.refresh_token)))
            })
            .await;
        match result {
            Ok(Some(session)) => self.finish(generation, Ok(session), progress).await,
            Ok(None) => {
                let mut inner = self.inner.lock().await;
                if inner.generation != generation || inner.pending.is_none() {
                    return Err(AuthError::cancelled());
                }
                inner.pending = None;
                inner.account = None;
                inner.has_saved_session = false;
                inner.session = None;
                Ok(self.view(&inner))
            }
            Err(error) => {
                let mut inner = self.inner.lock().await;
                if inner.generation == generation {
                    inner.pending = None;
                }
                Err(error)
            }
        }
    }
    pub async fn cancel(&self) -> AccountView {
        let mut inner = self.inner.lock().await;
        inner.generation += 1;
        if let Some(pending) = inner.pending.take() {
            let _ = pending.send(true);
        }
        self.view(&inner)
    }
    pub async fn sign_out(&self) -> Result<AccountView, AuthError> {
        let mut inner = self.inner.lock().await;
        inner.generation += 1;
        if let Some(pending) = inner.pending.take() {
            let _ = pending.send(true);
        }
        // Do not pretend sign-out succeeded if credentials could not be removed.
        self.vault.clear()?;
        inner.account = None;
        inner.has_saved_session = false;
        inner.session = None;
        Ok(self.view(&inner))
    }
}

#[cfg(test)]
mod tests;
