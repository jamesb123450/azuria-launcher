//! Native message encryption. No secret keys are exposed to the webview or server.
//! Static account keys: this protocol does not provide forward secrecy.
use argon2::{Algorithm, Argon2, Params, Version};
use base64::{engine::general_purpose::STANDARD, Engine};
use chacha20poly1305::{aead::KeyInit, XChaCha20Poly1305};
use crypto_box::{
    aead::{Aead, Payload},
    PublicKey, SalsaBox, SecretKey,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use zeroize::Zeroize;
pub use zeroize::Zeroizing;

const FAILURE: &str = "This encrypted message could not be verified.";

pub struct Identity(SecretKey);
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Ciphertext {
    pub v: u8,
    pub n: String,
    pub c: String,
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Content {
    protocol: String,
    sender: String,
    recipient: String,
    client_id: String,
    text: String,
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Backup {
    version: u8,
    account: String,
    salt: String,
    nonce: String,
    ciphertext: String,
}
fn random<const N: usize>() -> Result<[u8; N], String> {
    let mut bytes = [0; N];
    getrandom::fill(&mut bytes).map_err(|_| "Secure randomness is unavailable.".to_string())?;
    Ok(bytes)
}
fn decode<const N: usize>(value: &str) -> Result<[u8; N], String> {
    let bytes = Zeroizing::new(STANDARD.decode(value).map_err(|_| FAILURE.to_string())?);
    bytes.as_slice().try_into().map_err(|_| FAILURE.to_string())
}
fn public(value: &str) -> Result<PublicKey, String> {
    let bytes = decode::<32>(value)?;
    // Reject non-contributory X25519 public keys, including low-order points.
    if x25519_dalek::x25519([42; 32], bytes) == [0; 32] {
        return Err(FAILURE.into());
    }
    Ok(PublicKey::from(bytes))
}
impl Identity {
    pub fn generate() -> Result<Self, String> {
        let mut bytes = random::<32>()?;
        let identity = Self(SecretKey::from(bytes));
        bytes.zeroize();
        Ok(identity)
    }
    pub fn from_saved(value: &str) -> Result<Self, String> {
        let mut bytes = decode::<32>(value)?;
        let identity = Self(SecretKey::from(bytes));
        bytes.zeroize();
        Ok(identity)
    }
    pub fn saved(&self) -> Zeroizing<String> {
        {
            let bytes = Zeroizing::new(self.0.to_bytes());
            Zeroizing::new(STANDARD.encode(bytes.as_ref()))
        }
    }
    pub fn public_key(&self) -> String {
        STANDARD.encode(self.0.public_key().as_bytes())
    }
    pub fn encrypt(
        &self,
        peer: &str,
        sender: &str,
        recipient: &str,
        client_id: &str,
        text: &str,
    ) -> Result<Ciphertext, String> {
        if text.trim().is_empty() || text.chars().count() > 2000 {
            return Err("Write a message of up to 2,000 characters.".into());
        }
        let content = Content {
            protocol: "azuria-message-v1".into(),
            sender: sender.into(),
            recipient: recipient.into(),
            client_id: client_id.into(),
            text: text.into(),
        };
        let plaintext =
            Zeroizing::new(serde_json::to_vec(&content).map_err(|_| FAILURE.to_string())?);
        let nonce = random::<24>()?;
        let data = SalsaBox::new(&public(peer)?, &self.0)
            .encrypt((&nonce).into(), plaintext.as_slice())
            .map_err(|_| FAILURE.to_string())?;
        Ok(Ciphertext {
            v: 1,
            n: STANDARD.encode(nonce),
            c: STANDARD.encode(data),
        })
    }
    pub fn decrypt(
        &self,
        peer: &str,
        sender: &str,
        recipient: &str,
        client_id: &str,
        value: &Ciphertext,
    ) -> Result<String, String> {
        if value.v != 1 || value.c.len() > 14000 {
            return Err(FAILURE.into());
        }
        let nonce = decode::<24>(&value.n)?;
        let data = STANDARD.decode(&value.c).map_err(|_| FAILURE.to_string())?;
        let plaintext = Zeroizing::new(
            SalsaBox::new(&public(peer)?, &self.0)
                .decrypt((&nonce).into(), data.as_slice())
                .map_err(|_| FAILURE.to_string())?,
        );
        let content: Content =
            serde_json::from_slice(&plaintext).map_err(|_| FAILURE.to_string())?;
        if content.protocol != "azuria-message-v1"
            || content.sender != sender
            || content.recipient != recipient
            || content.client_id != client_id
            || content.text.trim().is_empty()
            || content.text.chars().count() > 2000
        {
            return Err(FAILURE.into());
        }
        Ok(content.text)
    }
    pub fn backup(&self, account: &str, passphrase: &str) -> Result<String, String> {
        if passphrase.chars().count() < 12 || passphrase.len() > 1024 {
            return Err("Use a recovery passphrase of at least 12 characters.".into());
        }
        let salt = random::<16>()?;
        let nonce = random::<24>()?;
        let key = backup_key(passphrase, &salt)?;
        let secret = Zeroizing::new(self.0.to_bytes());
        let ciphertext = XChaCha20Poly1305::new_from_slice(key.as_ref())
            .map_err(|_| FAILURE.to_string())?
            .encrypt(
                (&nonce).into(),
                Payload {
                    msg: secret.as_ref(),
                    aad: account.as_bytes(),
                },
            )
            .map_err(|_| FAILURE.to_string())?;
        serde_json::to_string(&Backup {
            version: 1,
            account: account.into(),
            salt: STANDARD.encode(salt),
            nonce: STANDARD.encode(nonce),
            ciphertext: STANDARD.encode(ciphertext),
        })
        .map_err(|_| FAILURE.to_string())
    }
    pub fn restore(account: &str, passphrase: &str, file: &str) -> Result<Self, String> {
        if file.len() > 4096 || passphrase.len() > 1024 {
            return Err("Invalid recovery file or passphrase.".into());
        }
        let backup: Backup =
            serde_json::from_str(file).map_err(|_| "Invalid recovery file.".to_string())?;
        if backup.version != 1 || backup.account != account {
            return Err("This recovery file belongs to another account or version.".into());
        }
        let salt = decode::<16>(&backup.salt)?;
        let nonce = decode::<24>(&backup.nonce)?;
        let ciphertext = STANDARD
            .decode(&backup.ciphertext)
            .map_err(|_| FAILURE.to_string())?;
        let key = backup_key(passphrase, &salt)?;
        let secret = Zeroizing::new(
            XChaCha20Poly1305::new_from_slice(key.as_ref())
                .map_err(|_| FAILURE.to_string())?
                .decrypt(
                    (&nonce).into(),
                    Payload {
                        msg: &ciphertext,
                        aad: account.as_bytes(),
                    },
                )
                .map_err(|_| {
                    "The recovery passphrase is incorrect or the file was changed.".to_string()
                })?,
        );
        let mut bytes: [u8; 32] = secret
            .as_slice()
            .try_into()
            .map_err(|_| FAILURE.to_string())?;
        let identity = Self(SecretKey::from(bytes));
        bytes.zeroize();
        Ok(identity)
    }
}
fn backup_key(passphrase: &str, salt: &[u8; 16]) -> Result<Zeroizing<[u8; 32]>, String> {
    let mut key = Zeroizing::new([0; 32]);
    let params = Params::new(19_456, 2, 1, Some(32)).map_err(|_| FAILURE.to_string())?;
    Argon2::new(Algorithm::Argon2id, Version::V0x13, params)
        .hash_password_into(passphrase.as_bytes(), salt, key.as_mut())
        .map_err(|_| "Could not protect the recovery file.".to_string())?;
    Ok(key)
}
/// Compare this code with your friend over an independent trusted channel.
pub fn security_code(actor: &str, own: &str, peer: &str, other: &str) -> Result<String, String> {
    public(own)?;
    public(other)?;
    let mut pair = [(actor, own), (peer, other)];
    pair.sort_unstable();
    let encoded =
        serde_json::to_vec(&("azuria-message-v1", pair)).map_err(|_| FAILURE.to_string())?;
    let hex: String = Sha256::digest(encoded)
        .iter()
        .map(|byte| format!("{byte:02X}"))
        .collect();
    Ok(hex
        .as_bytes()
        .chunks(8)
        .map(|chunk| std::str::from_utf8(chunk).unwrap_or_default())
        .collect::<Vec<_>>()
        .join(" "))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn both_participants_decrypt_and_other_keys_cannot() {
        let a = Identity::generate().unwrap();
        let b = Identity::generate().unwrap();
        let c = Identity::generate().unwrap();
        let cipher = a
            .encrypt(&b.public_key(), "alice", "bob", "id", "Hello 🌎")
            .unwrap();
        assert_eq!(
            b.decrypt(&a.public_key(), "alice", "bob", "id", &cipher)
                .unwrap(),
            "Hello 🌎"
        );
        assert_eq!(
            a.decrypt(&b.public_key(), "alice", "bob", "id", &cipher)
                .unwrap(),
            "Hello 🌎"
        );
        assert!(c
            .decrypt(&a.public_key(), "alice", "bob", "id", &cipher)
            .is_err());
        assert_eq!(
            security_code("alice", &a.public_key(), "bob", &b.public_key()).unwrap(),
            security_code("bob", &b.public_key(), "alice", &a.public_key()).unwrap()
        );
    }
    #[test]
    fn tampering_replays_wrong_context_and_low_order_keys_are_rejected() {
        let a = Identity::generate().unwrap();
        let b = Identity::generate().unwrap();
        let cipher = a
            .encrypt(&b.public_key(), "alice", "bob", "id", "Hello")
            .unwrap();
        for (s, r, id) in [
            ("bob", "alice", "id"),
            ("alice", "other", "id"),
            ("alice", "bob", "other"),
        ] {
            assert!(b.decrypt(&a.public_key(), s, r, id, &cipher).is_err());
        }
        let mut modified = cipher.clone();
        modified.c.replace_range(0..4, "AAAA");
        assert!(b
            .decrypt(&a.public_key(), "alice", "bob", "id", &modified)
            .is_err());
        modified = cipher.clone();
        modified.v = 2;
        assert!(b
            .decrypt(&a.public_key(), "alice", "bob", "id", &modified)
            .is_err());
        assert!(a
            .encrypt(&STANDARD.encode([0; 32]), "a", "b", "id", "Hello")
            .is_err());
        assert_ne!(
            cipher.n,
            a.encrypt(&b.public_key(), "alice", "bob", "id", "Hello")
                .unwrap()
                .n
        );
    }
    #[test]
    fn decrypts_an_independent_libsodium_test_vector() {
        // Generated independently with PyNaCl Box (libsodium), fixed keys and nonce.
        let a = Identity::from_saved("AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE=").unwrap();
        let b = Identity::from_saved("AgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgI=").unwrap();
        let cipher = Ciphertext { v: 1, n: "AwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMD".into(), c: "Lly79AtpP/Pr9yHgefc0BJgJD31EYlXNS2wETVjLuo64M8GYBXF5lzc81msEVFgfMOmh2maN041hFyRzdbxLxzy4poZUKT76Qzz70SJqv0JWxDDR9f74AT2FDxOAdcqo9kKzp6NIY5t6WQM7ZyhhVI6r4dKkRK9Xbbhh".into() };
        assert_eq!(
            b.decrypt(&a.public_key(), "alice", "bob", "id", &cipher)
                .unwrap(),
            "Interop check"
        );
    }
    #[test]
    fn protected_backups_require_the_correct_account_and_passphrase() {
        let a = Identity::generate().unwrap();
        let pass = "a long recovery passphrase";
        let backup = a.backup("alice", pass).unwrap();
        assert!(!backup.contains(a.saved().as_str()));
        assert_eq!(
            Identity::restore("alice", pass, &backup)
                .unwrap()
                .public_key(),
            a.public_key()
        );
        assert!(Identity::restore("bob", pass, &backup).is_err());
        assert!(Identity::restore("alice", "wrong", &backup).is_err());
        assert!(a.backup("alice", "short").is_err());
    }
}
