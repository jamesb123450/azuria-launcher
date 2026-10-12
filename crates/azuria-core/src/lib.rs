use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::PathBuf,
    time::{SystemTime, UNIX_EPOCH},
};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Loader {
    Vanilla,
    Fabric,
}
impl Loader {
    fn value(&self) -> &'static str {
        match self {
            Self::Vanilla => "vanilla",
            Self::Fabric => "fabric",
        }
    }
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstanceInput {
    pub name: String,
    pub minecraft_version: String,
    pub loader: Loader,
    pub memory_mb: u32,
}
impl InstanceInput {
    pub fn validate(&self) -> Result<(), String> {
        let name = self.name.trim();
        if name.is_empty() || name.chars().count() > 80 || name.chars().any(char::is_control) {
            return Err(
                "Use a name between 1 and 80 characters without control characters.".into(),
            );
        }
        let v = &self.minecraft_version;
        if v.is_empty()
            || v.len() > 40
            || !v.as_bytes()[0].is_ascii_alphanumeric()
            || !v
                .bytes()
                .all(|c| c.is_ascii_alphanumeric() || b"._-".contains(&c))
        {
            return Err("Enter a valid Minecraft version identifier.".into());
        }
        if !(512..=65536).contains(&self.memory_mb) || self.memory_mb & 255 != 0 {
            return Err("Memory must be 512–65536 MB in increments of 256 MB.".into());
        }
        Ok(())
    }
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Instance {
    pub id: String,
    pub name: String,
    pub minecraft_version: String,
    pub loader: Loader,
    pub memory_mb: u32,
    pub favorite: bool,
    pub created_at: i64,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Theme {
    System,
    Dark,
    Light,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    pub theme: Theme,
}

pub struct Store {
    conn: Connection,
    root: PathBuf,
}
fn error(e: impl std::fmt::Display) -> String {
    e.to_string()
}
fn valid_id(id: &str) -> Result<(), String> {
    let parsed = Uuid::parse_str(id).map_err(|_| "Invalid instance ID.".to_string())?;
    if parsed.to_string() != id {
        return Err("Invalid instance ID.".into());
    }
    Ok(())
}
fn row_instance(row: &rusqlite::Row<'_>) -> rusqlite::Result<Instance> {
    let loader: String = row.get(3)?;
    let loader = match loader.as_str() {
        "vanilla" => Loader::Vanilla,
        "fabric" => Loader::Fabric,
        _ => return Err(rusqlite::Error::InvalidQuery),
    };
    Ok(Instance {
        id: row.get(0)?,
        name: row.get(1)?,
        minecraft_version: row.get(2)?,
        loader,
        memory_mb: row.get(4)?,
        favorite: row.get(5)?,
        created_at: row.get(6)?,
    })
}
impl Store {
    pub fn open(root: PathBuf) -> Result<Self, String> {
        fs::create_dir_all(root.join("instances")).map_err(error)?;
        fs::create_dir_all(root.join("trash")).map_err(error)?;
        let conn = Connection::open(root.join("azuria.sqlite3")).map_err(error)?;
        conn.busy_timeout(std::time::Duration::from_secs(5))
            .map_err(error)?;
        conn.execute_batch("PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;")
            .map_err(error)?;
        let version: i64 = conn
            .query_row("PRAGMA user_version", [], |r| r.get(0))
            .map_err(error)?;
        if version > 1 {
            return Err(
                "This database was created by a newer Azuria version. Upgrade the launcher.".into(),
            );
        }
        if version == 0 {
            conn.execute_batch("BEGIN IMMEDIATE;
              CREATE TABLE instances (id TEXT PRIMARY KEY, name TEXT NOT NULL, minecraft_version TEXT NOT NULL, loader TEXT NOT NULL CHECK(loader IN ('vanilla','fabric')), memory_mb INTEGER NOT NULL CHECK(memory_mb BETWEEN 512 AND 65536 AND memory_mb % 256 = 0), favorite INTEGER NOT NULL DEFAULT 0 CHECK(favorite IN (0,1)), created_at INTEGER NOT NULL);
              CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
              INSERT INTO settings VALUES ('theme','system');
              PRAGMA user_version=1; COMMIT;").map_err(error)?;
        }
        Ok(Self { conn, root })
    }
    pub fn list(&self) -> Result<Vec<Instance>, String> {
        let mut stmt = self.conn.prepare("SELECT id,name,minecraft_version,loader,memory_mb,favorite,created_at FROM instances ORDER BY created_at DESC,id").map_err(error)?;
        let rows = stmt.query_map([], row_instance).map_err(error)?;
        rows.collect::<Result<Vec<_>, _>>().map_err(error)
    }
    fn get(&self, id: &str) -> Result<Instance, String> {
        valid_id(id)?;
        self.conn.query_row("SELECT id,name,minecraft_version,loader,memory_mb,favorite,created_at FROM instances WHERE id=?1", [id], row_instance).map_err(|_| "Instance no longer exists.".into())
    }
    pub fn create(&mut self, input: InstanceInput) -> Result<Instance, String> {
        input.validate()?;
        let id = Uuid::new_v4().to_string();
        let created_at = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(error)?
            .as_millis() as i64;
        let path = self.root.join("instances").join(&id);
        // IDs, never user-provided names, determine disk paths.
        fs::create_dir(&path).map_err(error)?;
        let result = self.conn.execute("INSERT INTO instances (id,name,minecraft_version,loader,memory_mb,created_at) VALUES (?1,?2,?3,?4,?5,?6)", params![id,input.name.trim(),input.minecraft_version,input.loader.value(),input.memory_mb,created_at]);
        if let Err(e) = result {
            let _ = fs::remove_dir(&path);
            return Err(error(e));
        }
        self.get(&id)
    }
    pub fn update(&mut self, id: &str, input: InstanceInput) -> Result<Instance, String> {
        input.validate()?;
        self.get(id)?;
        self.conn.execute("UPDATE instances SET name=?1,minecraft_version=?2,loader=?3,memory_mb=?4 WHERE id=?5", params![input.name.trim(),input.minecraft_version,input.loader.value(),input.memory_mb,id]).map_err(error)?;
        self.get(id)
    }
    pub fn favorite(&mut self, id: &str) -> Result<Instance, String> {
        self.get(id)?;
        self.conn
            .execute("UPDATE instances SET favorite=1-favorite WHERE id=?1", [id])
            .map_err(error)?;
        self.get(id)
    }
    pub fn delete(&mut self, id: &str) -> Result<(), String> {
        self.get(id)?;
        let source = self.root.join("instances").join(id);
        let target = self
            .root
            .join("trash")
            .join(format!("{}-{}", id, Uuid::new_v4()));
        let moved = source.exists();
        if moved {
            fs::rename(&source, &target).map_err(error)?;
        }
        if let Err(e) = self.conn.execute("DELETE FROM instances WHERE id=?1", [id]) {
            if moved {
                fs::rename(&target, &source).map_err(|restore| format!("Database error: {e}. Files retained at {} because restoration failed: {restore}", target.display()))?;
            }
            return Err(error(e));
        }
        Ok(())
    }
    pub fn settings(&self) -> Result<Settings, String> {
        let value: String = self
            .conn
            .query_row("SELECT value FROM settings WHERE key='theme'", [], |r| {
                r.get(0)
            })
            .map_err(error)?;
        let theme = match value.as_str() {
            "system" => Theme::System,
            "dark" => Theme::Dark,
            "light" => Theme::Light,
            _ => return Err("Invalid stored appearance setting.".into()),
        };
        Ok(Settings { theme })
    }
    pub fn save_settings(&mut self, settings: Settings) -> Result<(), String> {
        let theme = match settings.theme {
            Theme::System => "system",
            Theme::Dark => "dark",
            Theme::Light => "light",
        };
        self.conn
            .execute("UPDATE settings SET value=?1 WHERE key='theme'", [theme])
            .map_err(error)?;
        Ok(())
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    fn input() -> InstanceInput {
        InstanceInput {
            name: "My world".into(),
            minecraft_version: "1.21.1".into(),
            loader: Loader::Fabric,
            memory_mb: 4096,
        }
    }
    #[test]
    fn persistent_lifecycle_and_file_retention() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_path_buf();
        let mut store = Store::open(root.clone()).unwrap();
        let item = store.create(input()).unwrap();
        fs::write(
            root.join("instances").join(&item.id).join("save.txt"),
            "keep me",
        )
        .unwrap();
        store.favorite(&item.id).unwrap();
        drop(store);
        let mut store = Store::open(root.clone()).unwrap();
        assert!(store.list().unwrap()[0].favorite);
        let mut edited = input();
        edited.name = "Renamed".into();
        assert_eq!(store.update(&item.id, edited).unwrap().name, "Renamed");
        store.delete(&item.id).unwrap();
        assert!(store.list().unwrap().is_empty());
        let trash = fs::read_dir(root.join("trash"))
            .unwrap()
            .next()
            .unwrap()
            .unwrap()
            .path();
        assert_eq!(
            fs::read_to_string(trash.join("save.txt")).unwrap(),
            "keep me"
        );
    }
    #[test]
    fn rejects_invalid_input_and_path_traversal() {
        let dir = tempfile::tempdir().unwrap();
        let mut store = Store::open(dir.path().into()).unwrap();
        let mut item = input();
        item.minecraft_version = "../../escape".into();
        assert!(store.create(item).is_err());
        let mut item = input();
        item.memory_mb = 513;
        assert!(store.create(item).is_err());
        assert!(store.delete("../outside").is_err());
        assert!(store.list().unwrap().is_empty());
    }
    #[test]
    fn settings_survive_reopen_and_future_schema_is_rejected() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_path_buf();
        let mut store = Store::open(root.clone()).unwrap();
        store
            .save_settings(Settings {
                theme: Theme::Light,
            })
            .unwrap();
        drop(store);
        let store = Store::open(root.clone()).unwrap();
        assert!(matches!(store.settings().unwrap().theme, Theme::Light));
        store.conn.execute_batch("PRAGMA user_version=99").unwrap();
        drop(store);
        assert!(Store::open(root).is_err());
    }
}
