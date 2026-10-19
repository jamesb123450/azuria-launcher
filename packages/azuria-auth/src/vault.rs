use crate::{AuthError, Stage};
pub trait SecretVault: Send + Sync {
    fn supported(&self) -> bool;
    fn read(&self) -> Result<Option<String>, AuthError>;
    fn write(&self, secret: &str) -> Result<(), AuthError>;
    fn clear(&self) -> Result<(), AuthError>;
}
pub struct NativeVault;
#[cfg(not(windows))]
fn unavailable() -> AuthError {
    AuthError::new(
        Stage::Storage,
        "platform",
        "Microsoft sign-in is available in the Windows desktop app.",
    )
}
#[cfg(windows)]
fn entry() -> Result<keyring::Entry, AuthError> {
    keyring::Entry::new("com.azuria.launcher.microsoft", "session").map_err(|_| storage_error())
}
#[cfg(windows)]
fn storage_error() -> AuthError {
    AuthError::new(Stage::Storage, "credentials", "Windows Credential Manager is unavailable. No credentials were written to an unencrypted file.")
}
impl SecretVault for NativeVault {
    fn supported(&self) -> bool {
        cfg!(windows)
    }
    fn read(&self) -> Result<Option<String>, AuthError> {
        #[cfg(windows)]
        {
            match entry()?.get_password() {
                Ok(secret) => Ok(Some(secret)),
                Err(keyring::Error::NoEntry) => Ok(None),
                Err(_) => Err(storage_error()),
            }
        }
        #[cfg(not(windows))]
        {
            Err(unavailable())
        }
    }
    fn write(&self, _secret: &str) -> Result<(), AuthError> {
        #[cfg(windows)]
        {
            entry()?.set_password(_secret).map_err(|_| storage_error())
        }
        #[cfg(not(windows))]
        {
            Err(unavailable())
        }
    }
    fn clear(&self) -> Result<(), AuthError> {
        #[cfg(windows)]
        {
            match entry()?.delete_credential() {
                Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
                Err(_) => Err(storage_error()),
            }
        }
        #[cfg(not(windows))]
        {
            Err(unavailable())
        }
    }
}
