//! Small native helpers for the hosted PharmaTrack page (ADR-012).
//!
//! `pt_notify` shows an OS notification — the till uses it for the "sync
//! before midnight" reminders, which matter most when the window is hidden in
//! the tray. Like the printing commands it is the only thing the page may call
//! (capabilities/printing.json grants `allow-pt-notify` to the PharmaTrack
//! origin); the notification plugin's own JS API is not exposed.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use tauri::webview::DownloadEvent;
use tauri::Manager;
use tauri_plugin_notification::NotificationExt;

/// Files the page downloads — CSV reports, stock-take count sheets, barcode
/// labels — go to the Downloads folder, with a notification saying so. macOS's
/// webview cancels every download unless the app handles it, so without this
/// those buttons did nothing on a Mac; Windows saved them already, and now
/// both behave the same. A file never overwrites another: "name (1).csv".
pub fn handle_download<R: tauri::Runtime>(webview: tauri::Webview<R>, event: DownloadEvent<'_>) -> bool {
    static PENDING: OnceLock<Mutex<HashMap<String, PathBuf>>> = OnceLock::new();
    let pending = PENDING.get_or_init(|| Mutex::new(HashMap::new()));
    match event {
        DownloadEvent::Requested { url, destination } => {
            if let Ok(dir) = webview.app_handle().path().download_dir() {
                let name = destination
                    .file_name()
                    .map(|n| n.to_string_lossy().into_owned())
                    .filter(|n| !n.is_empty())
                    .unwrap_or_else(|| "PharmaTrack download".to_string());
                *destination = unique_path(&dir, &name);
            }
            if let Ok(mut map) = pending.lock() {
                map.insert(url.to_string(), destination.clone());
            }
            true
        }
        DownloadEvent::Finished { url, path, success } => {
            let saved = pending.lock().ok().and_then(|mut map| map.remove(url.as_str()));
            let file = path.filter(|p| !p.as_os_str().is_empty()).or(saved);
            let name = file
                .as_deref()
                .and_then(|p| p.file_name())
                .map(|n| n.to_string_lossy().into_owned())
                .unwrap_or_else(|| "The file".to_string());
            let (title, body) = if success {
                ("Saved to Downloads", name)
            } else {
                ("Download didn't finish", format!("{name} couldn't be saved. Try again."))
            };
            let _ = webview.app_handle().notification().builder().title(title).body(body).show();
            true
        }
        _ => true,
    }
}

fn unique_path(dir: &Path, name: &str) -> PathBuf {
    let first = dir.join(name);
    if !first.exists() {
        return first;
    }
    let (stem, ext) = match name.rfind('.') {
        Some(i) if i > 0 => (&name[..i], &name[i..]),
        _ => (name, ""),
    };
    (1..1000)
        .map(|i| dir.join(format!("{stem} ({i}){ext}")))
        .find(|p| !p.exists())
        .unwrap_or(first)
}

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
