use super::*;
use std::collections::BTreeMap;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WindowOptions {
    pub fullscreen: bool,
    pub width: u32,
    pub height: u32,
}
impl Default for WindowOptions {
    fn default() -> Self {
        Self {
            fullscreen: false,
            width: 1280,
            height: 720,
        }
    }
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct LaunchOptions {
    pub memory_mb: u32,
    pub java_path: Option<String>,
    pub java_arguments: Vec<String>,
    pub environment: BTreeMap<String, String>,
    pub window: WindowOptions,
}
impl Default for LaunchOptions {
    fn default() -> Self {
        Self {
            memory_mb: 4096,
            java_path: None,
            java_arguments: vec![],
            environment: BTreeMap::new(),
            window: WindowOptions::default(),
        }
    }
}
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct LaunchOverrides {
    pub memory_mb: Option<u32>,
    pub java_path: Option<String>,
    pub java_arguments: Option<Vec<String>>,
    pub environment: Option<BTreeMap<String, String>>,
    pub window: Option<WindowOptions>,
}
impl LaunchOverrides {
    pub fn effective(&self, defaults: &LaunchOptions) -> LaunchOptions {
        LaunchOptions {
            memory_mb: self.memory_mb.unwrap_or(defaults.memory_mb),
            java_path: self
                .java_path
                .clone()
                .or_else(|| defaults.java_path.clone()),
            java_arguments: self
                .java_arguments
                .clone()
                .unwrap_or_else(|| defaults.java_arguments.clone()),
            environment: self
                .environment
                .clone()
                .unwrap_or_else(|| defaults.environment.clone()),
            window: self
                .window
                .clone()
                .unwrap_or_else(|| defaults.window.clone()),
        }
    }
}
impl LaunchOptions {
    pub fn validate(&self) -> Result<(), String> {
        if !(512..=65536).contains(&self.memory_mb) || !self.memory_mb.is_multiple_of(256) {
            return Err("Memory must be 512–65536 MB in increments of 256 MB.".into());
        }
        if let Some(path) = &self.java_path {
            if path.trim().is_empty() || path.len() > 4096 || path.chars().any(char::is_control) {
                return Err(
                    "Choose a valid Java executable path, or use automatic selection.".into(),
                );
            }
        }
        if self.java_arguments.len() > 128
            || self
                .java_arguments
                .iter()
                .any(|arg| arg.len() > 4096 || arg.chars().any(char::is_control))
            || self.java_arguments.iter().map(String::len).sum::<usize>() > 16384
        {
            return Err("Java arguments are too long or contain invalid characters.".into());
        }
        if self.environment.len() > 64
            || self.environment.iter().any(|(key, value)| {
                key.is_empty()
                    || key.len() > 128
                    || !key.bytes().enumerate().all(|(i, c)| {
                        c == b'_' || c.is_ascii_alphabetic() || (i > 0 && c.is_ascii_digit())
                    })
                    || value.len() > 8192
                    || value.chars().any(char::is_control)
            })
        {
            return Err(
                "Use valid environment variable names and single-line values (up to 64 variables)."
                    .into(),
            );
        }
        if !(320..=16384).contains(&self.window.width)
            || !(240..=8640).contains(&self.window.height)
        {
            return Err(
                "Resolution must be 320–16384 pixels wide and 240–8640 pixels high.".into(),
            );
        }
        Ok(())
    }
}
impl Store {
    pub fn launch_defaults(&self) -> Result<LaunchOptions, String> {
        use rusqlite::OptionalExtension;
        let raw: Option<String> = self
            .conn
            .query_row(
                "SELECT value FROM settings WHERE key='launch_defaults'",
                [],
                |r| r.get(0),
            )
            .optional()
            .map_err(error)?;
        let options = raw
            .map(|v| serde_json::from_str(&v).map_err(error))
            .transpose()?
            .unwrap_or_default();
        Ok(options)
    }
    pub fn save_launch_defaults(&self, options: LaunchOptions) -> Result<(), String> {
        options.validate()?;
        self.conn.execute("INSERT INTO settings (key,value) VALUES ('launch_defaults',?1) ON CONFLICT(key) DO UPDATE SET value=excluded.value",[serde_json::to_string(&options).map_err(error)?]).map_err(error)?;
        Ok(())
    }
    pub fn launch_overrides(&self, id: &str) -> Result<LaunchOverrides, String> {
        use rusqlite::OptionalExtension;
        let item = self.get(id)?;
        let raw: Option<String> = self
            .conn
            .query_row(
                "SELECT options FROM instance_preferences WHERE id=?1",
                [id],
                |r| r.get(0),
            )
            .optional()
            .map_err(error)?;
        // Preserve explicitly configured memory from existing instances on upgrade.
        raw.map(|v| serde_json::from_str(&v).map_err(error))
            .unwrap_or_else(|| {
                Ok(LaunchOverrides {
                    memory_mb: Some(item.memory_mb),
                    ..LaunchOverrides::default()
                })
            })
    }
    pub fn save_launch_overrides(&self, id: &str, options: LaunchOverrides) -> Result<(), String> {
        self.get(id)?;
        options.effective(&self.launch_defaults()?).validate()?;
        self.conn.execute("INSERT INTO instance_preferences (id,options) VALUES (?1,?2) ON CONFLICT(id) DO UPDATE SET options=excluded.options",params![id,serde_json::to_string(&options).map_err(error)?]).map_err(error)?;
        Ok(())
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn inheritance_persists_and_appearance_does_not_reset_defaults() {
        let d = tempfile::tempdir().unwrap();
        let mut s = Store::open(d.path().into()).unwrap();
        let item = s
            .create(InstanceInput {
                name: "Test".into(),
                minecraft_version: "1.21.1".into(),
                loader: Loader::Vanilla,
                memory_mb: 8192,
                icon: None,
                loader_version: None,
            })
            .unwrap();
        // Newly created instances inherit; existing un-migrated preferences preserve memory.
        assert_eq!(s.launch_overrides(&item.id).unwrap().memory_mb, None);
        s.save_launch_overrides(
            &item.id,
            LaunchOverrides {
                memory_mb: Some(8192),
                ..Default::default()
            },
        )
        .unwrap();
        s.save_launch_defaults(LaunchOptions {
            memory_mb: 6144,
            ..Default::default()
        })
        .unwrap();
        s.save_settings(Settings {
            theme: Theme::Light,
        })
        .unwrap();
        drop(s);
        let s = Store::open(d.path().into()).unwrap();
        let defaults = s.launch_defaults().unwrap();
        assert_eq!(defaults.memory_mb, 6144);
        assert_eq!(
            s.launch_overrides(&item.id)
                .unwrap()
                .effective(&defaults)
                .memory_mb,
            8192
        );
        s.save_launch_overrides(&item.id, LaunchOverrides::default())
            .unwrap();
        assert_eq!(
            s.launch_overrides(&item.id)
                .unwrap()
                .effective(&defaults)
                .memory_mb,
            6144
        );
    }
    #[test]
    fn schema_four_migration_preserves_existing_memory_preferences() {
        let d = tempfile::tempdir().unwrap();
        let mut s = Store::open(d.path().into()).unwrap();
        let item = s
            .create(InstanceInput {
                name: "Existing".into(),
                minecraft_version: "1.21.1".into(),
                loader: Loader::Vanilla,
                memory_mb: 8192,
                icon: None,
                loader_version: None,
            })
            .unwrap();
        s.conn
            .execute_batch("DROP TABLE instance_preferences; PRAGMA user_version=4;")
            .unwrap();
        drop(s);
        let s = Store::open(d.path().into()).unwrap();
        assert_eq!(s.launch_overrides(&item.id).unwrap().memory_mb, Some(8192));
        assert_eq!(
            s.conn
                .query_row("PRAGMA user_version", [], |r| r.get::<_, i64>(0))
                .unwrap(),
            5
        );
    }
    #[test]
    fn rejects_bad_options_without_overwriting_saved_defaults() {
        let d = tempfile::tempdir().unwrap();
        let s = Store::open(d.path().into()).unwrap();
        let opts = LaunchOptions {
            memory_mb: 513,
            ..Default::default()
        };
        assert!(s.save_launch_defaults(opts).is_err());
        let mut opts = LaunchOptions::default();
        opts.environment.insert("BAD=NAME".into(), "x".into());
        assert!(opts.validate().is_err());
        let mut opts = LaunchOptions::default();
        opts.window.width = 0;
        assert!(opts.validate().is_err());
        assert_eq!(s.launch_defaults().unwrap().memory_mb, 4096);
    }
}
