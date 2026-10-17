// The complete native-generated authorization URL is passed as a single UTF-16
// URL to Windows. Explorer's command-line parser is not a browser URL handler.
#[cfg(any(windows, test))]
fn wide_url(url: &str) -> Result<Vec<u16>, ()> {
    if !(url.starts_with("https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize?")
        || url.starts_with("https://modrinth.com/")
        || url.starts_with("https://www.curseforge.com/"))
        || url.contains('\0')
    {
        return Err(());
    }
    Ok(url.encode_utf16().chain(std::iter::once(0)).collect())
}

#[cfg(windows)]
pub fn open_sign_in(url: &str) -> Result<(), &'static str> {
    use std::ptr::{null, null_mut};
    use windows_sys::Win32::{
        System::Com::{
            CoInitializeEx, CoUninitialize, COINIT_APARTMENTTHREADED, COINIT_DISABLE_OLE1DDE,
        },
        UI::{Shell::ShellExecuteW, WindowsAndMessaging::SW_SHOWNORMAL},
    };
    let error = "Windows could not open the sign-in page in your default browser.";
    let url = wide_url(url).map_err(|_| error)?;
    // A dedicated thread owns COM initialization. Do not change the apartment
    // of a Tauri/Tokio worker, which may already be initialized differently.
    std::thread::Builder::new()
        .name("azuria-browser".into())
        .spawn(move || {
            // SAFETY: This fresh thread owns the successful COM initialization;
            // all strings are NUL-terminated and live through ShellExecuteW. No
            // command line, working directory or caller-provided IPC URL is used.
            unsafe {
                let initialized = CoInitializeEx(
                    null(),
                    COINIT_APARTMENTTHREADED as u32 | COINIT_DISABLE_OLE1DDE as u32,
                );
                if initialized < 0 {
                    return Err(error);
                }
                let verb: Vec<u16> = "open".encode_utf16().chain(std::iter::once(0)).collect();
                let result = ShellExecuteW(
                    null_mut(),
                    verb.as_ptr(),
                    url.as_ptr(),
                    null(),
                    null(),
                    SW_SHOWNORMAL,
                ) as isize;
                CoUninitialize();
                if result > 32 {
                    Ok(())
                } else {
                    Err(error)
                }
            }
        })
        .map_err(|_| error)?
        .join()
        .map_err(|_| error)?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn authorization_url_is_preserved_as_one_nul_terminated_value() {
        let url = "https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize?client_id=test&redirect_uri=http%3A%2F%2Flocalhost%3A1234&scope=XboxLive.signin+offline_access&state=a,b&code_challenge=abc-_";
        let wide = wide_url(url).unwrap();
        assert_eq!(wide.last(), Some(&0));
        assert_eq!(String::from_utf16(&wide[..wide.len() - 1]).unwrap(), url);
        assert!(wide_url("https://evil.test").is_err());
        assert!(wide_url(&format!("{url}\0extra")).is_err());
    }
}
