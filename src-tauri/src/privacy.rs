use crate::{with_store, AppState};
use azuria_core::privacy::Privacy;
use tauri::State;
#[tauri::command]
pub fn get_privacy(state: State<'_, AppState>) -> Result<Privacy, String> {
    with_store(&state, |s| s.privacy())
}
#[tauri::command]
pub fn save_privacy(state: State<'_, AppState>, options: Privacy) -> Result<(), String> {
    with_store(&state, |s| s.save_privacy(options))
}
#[tauri::command]
pub fn physical_memory_limit() -> Result<u32, String> {
    azuria_core::memory::limit()
}
