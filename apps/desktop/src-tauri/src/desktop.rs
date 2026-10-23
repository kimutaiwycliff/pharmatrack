//! Small native helpers for the hosted PharmaTrack page (ADR-012).
//!
//! `pt_notify` shows an OS notification — the till uses it for the "sync
//! before midnight" reminders, which matter most when the window is hidden in
//! the tray. Like the printing commands it is the only thing the page may call
//! (capabilities/printing.json grants `allow-pt-notify` to the PharmaTrack
//! origin); the notification plugin's own JS API is not exposed.

use tauri_plugin_notification::NotificationExt;

#[tauri::command]
pub fn pt_notify(app: tauri::AppHandle, title: String, body: String) -> Result<(), String> {
    // Keep it to a sentence or two whatever the page sends.
    let title: String = title.chars().take(80).collect();
    let body: String = body.chars().take(240).collect();
    app.notification()
        .builder()
        .title(title)
        .body(body)
        .show()
        .map_err(|e| e.to_string())
}
