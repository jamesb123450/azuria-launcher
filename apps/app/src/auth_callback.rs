//! Strict custom-protocol validation, independent of the UI and account service.
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use sha2::{Digest, Sha256};
use std::time::Duration;

pub(super) fn parse(raw: &str) -> Option<(String, String)> {
    if raw.len() > 256 {
        return None;
    }
    let url = reqwest::Url::parse(raw).ok()?;
    if url.scheme() != "azuria"
        || url.host_str() != Some("auth")
        || url.path() != "/callback"
        || !url.username().is_empty()
        || url.password().is_some()
        || url.port().is_some()
        || url.fragment().is_some()
    {
        return None;
    }
    let mut code = None;
    let mut state = None;
    for (key, value) in url.query_pairs() {
        if value.len() != 43
            || !value
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b"_-".contains(&b))
        {
            return None;
        }
        match key.as_ref() {
            "code" if code.is_none() => code = Some(value.into_owned()),
            "state" if state.is_none() => state = Some(value.into_owned()),
            _ => return None,
        }
    }
    Some((code?, state?))
}
pub(super) fn validate_request(
    verifier: &str,
    elapsed: Duration,
    challenge: &str,
) -> Result<(), String> {
    if elapsed > Duration::from_secs(900) {
        return Err("This sign-in request expired. Start again.".into());
    }
    if URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes())) != challenge {
        return Err(
            "This connection belongs to a different sign-in request. Use the latest browser tab."
                .into(),
        );
    }
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    fn valid() -> String {
        format!(
            "azuria://auth/callback?code={}&state={}",
            "a".repeat(43),
            "b".repeat(43)
        )
    }
    #[test]
    fn accepts_only_the_fixed_callback_and_two_bounded_values() {
        assert_eq!(parse(&valid()), Some(("a".repeat(43), "b".repeat(43))));
        for invalid in [
            valid().replace("azuria:", "https:"),
            valid().replace("auth/", "other/"),
            valid().replace("/callback", "/other"),
            valid().replace("auth/", "user@auth/"),
            valid().replace("auth/", "auth:123/"),
            format!("{}#token", valid()),
            format!("{}&redirect=https://evil.test", valid()),
            format!("{}&code={}", valid(), "c".repeat(43)),
            valid().replace(&"a".repeat(43), "short"),
            valid().replace("state=", "state=+"),
            "azuria://auth/callback".into(),
        ] {
            assert!(parse(&invalid).is_none(), "accepted malformed callback");
        }
    }
    #[test]
    fn rejects_expired_and_mismatched_requests_before_redemption() {
        let verifier = "a private verifier that never leaves the launcher";
        let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
        assert!(validate_request(verifier, Duration::from_secs(1), &challenge).is_ok());
        assert!(validate_request(verifier, Duration::from_secs(901), &challenge).is_err());
        assert!(validate_request("another request", Duration::from_secs(1), &challenge).is_err());
    }
}
