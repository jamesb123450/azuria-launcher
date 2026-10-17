//! Account cosmetics use native credentials and fixed Minecraft Services endpoints.
use crate::Accounts;
use base64::{engine::general_purpose::STANDARD, Engine};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::Manager;
const PROFILE: &str = "https://api.minecraftservices.com/minecraft/profile";
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Wardrobe {
    skin: Option<String>,
    variant: String,
    capes: Vec<Cape>,
}
#[derive(Serialize)]
pub struct Cape {
    id: String,
    alias: String,
    active: bool,
    image: Option<String>,
}
#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Change {
    UploadClassic,
    UploadSlim,
    ResetSkin,
    SelectCape,
    HideCape,
}
fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .https_only(true)
        .redirect(reqwest::redirect::Policy::none())
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|_| "Could not initialize Minecraft Services.".into())
}
async fn bytes(mut response: reqwest::Response, max: usize) -> Result<Vec<u8>, String> {
    if !response.status().is_success() {
        return Err(format!(
            "Minecraft Services returned HTTP {}. Reconnect your account and retry.",
            response.status().as_u16()
        ));
    }
    let mut out = vec![];
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| "Minecraft Services connection was interrupted.")?
    {
        if out.len() + chunk.len() > max {
            return Err("Minecraft Services response was too large.".into());
        }
        out.extend_from_slice(&chunk);
    }
    Ok(out)
}
async fn profile(client: &reqwest::Client, token: &str) -> Result<Value, String> {
    let response = client
        .get(PROFILE)
        .bearer_auth(token)
        .send()
        .await
        .map_err(|_| "Could not reach Minecraft Services.")?;
    serde_json::from_slice(&bytes(response, 1024 * 1024).await?)
        .map_err(|_| "Invalid Minecraft profile response.".into())
}
async fn texture(client: &reqwest::Client, value: &Value) -> Result<Option<String>, String> {
    let Some(url) = value["url"].as_str() else {
        return Ok(None);
    };
    let url = reqwest::Url::parse(url).map_err(|_| "Invalid texture URL.")?;
    if url.host_str() != Some("textures.minecraft.net")
        || !url.path().starts_with("/texture/")
        || url.port().is_some()
        || !url.username().is_empty()
    {
        return Err("Unrecognized Minecraft texture source.".into());
    }
    let url = format!("https://textures.minecraft.net{}", url.path());
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|_| "Could not load the Minecraft texture.")?;
    let png = bytes(response, 4 * 1024 * 1024).await?;
    if !png.starts_with(b"\x89PNG\r\n\x1a\n") {
        return Err("Minecraft returned an invalid texture image.".into());
    }
    Ok(Some(format!(
        "data:image/png;base64,{}",
        STANDARD.encode(png)
    )))
}
#[tauri::command]
pub async fn wardrobe_profile(
    app: tauri::AppHandle,
    expected_id: String,
) -> Result<Wardrobe, String> {
    let accounts = app.state::<Accounts>();
    let session = accounts
        .launch_session(crate::auth_progress(app.clone()))
        .await
        .map_err(|e| e.message)?;
    if session.account.minecraft_id != expected_id {
        return Err("Account changed. Refresh the wardrobe before making changes.".into());
    }
    let client = client()?;
    let profile = profile(&client, &session.access_token).await?;
    let skin = profile["skins"]
        .as_array()
        .and_then(|a| a.iter().find(|s| s["state"] == "ACTIVE"));
    let mut capes = vec![];
    if let Some(owned) = profile["capes"].as_array() {
        for cape in owned.iter().take(100) {
            capes.push(Cape {
                id: cape["id"]
                    .as_str()
                    .ok_or("Invalid cape identifier.")?
                    .into(),
                alias: cape["alias"].as_str().unwrap_or("Minecraft cape").into(),
                active: cape["state"] == "ACTIVE",
                image: texture(&client, cape).await.ok().flatten(),
            });
        }
    }
    Ok(Wardrobe {
        skin: match skin {
            Some(s) => texture(&client, s).await?,
            None => None,
        },
        variant: skin
            .and_then(|s| s["variant"].as_str())
            .unwrap_or("CLASSIC")
            .into(),
        capes,
    })
}
#[tauri::command]
pub async fn wardrobe_change(
    app: tauri::AppHandle,
    action: Change,
    cape_id: Option<String>,
    expected_id: String,
) -> Result<bool, String> {
    // Pick the file before refreshing credentials; no arbitrary path is accepted over IPC.
    let upload: Option<Vec<u8>> = if matches!(action, Change::UploadClassic | Change::UploadSlim) {
        #[cfg(windows)]
        {
            let path = tauri::async_runtime::spawn_blocking(|| {
                rfd::FileDialog::new()
                    .add_filter("Minecraft PNG skin", &["png"])
                    .pick_file()
            })
            .await
            .map_err(|_| "Could not open the skin picker.")?;
            let Some(path) = path else { return Ok(false) };
            let meta = std::fs::metadata(&path).map_err(|_| "Could not read the skin file.")?;
            if meta.len() > 1024 * 1024 {
                return Err("Choose a skin smaller than 1 MB.".into());
            }
            let data = std::fs::read(path).map_err(|_| "Could not read the skin file.")?;
            validate_skin(&data)?;
            Some(data)
        }
        #[cfg(not(windows))]
        {
            return Err("Skin uploads require the Windows desktop app.".into());
        }
    } else {
        None
    };
    let accounts = app.state::<Accounts>();
    let session = accounts
        .launch_session(crate::auth_progress(app.clone()))
        .await
        .map_err(|e| e.message)?;
    if session.account.minecraft_id != expected_id {
        return Err("Account changed. Refresh the wardrobe before making changes.".into());
    }
    let client = client()?;
    let request = match action {
        Change::UploadClassic | Change::UploadSlim => {
            let variant = if matches!(action, Change::UploadSlim) {
                "slim"
            } else {
                "classic"
            };
            let part = reqwest::multipart::Part::bytes(upload.ok_or("Missing skin image.")?)
                .file_name("skin.png")
                .mime_str("image/png")
                .map_err(|_| "Invalid skin format.")?;
            client.post(format!("{PROFILE}/skins")).multipart(
                reqwest::multipart::Form::new()
                    .text("variant", variant)
                    .part("file", part),
            )
        }
        Change::ResetSkin => client.delete(format!("{PROFILE}/skins/active")),
        Change::HideCape => client.delete(format!("{PROFILE}/capes/active")),
        Change::SelectCape => {
            let id = cape_id.ok_or("Select an owned cape.")?;
            let current = profile(&client, &session.access_token).await?;
            if !current["capes"]
                .as_array()
                .is_some_and(|a| a.iter().any(|c| c["id"].as_str() == Some(&id)))
            {
                return Err("This account does not own that cape.".into());
            }
            client
                .put(format!("{PROFILE}/capes/active"))
                .json(&json!({"capeId":id}))
        }
    };
    let response = request
        .bearer_auth(&session.access_token)
        .send()
        .await
        .map_err(|_| "Could not update Minecraft cosmetics. Check your connection and retry.")?;
    bytes(response, 1024 * 1024).await?;
    Ok(true)
}
#[cfg(any(windows, test))]
fn validate_skin(data: &[u8]) -> Result<(), String> {
    if data.len() < 24 || !data.starts_with(b"\x89PNG\r\n\x1a\n") {
        return Err("Choose a valid PNG skin.".into());
    }
    let width = u32::from_be_bytes(data[16..20].try_into().unwrap());
    let height = u32::from_be_bytes(data[20..24].try_into().unwrap());
    if width != 64 || ![32, 64].contains(&height) {
        return Err("Minecraft skins must be 64 × 64 or 64 × 32 pixels.".into());
    }
    image::load_from_memory_with_format(data, image::ImageFormat::Png)
        .map_err(|_| "The PNG skin is damaged.")?;
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_invalid_skin() {
        assert!(validate_skin(b"bad").is_err());
        let mut png = b"\x89PNG\r\n\x1a\n".to_vec();
        png.resize(24, 0);
        assert!(validate_skin(&png).is_err());
    }
}
