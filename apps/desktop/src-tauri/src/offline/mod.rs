mod postgres;
mod secrets;
mod server;

use std::sync::Mutex;
use tauri::{AppHandle, Manager};
use tauri_plugin_shell::ShellExt;

use secrets::OfflineSecrets;

/// Fixed local port for the bundled Next.js server. Must match the
/// NEXT_PUBLIC_APP_URL baked into the offline-edition web build at build
/// time (see scripts/fetch-offline-resources.mjs / the offline build docs) —
/// NEXT_PUBLIC_* values are inlined into the client JS bundle at `next
/// build`, not read at runtime, so this can't be renegotiated dynamically.
pub const NEXT_PORT: u16 = 47831;

/// Holds the two long-running child processes so they can be killed when the
/// app actually quits (wired from the tray "Quit" handler in lib.rs — the
/// app's one deliberate quit path; see ADR-014 for the accepted gap around a
/// hard OS-level kill leaving orphaned children).
#[derive(Default)]
pub struct OfflineProcesses {
    postgres: Mutex<Option<std::process::Child>>,
    next: Mutex<Option<tauri_plugin_shell::process::CommandChild>>,
}

pub fn kill_all(app: &AppHandle) {
    if let Some(state) = app.try_state::<OfflineProcesses>() {
        if let Ok(mut guard) = state.next.lock() {
            if let Some(child) = guard.take() {
                let _ = child.kill();
            }
        }
        if let Ok(mut guard) = state.postgres.lock() {
            if let Some(mut child) = guard.take() {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    }
}

/// Bootstraps local Postgres (first run: initdb + roles + pg_trgm + dbmate
/// migrations; every run: start + health-wait) and the Next.js standalone
/// server, then opens the main window once /api/health responds.
///
/// Blocking — call from a background thread (see lib.rs), never from
/// Tauri's setup() callback directly: this shells out repeatedly and polls
/// with real sleeps, which would freeze the whole app if run on the main/
/// setup thread.
///
/// TODO(Phase 3 — ADR-014 licensing): verify the signed offline license file
/// as the very first step here, before touching Postgres at all, and bail
/// out with a clear message if it's missing/invalid. Not implemented yet —
/// Phase 1 is desktop bootstrap only, licensing is its own phase.
pub fn bootstrap_and_launch(app: &AppHandle) -> Result<(), String> {
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|e| format!("failed to resolve resource dir: {e}"))?;
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("failed to resolve app data dir: {e}"))?;
    std::fs::create_dir_all(&data_dir).map_err(|e| format!("failed to create app data dir: {e}"))?;

    let pg_resource_dir = resource_dir.join("postgres");
    let pg_data_dir = data_dir.join("pgdata");
    let migrations_dir = resource_dir.join("migrations");
    let secrets_path = data_dir.join("offline-secrets.json");

    let secrets = OfflineSecrets::load_or_create(&secrets_path)?;

    let fresh_init = postgres::ensure_initdb(&pg_resource_dir, &pg_data_dir)?;
    let pg_child = postgres::spawn_postgres(&pg_resource_dir, &pg_data_dir, postgres::PG_PORT)?;
    if let Some(state) = app.try_state::<OfflineProcesses>() {
        *state.postgres.lock().map_err(|_| "poisoned postgres lock")? = Some(pg_child);
    }
    postgres::wait_ready(&pg_resource_dir, postgres::PG_PORT)?;

    if fresh_init {
        postgres::bootstrap_roles_and_extensions(&pg_resource_dir, postgres::PG_PORT, &secrets)?;
        run_dbmate(app, &migrations_dir, postgres::PG_PORT, &secrets)?;
    }

    let next_child = server::spawn_next(app, &resource_dir, &data_dir, NEXT_PORT, postgres::PG_PORT, &secrets)?;
    if let Some(state) = app.try_state::<OfflineProcesses>() {
        *state.next.lock().map_err(|_| "poisoned next lock")? = Some(next_child);
    }
    server::wait_health(NEXT_PORT)?;

    let url_str = format!("http://127.0.0.1:{NEXT_PORT}");
    let url = url::Url::parse(&url_str).map_err(|e| e.to_string())?;
    let window = tauri::WebviewWindowBuilder::new(app, "main", tauri::WebviewUrl::External(url))
        .title("PharmaTrack")
        .inner_size(1280.0, 800.0)
        .min_inner_size(1024.0, 700.0)
        .build()
        .map_err(|e| format!("failed to open main window: {e}"))?;

    // Same "close hides to tray, pharmacies keep this running for the whole
    // shift" behaviour lib.rs wires for the SaaS build's statically-declared
    // window — this build creates its window itself (see module doc above),
    // so it wires the same behaviour here instead.
    let window_clone = window.clone();
    window.on_window_event(move |event| {
        if let tauri::WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            let _ = window_clone.hide();
        }
    });

    Ok(())
}

/// Applies infra/migrations/*.sql (bundled as a resource — see
/// scripts/fetch-offline-resources.mjs) via the bundled `dbmate` sidecar,
/// identically to how CI applies them to the hosted SaaS's Postgres.
fn run_dbmate(
    app: &AppHandle,
    migrations_dir: &std::path::Path,
    pg_port: u16,
    secrets: &OfflineSecrets,
) -> Result<(), String> {
    let database_url = format!(
        "postgres://app_owner:{}@127.0.0.1:{}/pharmatrack?sslmode=disable",
        secrets.app_owner_password, pg_port
    );
    let command = app
        .shell()
        .sidecar("dbmate")
        .map_err(|e| format!("dbmate sidecar unavailable: {e}"))?
        .env("DATABASE_URL", database_url)
        .args([
            "--migrations-dir",
            &migrations_dir.to_string_lossy(),
            "--no-dump-schema",
            "up",
        ]);
    let output = tauri::async_runtime::block_on(async move { command.output().await })
        .map_err(|e| format!("failed to run dbmate: {e}"))?;
    if !output.status.success() {
        return Err(format!(
            "dbmate migrations failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }
    Ok(())
}
