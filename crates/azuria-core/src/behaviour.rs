use crate::{error, Store};
use serde::{Deserialize, Serialize};
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Behaviour {
    pub minimise_on_start: bool,
    pub refocus_on_exit: bool,
    pub hide_right_sidebar: bool,
    pub compact_library: bool,
    pub discord_presence: bool,
}
impl Default for Behaviour {
    fn default() -> Self {
        Self {
            minimise_on_start: false,
            refocus_on_exit: false,
            hide_right_sidebar: false,
            compact_library: false,
            discord_presence: true,
        }
    }
}
impl Store {
    pub fn behaviour(&self) -> Result<Behaviour, String> {
        use rusqlite::OptionalExtension;
        let raw: Option<String> = self
            .conn
            .query_row(
                "SELECT value FROM settings WHERE key='behaviour'",
                [],
                |row| row.get(0),
            )
            .optional()
            .map_err(error)?;
        raw.map(|value| serde_json::from_str(&value).map_err(error))
            .transpose()
            .map(|value| value.unwrap_or_default())
    }
    pub fn save_behaviour(&self, options: Behaviour) -> Result<(), String> {
        self.conn.execute("INSERT INTO settings(key,value) VALUES('behaviour',?1) ON CONFLICT(key) DO UPDATE SET value=excluded.value",[serde_json::to_string(&options).map_err(error)?]).map_err(error)?;
        Ok(())
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn upgrades_keep_existing_settings_and_behaviour_survives_reopen() {
        let root = tempfile::tempdir().unwrap();
        let mut store = Store::open(root.path().into()).unwrap();
        assert_eq!(store.behaviour().unwrap(), Behaviour::default());
        let options = Behaviour {
            minimise_on_start: true,
            compact_library: true,
            ..Behaviour::default()
        };
        store.save_behaviour(options.clone()).unwrap();
        store
            .save_settings(crate::Settings {
                theme: crate::Theme::Dark,
            })
            .unwrap();
        drop(store);
        let store = Store::open(root.path().into()).unwrap();
        assert_eq!(store.behaviour().unwrap(), options);
        assert!(matches!(
            store.settings().unwrap().theme,
            crate::Theme::Dark
        ));
    }
    #[test]
    fn missing_fields_use_defaults_but_invalid_types_are_rejected() {
        let value: Behaviour = serde_json::from_str(r#"{"hideRightSidebar":true}"#).unwrap();
        assert!(value.hide_right_sidebar && value.discord_presence);
        assert!(!value.minimise_on_start);
        assert!(serde_json::from_str::<Behaviour>(r#"{"compactLibrary":"true"}"#).is_err());
    }
}
