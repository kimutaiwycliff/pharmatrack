use std::io::{Read, Write};
use std::net::TcpStream;
use std::path::Path;
use std::time::Duration;

use tauri::AppHandle;
use tauri_plugin_shell::process::CommandChild;
use tauri_plugin_shell::ShellExt;

use super::secrets::OfflineSecrets;

/// Spawns `node server.js` (the same `output: "standalone"` build Docker
/// already produces for the hosted SaaS) against the local bundled Postgres,
/// with OFFLINE_MODE=true so lib/offline-mode.ts strips the HIBP/
/// billing-gate/MinIO paths (ADR-014, verified end-to-end against a real
/// local Postgres 16 while prototyping this). Everything this deliberately
/// does NOT set — RESEND_API_KEY, AT_API_KEY, MPESA_*, REDIS_URL/
/// UPSTASH_*, TURNSTILE_SECRET_KEY, GOOGLE_CLIENT_* — already degrades
/// gracefully to a no-op when absent (confirmed in Phase 0), so it's simply
/// never set here rather than re-gated per-integration.
pub fn spawn_next(
    app: &AppHandle,
    resource_dir: &Path,
    data_dir: &Path,
    next_port: u16,
    pg_port: u16,
    secrets: &OfflineSecrets,
) -> Result<CommandChild, String> {
    // The bundled `resources/web/` tree mirrors exactly what the Dockerfile
    // copies for the hosted SaaS: `.next/standalone` at the root (which,
    // because of the monorepo layout, nests the real entrypoint at
    // apps/web/server.js) plus `.next/static` and `public/` copied in
    // alongside it (see Dockerfile's runner stage / scripts/
    // fetch-offline-resources.mjs). CWD = the standalone root, matching the
    // Dockerfile's `WORKDIR /app` + `CMD ["node", "apps/web/server.js"]`.
    let web_root = resource_dir.join("web");
    let server_js = web_root.join("apps").join("web").join("server.js");
    let local_storage_dir = data_dir.join("product-images");
    std::fs::create_dir_all(&local_storage_dir)
        .map_err(|e| format!("failed to create local storage dir: {e}"))?;

    let base_url = format!("http://127.0.0.1:{next_port}");
    let owner_url = format!(
        "postgres://app_owner:{}@127.0.0.1:{}/pharmatrack?sslmode=disable",
        secrets.app_owner_password, pg_port
    );
    let auth_url = format!(
        "postgres://app_authenticated:{}@127.0.0.1:{}/pharmatrack?sslmode=disable",
        secrets.app_authenticated_password, pg_port
    );

    let (mut rx, child) = app
        .shell()
        .sidecar("node")
        .map_err(|e| format!("node sidecar unavailable: {e}"))?
        .args([server_js.to_string_lossy().to_string()])
        .current_dir(&web_root)
        .env("PORT", next_port.to_string())
        .env("HOSTNAME", "127.0.0.1")
        .env("OFFLINE_MODE", "true")
        .env("DATABASE_URL", owner_url)
        .env("DATABASE_AUTHENTICATED_URL", auth_url)
        .env("BETTER_AUTH_SECRET", secrets.better_auth_secret.clone())
        .env("BETTER_AUTH_URL", base_url.clone())
        .env("LOCAL_STORAGE_DIR", local_storage_dir.to_string_lossy().to_string())
        .spawn()
        .map_err(|e| format!("failed to start the app server: {e}"))?;

    // Drain stdout/stderr so the sidecar's pipe never fills and blocks it.
    // Surfaced via eprintln so it lands wherever the OS captures a GUI app's
    // stderr (Console.app on macOS, etc.) — a dedicated log file is future
    // polish, not required for Phase 1.
    tauri::async_runtime::spawn(async move {
        use tauri_plugin_shell::process::CommandEvent;
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line) => eprintln!("[app] {}", String::from_utf8_lossy(&line)),
                CommandEvent::Stderr(line) => eprintln!("[app:err] {}", String::from_utf8_lossy(&line)),
                CommandEvent::Error(err) => eprintln!("[app:spawn-error] {err}"),
                _ => {}
            }
        }
    });

    Ok(child)
}

/// Raw HTTP/1.1 GET over a plain TCP socket — deliberately not a real HTTP
/// client dependency. This only ever talks to our own just-spawned server on
/// 127.0.0.1, so a minimal, dependency-free status-line check is enough.
fn http_get_ok(port: u16, path: &str) -> bool {
    let Ok(mut stream) = TcpStream::connect(("127.0.0.1", port)) else {
        return false;
    };
    let _ = stream.set_read_timeout(Some(Duration::from_secs(2)));
    let req = format!("GET {path} HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n");
    if stream.write_all(req.as_bytes()).is_err() {
        return false;
    }
    let mut buf = [0u8; 32];
    let Ok(n) = stream.read(&mut buf) else {
        return false;
    };
    String::from_utf8_lossy(&buf[..n]).contains(" 200 ")
}

/// Polls the app server's own `/api/health` (the same endpoint the hosted
/// SaaS already exposes) until it responds or this times out.
pub fn wait_health(next_port: u16) -> Result<(), String> {
    let deadline = std::time::Instant::now() + Duration::from_secs(30);
    loop {
        if http_get_ok(next_port, "/api/health") {
            return Ok(());
        }
        if std::time::Instant::now() >= deadline {
            return Err("app server did not become healthy in time".into());
        }
        std::thread::sleep(Duration::from_millis(300));
    }
}
