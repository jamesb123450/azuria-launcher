use azuria_core::discord_presence::{application_id, Sessions};
use std::sync::{Arc, Condvar, Mutex};
struct Inner {
    sessions: Mutex<Sessions>,
    wake: Condvar,
}
pub struct Discord {
    inner: Arc<Inner>,
    configured: bool,
}
impl Default for Discord {
    fn default() -> Self {
        let id = option_env!("AZURIA_DISCORD_APPLICATION_ID").and_then(application_id);
        let inner = Arc::new(Inner {
            sessions: Mutex::new(Sessions::default()),
            wake: Condvar::new(),
        });
        #[cfg(windows)]
        if let Some(id) = id {
            let state = inner.clone();
            let id = id.to_string();
            let _ = std::thread::Builder::new()
                .name("azuria-discord".into())
                .spawn(move || worker(state, &id));
        }
        Self {
            inner,
            configured: cfg!(windows) && id.is_some(),
        }
    }
}
impl Discord {
    pub fn configured(&self) -> bool {
        self.configured
    }
    pub fn enabled(&self, value: bool) {
        if let Ok(mut sessions) = self.inner.sessions.lock() {
            sessions.enabled(value);
        }
        self.inner.wake.notify_one();
    }
    pub fn started(&self, id: &str) {
        let time = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        if let Ok(mut sessions) = self.inner.sessions.lock() {
            sessions.started(id, time);
        }
        self.inner.wake.notify_one();
    }
    pub fn stopped(&self, id: &str) -> bool {
        let idle = self
            .inner
            .sessions
            .lock()
            .map(|mut sessions| sessions.stopped(id))
            .unwrap_or(false);
        self.inner.wake.notify_one();
        idle
    }
}
#[cfg(windows)]
mod ipc {
    use azuria_core::discord_presence::{frame, Decoder};
    use serde_json::{json, Value};
    use std::{
        fs::{File, OpenOptions},
        io::{Read, Write},
        os::windows::io::AsRawHandle,
        time::{Duration, Instant},
    };
    pub struct Connection {
        file: File,
        decoder: Decoder,
        pub ready: bool,
        opened: Instant,
    }
    impl Connection {
        pub fn connect(id: &str) -> Option<Self> {
            #[link(name = "kernel32")]
            extern "system" {
                fn SetNamedPipeHandleState(
                    handle: *mut std::ffi::c_void,
                    mode: *const u32,
                    maximum: *const u32,
                    timeout: *const u32,
                ) -> i32;
            }
            for index in 0..10 {
                let Ok(file) = OpenOptions::new()
                    .read(true)
                    .write(true)
                    .open(format!(r"\\.\pipe\discord-ipc-{index}"))
                else {
                    continue;
                };
                let mode = 1u32; // PIPE_NOWAIT: a stalled Discord client never blocks this worker.
                                 // SAFETY: live pipe handle; mode is readable and unused optional pointers are null.
                if unsafe {
                    SetNamedPipeHandleState(
                        file.as_raw_handle(),
                        &mode,
                        std::ptr::null(),
                        std::ptr::null(),
                    )
                } == 0
                {
                    continue;
                }
                let mut value = Self {
                    file,
                    decoder: Decoder::default(),
                    ready: false,
                    opened: Instant::now(),
                };
                if value.send(0, &json!({"v":1,"client_id":id})).is_ok() {
                    return Some(value);
                }
            }
            None
        }
        pub fn send(&mut self, opcode: u32, value: &Value) -> Result<(), ()> {
            let bytes = frame(opcode, value).map_err(|_| ())?;
            // Discord expects the header and payload in one write, not separate writes.
            match self.file.write(&bytes) {
                Ok(written) if written == bytes.len() => Ok(()),
                _ => Err(()),
            }
        }
        pub fn poll(&mut self) -> Result<(), ()> {
            if !self.ready && self.opened.elapsed() > Duration::from_secs(5) {
                return Err(());
            }
            let mut buffer = [0u8; 8192];
            for _ in 0..8 {
                match self.file.read(&mut buffer) {
                    Ok(0) => return Err(()),
                    Ok(count) => {
                        for (opcode, value) in
                            self.decoder.push(&buffer[..count]).map_err(|_| ())?
                        {
                            match opcode {
                                1 if value["evt"] == "READY" => self.ready = true,
                                1 if value["evt"] == "ERROR" => return Err(()),
                                2 => return Err(()),
                                3 => self.send(4, &value)?,
                                _ => {}
                            }
                        }
                    }
                    Err(error)
                        if error.kind() == std::io::ErrorKind::WouldBlock
                            || error.raw_os_error() == Some(232) =>
                    {
                        break
                    }
                    Err(_) => return Err(()),
                }
            }
            Ok(())
        }
    }
}
#[cfg(windows)]
fn worker(inner: Arc<Inner>, id: &str) {
    use azuria_core::discord_presence::activity;
    use std::time::{Duration, Instant};
    let mut connection: Option<ipc::Connection> = None;
    let mut sent = None;
    let mut nonce = 0;
    let mut retry = Instant::now();
    loop {
        let desired = match inner.sessions.lock() {
            Ok(sessions) => sessions.desired(),
            Err(_) => return,
        };
        if desired.is_none() {
            if let Some(mut pipe) = connection.take() {
                nonce += 1;
                let _ = pipe.send(1, &activity(std::process::id(), None, nonce));
            }
            sent = None;
        } else {
            if connection.is_none() && Instant::now() >= retry {
                connection = ipc::Connection::connect(id);
                sent = None;
                retry = Instant::now() + Duration::from_secs(5);
            }
            if let Some(pipe) = connection.as_mut() {
                let result = pipe.poll().and_then(|()| {
                    if pipe.ready && sent != desired {
                        nonce += 1;
                        pipe.send(1, &activity(std::process::id(), desired, nonce))?;
                        sent = desired;
                    }
                    Ok(())
                });
                if result.is_err() {
                    connection = None;
                    sent = None;
                    retry = Instant::now() + Duration::from_secs(5);
                }
            }
        }
        let Ok(state) = inner.sessions.lock() else {
            return;
        };
        // Recheck on notifications as well as periodically for Discord restarts/pings.
        if inner
            .wake
            .wait_timeout(state, Duration::from_millis(500))
            .is_err()
        {
            return;
        }
    }
}
