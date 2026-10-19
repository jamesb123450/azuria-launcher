use crate::Store;
use serde::{Deserialize, Serialize};
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Privacy {
    pub restore_account: bool,
    pub hide_account: bool,
}
impl Default for Privacy {
    fn default() -> Self {
        Self {
            restore_account: true,
            hide_account: false,
        }
    }
}
impl Store {
    pub fn privacy(&self) -> Result<Privacy, String> {
        use rusqlite::OptionalExtension;
        let raw: Option<String> = self
            .conn
            .query_row("SELECT value FROM settings WHERE key='privacy'", [], |r| {
                r.get(0)
            })
            .optional()
            .map_err(|e| e.to_string())?;
        raw.map(|s| {
            serde_json::from_str(&s).map_err(|_| "Privacy preferences could not be read.".into())
        })
        .unwrap_or_else(|| Ok(Privacy::default()))
    }
    pub fn save_privacy(&mut self, options: Privacy) -> Result<(), String> {
        let raw = serde_json::to_string(&options).map_err(|e| e.to_string())?;
        self.conn.execute("INSERT INTO settings (key,value) VALUES ('privacy',?1) ON CONFLICT(key) DO UPDATE SET value=excluded.value", [raw]).map_err(|e| e.to_string())?;
        Ok(())
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn private_preferences_persist_separately() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().to_path_buf();
        let mut store = Store::open(path.clone()).unwrap();
        assert_eq!(store.privacy().unwrap(), Privacy::default());
        let value = Privacy {
            restore_account: false,
            hide_account: true,
        };
        store.save_privacy(value.clone()).unwrap();
        drop(store);
        assert_eq!(Store::open(path.clone()).unwrap().privacy().unwrap(), value);
    }
}
