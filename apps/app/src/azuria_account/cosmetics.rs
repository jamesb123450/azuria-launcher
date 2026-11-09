use super::*;
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum CosmeticAction {
    Snapshot,
    Claim,
    Equip,
    Unequip,
    Link,
    Unlink,
}

#[tauri::command]
pub async fn azuria_cosmetics(
    app: tauri::AppHandle,
    state: State<'_, AzuriaAccounts>,
    action: CosmeticAction,
    cape: Option<String>,
    expected_account: String,
    expected_minecraft: Option<String>,
) -> Result<serde_json::Value, String> {
    let _operation = state.operation()?;
    let config = config().ok_or("Azuria accounts are not configured in this build.")?;
    let tokens = state.tokens(&config).await?;
    if tokens.user.id != expected_account {
        return Err("Account changed. Refresh your wardrobe.".into());
    }
    let selected = || -> Result<&str, String> {
        let id = cape.as_deref().ok_or("Choose a cape.")?;
        if id.is_empty()
            || id.len() > 64
            || !id
                .bytes()
                .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == b'-')
        {
            return Err("Invalid cape selection.".into());
        }
        Ok(id)
    };
    match action {
        CosmeticAction::Snapshot => {}
        CosmeticAction::Claim => {
            friends_rpc(
                &config,
                &tokens.access_token,
                "cosmetics_claim",
                &serde_json::json!({"p_cape":selected()?}),
            )
            .await
            .map_err(|_| "Could not claim this cape. Refresh and try again.")?;
        }
        CosmeticAction::Equip | CosmeticAction::Unequip => {
            let value = if matches!(action, CosmeticAction::Unequip) {
                None
            } else {
                Some(selected()?)
            };
            friends_rpc(
                &config,
                &tokens.access_token,
                "cosmetics_equip",
                &serde_json::json!({"p_cape":value}),
            )
            .await
            .map_err(|_| "Could not equip this cape. Make sure you own it and refresh.")?;
        }
        CosmeticAction::Unlink => {
            friends_rpc(
                &config,
                &tokens.access_token,
                "cosmetics_unlink",
                &serde_json::json!({}),
            )
            .await?;
        }
        CosmeticAction::Link => {
            let accounts = app.state::<crate::Accounts>();
            let session = accounts
                .launch_session(crate::auth_progress(app.clone()))
                .await
                .map_err(|e| e.message)?;
            if expected_minecraft.as_deref() != Some(session.account.minecraft_id.as_str()) {
                return Err("Minecraft account changed. Refresh and retry.".into());
            }
            let response = client()?
                .post(format!("{}/functions/v1/cosmetics-link", config.url))
                .header("apikey", config.key)
                .bearer_auth(&tokens.access_token)
                .json(&serde_json::json!({"minecraftToken":session.access_token}))
                .send()
                .await
                .map_err(|_| "Could not link Minecraft. Check your connection.")?;
            if !response.status().is_success() {
                return Err("Could not verify this Minecraft account. It may already be linked; unlink the existing account first.".into());
            }
        }
    }
    friends_rpc(
        &config,
        &tokens.access_token,
        "cosmetics_snapshot",
        &serde_json::json!({}),
    )
    .await
    .map_err(|_| {
        "Cosmetics are unavailable. Check the service setup and refresh your wardrobe.".into()
    })
}
