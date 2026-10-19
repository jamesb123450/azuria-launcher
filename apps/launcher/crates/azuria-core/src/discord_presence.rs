//! Minimal, bounded Discord IPC protocol; never includes account or instance data.
use serde_json::{json, Value};
use std::collections::BTreeMap;
pub const MAX_FRAME: usize = 64 * 1024;
pub fn application_id(value: &str) -> Option<&str> {
    ((17..=20).contains(&value.len())
        && value.bytes().all(|b| b.is_ascii_digit())
        && value.parse::<u64>().ok().is_some_and(|id| id > 0))
    .then_some(value)
}
pub struct Sessions {
    enabled: bool,
    games: BTreeMap<String, u64>,
}
impl Default for Sessions {
    fn default() -> Self {
        Self {
            enabled: true,
            games: BTreeMap::new(),
        }
    }
}
impl Sessions {
    pub fn enabled(&mut self, value: bool) {
        self.enabled = value;
    }
    pub fn started(&mut self, id: &str, time: u64) {
        self.games.entry(id.into()).or_insert(time);
    }
    pub fn stopped(&mut self, id: &str) -> bool {
        self.games.remove(id);
        self.games.is_empty()
    }
    pub fn desired(&self) -> Option<u64> {
        if self.enabled {
            self.games.values().min().copied()
        } else {
            None
        }
    }
}
pub fn activity(pid: u32, start: Option<u64>, nonce: u64) -> Value {
    json!({"cmd":"SET_ACTIVITY","args":{"pid":pid,"activity":start.map(|time|json!({"type":0,"details":"Playing Minecraft","timestamps":{"start":time}}))},"nonce":nonce.to_string()})
}
pub fn frame(opcode: u32, payload: &Value) -> Result<Vec<u8>, String> {
    let body = serde_json::to_vec(payload).map_err(|_| "Invalid Discord frame.")?;
    if body.len() > MAX_FRAME {
        return Err("Discord frame is too large.".into());
    }
    let mut bytes = Vec::with_capacity(8 + body.len());
    bytes.extend(opcode.to_le_bytes());
    bytes.extend((body.len() as u32).to_le_bytes());
    bytes.extend(body);
    Ok(bytes)
}
#[derive(Default)]
pub struct Decoder {
    buffer: Vec<u8>,
}
impl Decoder {
    pub fn push(&mut self, bytes: &[u8]) -> Result<Vec<(u32, Value)>, String> {
        if self.buffer.len() + bytes.len() > MAX_FRAME + 8 + 8192 {
            return Err("Discord buffer exceeded its limit.".into());
        }
        self.buffer.extend_from_slice(bytes);
        let mut frames = vec![];
        while self.buffer.len() >= 8 {
            let opcode = u32::from_le_bytes(
                self.buffer[..4]
                    .try_into()
                    .map_err(|_| "Invalid Discord header.")?,
            );
            let length = u32::from_le_bytes(
                self.buffer[4..8]
                    .try_into()
                    .map_err(|_| "Invalid Discord header.")?,
            ) as usize;
            if length > MAX_FRAME {
                return Err("Discord frame exceeded its limit.".into());
            }
            if self.buffer.len() < length + 8 {
                break;
            }
            let payload = serde_json::from_slice(&self.buffer[8..length + 8])
                .map_err(|_| "Invalid Discord payload.")?;
            self.buffer.drain(..length + 8);
            frames.push((opcode, payload));
        }
        Ok(frames)
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn activity_only_exists_while_games_are_running_and_enabled() {
        let mut sessions = Sessions::default();
        assert_eq!(sessions.desired(), None);
        sessions.started("first", 10);
        sessions.started("second", 20);
        assert_eq!(sessions.desired(), Some(10));
        sessions.enabled(false);
        assert_eq!(sessions.desired(), None);
        sessions.enabled(true);
        assert!(!sessions.stopped("first"));
        assert_eq!(sessions.desired(), Some(20));
        assert!(sessions.stopped("second"));
        assert_eq!(sessions.desired(), None);
    }
    #[test]
    fn fragmented_and_combined_frames_are_decoded_without_unbounded_allocations() {
        let first = frame(1, &json!({"evt":"READY"})).unwrap();
        let second = frame(3, &json!({"nonce":1})).unwrap();
        let mut decoder = Decoder::default();
        assert!(decoder.push(&first[..5]).unwrap().is_empty());
        let mut rest = first[5..].to_vec();
        rest.extend(second);
        assert_eq!(decoder.push(&rest).unwrap().len(), 2);
        let mut oversized = vec![];
        oversized.extend(1u32.to_le_bytes());
        oversized.extend(((MAX_FRAME + 1) as u32).to_le_bytes());
        assert!(decoder.push(&oversized).is_err());
    }
    #[test]
    fn presence_payload_is_generic_and_can_be_cleared() {
        let payload = activity(42, Some(100), 1);
        assert_eq!(payload["args"]["activity"]["details"], "Playing Minecraft");
        assert_eq!(payload["args"]["pid"], 42);
        assert!(activity(42, None, 2)["args"]["activity"].is_null());
        assert!(application_id("6979bfed-98b9-4801-8c21-f046c0ca82b3").is_none());
        assert!(application_id("123456789012345678").is_some());
    }
}
