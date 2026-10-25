use super::*;
use azuria_auth::messaging::{security_code, Ciphertext, Identity, Zeroizing};

#[cfg(windows)]
fn vault(config: &Config, account: &str, kind: &str) -> Result<keyring::Entry, String> {
    let scope = URL_SAFE_NO_PAD.encode(Sha256::digest(config.url.as_bytes()));
    keyring::Entry::new(
        "com.azuria.launcher.messages",
        &format!("{scope}:{account}:{kind}"),
    )
    .map_err(|_| "Windows Credential Manager is unavailable.".into())
}
fn load(config: &Config, account: &str, kind: &str) -> Result<Option<Zeroizing<String>>, String> {
    #[cfg(windows)]
    {
        match vault(config, account, kind)?.get_password() {
            Ok(value) => Ok(Some(Zeroizing::new(value))),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(_) => Err("Could not read the saved messaging key.".into()),
        }
    }
    #[cfg(not(windows))]
    {
        let _ = (config, account, kind);
        Err("Encrypted messaging requires the Windows launcher.".into())
    }
}
fn store(config: &Config, account: &str, kind: &str, value: &str) -> Result<(), String> {
    #[cfg(windows)]
    {
        vault(config, account, kind)?
            .set_password(value)
            .map_err(|_| "Could not save the messaging key securely.".into())
    }
    #[cfg(not(windows))]
    {
        let _ = (config, account, kind, value);
        Err("Encrypted messaging requires the Windows launcher.".into())
    }
}
async fn remote_key(config: &Config, access: &str, target: &str) -> Result<Option<String>, String> {
    let value = friends_rpc(
        config,
        access,
        "message_key",
        &serde_json::json!({"p_target":target}),
    )
    .await?;
    if value.is_null() {
        return Ok(None);
    }
    value
        .as_str()
        .map(|key| Some(key.to_string()))
        .ok_or("Could not read the encryption key.".into())
}
async fn identity(config: &Config, access: &str, actor: &str) -> Result<Identity, String> {
    let remote = remote_key(config, access, actor).await?;
    let local = load(config, actor, "identity")?;
    let key = match local {
        Some(value) => Identity::from_saved(&value)?,
        None if remote.is_some() => return Err(
            "Restore your messaging recovery file to read or send encrypted messages on this PC."
                .into(),
        ),
        None => {
            let key = Identity::generate()?;
            store(config, actor, "identity", &key.saved())?;
            key
        }
    };
    if let Some(remote) = remote {
        if remote != key.public_key() {
            return Err(
                "Your messaging key does not match. Restore the correct recovery file.".into(),
            );
        }
    } else {
        friends_rpc(
            config,
            access,
            "message_register_key",
            &serde_json::json!({"p_key":key.public_key()}),
        )
        .await?;
    }
    Ok(key)
}
fn pin(config: &Config, actor: &str, target: &str, public: &str) -> Result<(), String> {
    let name = format!("friend:{target}");
    match load(config,actor,&name)? {
        Some(saved) if saved.as_str()!=public=>Err("Your friend's encryption key changed. Messaging is paused; verify their identity before continuing.".into()),
        Some(_)=>Ok(()),
        None=>store(config,actor,&name,public)
    }
}
fn decrypt_rows(
    data: serde_json::Value,
    key: &Identity,
    public: &str,
    actor: &str,
    target: &str,
) -> Result<serde_json::Value, String> {
    let mut rows = data
        .as_array()
        .cloned()
        .ok_or("Could not read encrypted messages.")?;
    for row in &mut rows {
        let sender = row["sender_id"]
            .as_str()
            .ok_or("Invalid sender.")?
            .to_string();
        let recipient = row["recipient_id"]
            .as_str()
            .ok_or("Invalid recipient.")?
            .to_string();
        if !((sender == actor && recipient == target) || (sender == target && recipient == actor)) {
            return Err("A message belongs to another conversation.".into());
        }
        if !row["encrypted"].is_null() {
            let client = row["client_id"].as_str().ok_or("Invalid message ID.")?;
            let cipher: Ciphertext = serde_json::from_value(row["encrypted"].clone())
                .map_err(|_| "Invalid encrypted message.")?;
            match key.decrypt(public, &sender, &recipient, client, &cipher) {
                Ok(text) => {
                    row["body"] = serde_json::json!(text);
                    row["encryption"] = serde_json::json!("encrypted");
                }
                Err(_) => {
                    row["body"] = serde_json::json!("This message could not be verified.");
                    row["encryption"] = serde_json::json!("unverified");
                }
            }
        } else {
            row["encryption"] = serde_json::json!("legacy");
        }
        row.as_object_mut()
            .ok_or("Invalid message.")?
            .remove("encrypted");
    }
    Ok(serde_json::json!(rows))
}
#[cfg(windows)]
fn recovery(
    action: &str,
    actor: &str,
    password: &str,
    key: Option<&Identity>,
) -> Result<Option<Identity>, String> {
    if password.chars().count() < 12 || password.len() > 1024 {
        return Err("Enter a recovery passphrase of at least 12 characters.".into());
    }
    if action == "backup" {
        let file = key
            .ok_or("Restore your messaging key first.")?
            .backup(actor, password)?;
        let path = rfd::FileDialog::new()
            .set_title("Save encrypted messaging recovery file")
            .set_file_name("azuria-messaging-recovery.json")
            .add_filter("Recovery file", &["json"])
            .save_file()
            .ok_or("Recovery backup cancelled.")?;
        // Never silently overwrite another recovery file.
        use std::io::Write;
        let mut output = std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(path)
            .map_err(|_| "Choose a new file name for the recovery backup.")?;
        output
            .write_all(file.as_bytes())
            .and_then(|_| output.sync_all())
            .map_err(|_| "Could not save the recovery file.")?;
        Ok(None)
    } else {
        use std::io::Read;
        let path = rfd::FileDialog::new()
            .set_title("Restore messaging recovery file")
            .add_filter("Recovery file", &["json"])
            .pick_file()
            .ok_or("Recovery restore cancelled.")?;
        let file = std::fs::File::open(path).map_err(|_| "Could not open the recovery file.")?;
        let mut bytes = String::new();
        file.take(4097)
            .read_to_string(&mut bytes)
            .map_err(|_| "Could not read the recovery file.")?;
        Ok(Some(Identity::restore(actor, password, &bytes)?))
    }
}
#[cfg(not(windows))]
fn recovery(_: &str, _: &str, _: &str, _: Option<&Identity>) -> Result<Option<Identity>, String> {
    Err("Messaging recovery requires the Windows launcher.".into())
}

pub(super) async fn request(
    state: State<'_, AzuriaAccounts>,
    action: String,
    target: Option<String>,
    before: Option<String>,
    client_id: Option<String>,
    body: Option<String>,
) -> Result<serde_json::Value, String> {
    if ![
        "unread", "inbox", "history", "read", "send", "backup", "restore",
    ]
    .contains(&action.as_str())
    {
        return Err("Unknown messaging action.".into());
    }
    let target = target.as_deref().unwrap_or_default().to_ascii_lowercase();
    let target = target.as_str();
    if ["history", "read", "send"].contains(&action.as_str()) && !valid_friend_target(target) {
        return Err("Choose a valid friend.".into());
    }
    let _operation = state.operation()?;
    let config = config().ok_or("Azuria accounts are not configured in this build.")?;
    let tokens = state.tokens(&config).await?;
    if tokens.user.email_confirmed_at.is_none() {
        return Err("Verify your email first.".into());
    }
    save(&tokens.refresh_token)?;
    let actor = &tokens.user.id;
    let access = &tokens.access_token;
    if action == "restore" {
        let password = Zeroizing::new(body.unwrap_or_default());
        let key = recovery("restore", actor, &password, None)?.ok_or("Recovery was cancelled.")?;
        if remote_key(&config, access, actor).await?.as_deref() != Some(key.public_key().as_str()) {
            return Err("This recovery file does not match your account's encryption key.".into());
        }
        store(&config, actor, "identity", &key.saved())?;
        return Ok(serde_json::json!({"accountId":actor,"data":null}));
    }
    let key = identity(&config, access, actor).await?;
    if action == "backup" {
        let password = Zeroizing::new(body.unwrap_or_default());
        recovery("backup", actor, &password, Some(&key))?;
        return Ok(serde_json::json!({"accountId":actor,"data":null}));
    }
    if action == "unread" || action == "inbox" {
        let name = if action == "inbox" {
            "message_conversations"
        } else {
            "message_unread"
        };
        let data = friends_rpc(&config, access, name, &serde_json::json!({})).await?;
        return Ok(serde_json::json!({"accountId":actor,"data":data}));
    }
    let public = remote_key(&config, access, target).await?.ok_or(
        "Your friend needs to open Social in the updated launcher to set up encrypted messaging.",
    )?;
    let code = security_code(actor, &key.public_key(), target, &public)?;
    pin(&config, actor, target, &public)?;
    let cursor = || -> Result<Option<i64>, String> {
        before
            .as_deref()
            .map(|v| {
                v.parse::<i64>()
                    .map_err(|_| "Invalid message cursor.".into())
            })
            .transpose()
    };
    let data = match action.as_str() {
        "history" => {
            let payload = serde_json::json!({"p_target":target,"p_before":cursor()?});
            let data = friends_rpc(&config, access, "message_history", &payload).await?;
            decrypt_rows(data, &key, &public, actor, target)?
        }
        "read" => {
            let payload = serde_json::json!({"p_target":target,"p_through":cursor()?.ok_or("Choose a message.")?});
            friends_rpc(&config, access, "message_read", &payload).await?
        }
        "send" => {
            let text = Zeroizing::new(body.unwrap_or_default());
            let id = client_id
                .as_deref()
                .filter(|id| valid_friend_target(id))
                .ok_or("Invalid message ID.")?
                .to_ascii_lowercase();
            let encrypted = key.encrypt(&public, actor, target, &id, text.trim())?;
            let payload =
                serde_json::json!({"p_target":target,"p_client_id":id,"p_payload":encrypted});
            let data = friends_rpc(&config, access, "message_send_encrypted", &payload).await?;
            let rows = decrypt_rows(data, &key, &public, actor, target)?;
            let matches_draft = rows.as_array().is_some_and(|rows| {
                rows.len() == 1
                    && rows[0]["encryption"] == "encrypted"
                    && rows[0]["client_id"].as_str() == Some(id.as_str())
                    && rows[0]["sender_id"].as_str() == Some(actor.as_str())
                    && rows[0]["body"].as_str() == Some(text.trim())
            });
            if !matches_draft {
                return Err(
                    "The saved message could not be confirmed. Your draft is still here.".into(),
                );
            }
            rows
        }
        _ => return Err("Unknown messaging action.".into()),
    };
    Ok(serde_json::json!({"accountId":actor,"data":data,"securityCode":code}))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn history_verifies_ciphertext_and_labels_legacy_without_plaintext_fallback() {
        let a = Identity::generate().unwrap();
        let b = Identity::generate().unwrap();
        let encrypted = a
            .encrypt(&b.public_key(), "alice", "bob", "request", "Hello")
            .unwrap();
        let row = serde_json::json!({"id":1,"sender_id":"alice","recipient_id":"bob","client_id":"request","encrypted":encrypted,"body":"untrusted fallback"});
        let rows = decrypt_rows(
            serde_json::json!([row.clone()]),
            &b,
            &a.public_key(),
            "bob",
            "alice",
        )
        .unwrap();
        assert_eq!(rows[0]["body"], "Hello");
        assert_eq!(rows[0]["encryption"], "encrypted");
        let mut bad = row.clone();
        bad["client_id"] = serde_json::json!("different");
        let rows = decrypt_rows(
            serde_json::json!([bad]),
            &b,
            &a.public_key(),
            "bob",
            "alice",
        )
        .unwrap();
        assert_eq!(rows[0]["encryption"], "unverified");
        assert_ne!(rows[0]["body"], "untrusted fallback");
        let mut wrong = row.clone();
        wrong["sender_id"] = serde_json::json!("charlie");
        assert!(decrypt_rows(
            serde_json::json!([wrong]),
            &b,
            &a.public_key(),
            "bob",
            "alice"
        )
        .is_err());
        let mut old = row;
        old["encrypted"] = serde_json::Value::Null;
        old["body"] = serde_json::json!("Old text");
        let rows = decrypt_rows(
            serde_json::json!([old]),
            &b,
            &a.public_key(),
            "bob",
            "alice",
        )
        .unwrap();
        assert_eq!(rows[0]["encryption"], "legacy");
        assert_eq!(rows[0]["body"], "Old text");
    }
}
