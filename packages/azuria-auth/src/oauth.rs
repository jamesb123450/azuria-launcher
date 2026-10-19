use crate::{AuthError, OpenBrowser, Stage};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use sha2::{Digest, Sha256};
use std::{collections::HashMap, time::Duration};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpListener,
};
use url::Url;

pub const CLIENT_ID: &str = "6979bfed-98b9-4801-8c21-f046c0ca82b3";
pub(crate) const TOKEN_URL: &str = "https://login.microsoftonline.com/consumers/oauth2/v2.0/token";
pub(crate) const SCOPE: &str = "XboxLive.signin offline_access";

fn random_secret() -> Result<String, AuthError> {
    let mut bytes = [0u8; 32];
    getrandom::fill(&mut bytes).map_err(|_| {
        AuthError::new(
            Stage::Browser,
            "random",
            "Secure sign-in could not be initialized.",
        )
    })?;
    Ok(URL_SAFE_NO_PAD.encode(bytes))
}
pub(crate) fn challenge(verifier: &str) -> String {
    URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()))
}
pub(crate) fn authorize_url(redirect: &str, state: &str, verifier: &str) -> String {
    let mut url = Url::parse("https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize")
        .expect("fixed URL");
    url.query_pairs_mut()
        .append_pair("client_id", CLIENT_ID)
        .append_pair("response_type", "code")
        .append_pair("response_mode", "query")
        .append_pair("redirect_uri", redirect)
        .append_pair("scope", SCOPE)
        .append_pair("state", state)
        .append_pair("code_challenge", &challenge(verifier))
        .append_pair("code_challenge_method", "S256")
        .append_pair("prompt", "select_account");
    url.into()
}

// None means an unrelated or untrusted callback; keep listening for the real one.
pub(crate) fn callback(
    request: &str,
    port: u16,
    expected_state: &str,
) -> Option<Result<String, AuthError>> {
    let mut lines = request.split("\r\n");
    let mut first = lines.next()?.split_whitespace();
    if first.next()? != "GET" {
        return None;
    }
    let target = first.next()?;
    let protocol = first.next()?;
    if first.next().is_some() || !["HTTP/1.1", "HTTP/1.0"].contains(&protocol) {
        return None;
    }
    let mut host = None;
    for line in lines.take_while(|line| !line.is_empty()) {
        let (name, value) = line.split_once(':')?;
        if name.eq_ignore_ascii_case("host") {
            if host.is_some() {
                return None;
            }
            host = Some(value.trim());
        }
        if name.eq_ignore_ascii_case("origin") {
            return None;
        }
    }
    if host? != format!("localhost:{port}") || !target.starts_with("/?") {
        return None;
    }
    let url = Url::parse(&format!("http://localhost:{port}{target}")).ok()?;
    if url.path() != "/" || url.fragment().is_some() {
        return None;
    }
    let mut params = HashMap::new();
    for (key, value) in url.query_pairs() {
        if params
            .insert(key.into_owned(), value.into_owned())
            .is_some()
        {
            return None;
        }
    }
    if params.get("state").map(String::as_str) != Some(expected_state) {
        return None;
    }
    if params.contains_key("error") {
        return Some(Err(
            if params.get("error").map(String::as_str) == Some("access_denied") {
                AuthError::cancelled()
            } else {
                AuthError::new(
                    Stage::Microsoft,
                    "authorization",
                    "Microsoft could not authorize Azuria. Check the app registration and retry.",
                )
            },
        ));
    }
    let code = params.get("code")?;
    if code.is_empty() || code.len() > 8192 {
        return None;
    }
    Some(Ok(code.clone()))
}

pub(crate) struct Authorization {
    pub code: String,
    pub verifier: String,
    pub redirect: String,
}
pub(crate) async fn authorize(open: OpenBrowser) -> Result<Authorization, AuthError> {
    // Bind first and keep the random port reserved throughout browser authentication.
    let listener = TcpListener::bind(("127.0.0.1", 0)).await.map_err(|_| {
        AuthError::new(
            Stage::Browser,
            "callback_bind",
            "Azuria could not open its local sign-in callback.",
        )
    })?;
    let port = listener
        .local_addr()
        .map_err(|_| {
            AuthError::new(
                Stage::Browser,
                "callback_bind",
                "The local callback is unavailable.",
            )
        })?
        .port();
    let redirect = format!("http://localhost:{port}");
    let verifier = random_secret()?;
    let state = random_secret()?;
    open(&authorize_url(&redirect, &state, &verifier))?;
    loop {
        let (mut stream, peer) = listener.accept().await.map_err(|_| {
            AuthError::new(
                Stage::Browser,
                "callback",
                "Could not receive the sign-in response.",
            )
        })?;
        if !peer.ip().is_loopback() {
            continue;
        }
        let read_request = async {
            let mut data = Vec::new();
            let mut chunk = [0; 1024];
            while data.len() <= 16384 {
                let count = stream.read(&mut chunk).await.ok()?;
                if count == 0 {
                    return None;
                }
                data.extend_from_slice(&chunk[..count]);
                if data.len() > 16384 {
                    return None;
                }
                if data.windows(4).any(|part| part == b"\r\n\r\n") {
                    return String::from_utf8(data).ok();
                }
            }
            None
        };
        let request = tokio::time::timeout(Duration::from_secs(2), read_request)
            .await
            .ok()
            .flatten();
        let outcome = request
            .as_deref()
            .and_then(|request| callback(request, port, &state));
        let (status, message) = if outcome.is_some() {
            (
                "200 OK",
                "Sign-in response received. You can close this tab and return to Azuria.",
            )
        } else {
            (
                "400 Bad Request",
                "This request is not a valid Azuria sign-in response.",
            )
        };
        let body = format!("<!doctype html><html lang=en><meta charset=utf-8><title>Azuria sign-in</title><p>{message}</p></html>");
        let response = format!("HTTP/1.1 {status}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nCache-Control: no-store\r\nReferrer-Policy: no-referrer\r\nContent-Security-Policy: default-src 'none'; frame-ancestors 'none'\r\nConnection: close\r\n\r\n{body}", body.len());
        let _ = tokio::time::timeout(
            Duration::from_secs(2),
            stream.write_all(response.as_bytes()),
        )
        .await;
        if let Some(result) = outcome {
            return Ok(Authorization {
                code: result?,
                verifier,
                redirect,
            });
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn pkce_matches_rfc7636() {
        assert_eq!(
            challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
            "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
        );
        let url = Url::parse(&authorize_url("http://localhost:1234", "state", "verifier")).unwrap();
        let params: HashMap<_, _> = url.query_pairs().collect();
        assert_eq!(params["client_id"], CLIENT_ID);
        assert_eq!(params["code_challenge_method"], "S256");
        assert!(!params.contains_key("client_secret"));
        assert_ne!(random_secret().unwrap(), random_secret().unwrap());
    }
    #[test]
    fn callbacks_require_state_host_and_unambiguous_parameters() {
        let request = "GET /?state=expected&code=secret HTTP/1.1\r\nHost: localhost:1234\r\n\r\n";
        assert_eq!(
            callback(request, 1234, "expected").unwrap().unwrap(),
            "secret"
        );
        for changed in [
            request.replace("expected", "wrong"),
            request.replace("localhost:1234", "evil.test"),
            request.replace("GET", "POST"),
            request.replace("&code=secret", "&code=secret&code=second"),
            request.replace("\r\n\r\n", "\r\nOrigin: https://evil.test\r\n\r\n"),
        ] {
            assert!(callback(&changed, 1234, "expected").is_none());
        }
        let denied = request.replace(
            "code=secret",
            "error=access_denied&error_description=private",
        );
        let error = callback(&denied, 1234, "expected").unwrap().unwrap_err();
        assert_eq!(error.code, "cancelled");
        assert!(!error.message.contains("private"));
    }
}

#[cfg(test)]
mod loopback_tests {
    use super::*;
    #[tokio::test]
    async fn real_callback_listener_uses_random_state_and_returns_no_credentials_to_browser() {
        let (sender, receiver) = tokio::sync::oneshot::channel();
        let sender = std::sync::Mutex::new(Some(sender));
        let open: OpenBrowser = std::sync::Arc::new(move |url| {
            sender
                .lock()
                .unwrap()
                .take()
                .unwrap()
                .send(url.to_owned())
                .unwrap();
            Ok(())
        });
        let task = tokio::spawn(authorize(open));
        let url = Url::parse(&receiver.await.unwrap()).unwrap();
        let params: HashMap<_, _> = url.query_pairs().collect();
        let redirect = Url::parse(&params["redirect_uri"]).unwrap();
        let port = redirect.port().unwrap();
        let mut stream = tokio::net::TcpStream::connect(("127.0.0.1", port))
            .await
            .unwrap();
        let request = format!(
            "GET /?state={}&code=private-code HTTP/1.1\r\nHost: localhost:{port}\r\n\r\n",
            params["state"]
        );
        stream.write_all(request.as_bytes()).await.unwrap();
        let mut body = String::new();
        stream.read_to_string(&mut body).await.unwrap();
        assert!(body.contains("200 OK") && body.contains("Cache-Control: no-store"));
        assert!(!body.contains("private-code") && !body.contains(params["state"].as_ref()));
        let result = task.await.unwrap().unwrap();
        assert_eq!(result.code, "private-code");
        assert_eq!(challenge(&result.verifier), params["code_challenge"]);
        assert!(tokio::net::TcpStream::connect(("127.0.0.1", port))
            .await
            .is_err());
    }
}
