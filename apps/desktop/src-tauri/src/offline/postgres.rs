use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::time::Duration;

use super::secrets::OfflineSecrets;

/// Fixed local port for the bundled Postgres instance. Never exposed beyond
/// 127.0.0.1, so there's no real "someone else is using this port" risk to
/// design dynamic allocation around for a single-purpose appliance app.
pub const PG_PORT: u16 = 47632;

/// Resolves a binary inside the bundled `resources/postgres/bin/` tree (see
/// scripts/fetch-offline-resources.mjs, which vendors this tree before
/// `tauri build` — never committed to the repo). One `tauri build` only ever
/// targets a single platform+arch, and `fetch-offline-resources.mjs` is run
/// once per target right before it, so there's no need for a per-platform
/// subfolder here — the bundled tree is always for whichever single target
/// this specific build is for (this also means macOS ships as two separate
/// per-arch installers, not one universal binary — the vendored Postgres
/// binaries can't be lipo-merged the way Tauri merges its own Rust output).
fn bin(resource_pg_dir: &Path, name: &str) -> PathBuf {
    let exe = if cfg!(target_os = "windows") {
        format!("{name}.exe")
    } else {
        name.to_string()
    };
    resource_pg_dir.join("bin").join(exe)
}

/// Runs `initdb` into `data_dir` if it isn't already an initialized cluster.
/// Returns true on a fresh init, so the caller knows to run the one-time
/// roles/extensions/migrations bootstrap.
pub fn ensure_initdb(resource_pg_dir: &Path, data_dir: &Path) -> Result<bool, String> {
    if data_dir.join("PG_VERSION").exists() {
        return Ok(false);
    }
    std::fs::create_dir_all(data_dir).map_err(|e| format!("failed to create pgdata dir: {e}"))?;
    // --locale=C: bundled/portable Postgres builds don't reliably ship every
    // OS locale, and this appliance has no user-facing need for
    // locale-aware collation — avoids a class of "which locales exist in
    // this specific vendored build" failures across three platforms.
    let initdb_bin = bin(resource_pg_dir, "initdb");
    let output = Command::new(&initdb_bin)
        .args([
            "-D",
            &data_dir.to_string_lossy(),
            "-U",
            "postgres",
            "--locale=C",
            "-E",
            "UTF8",
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| format!("failed to run initdb at {}: {e}", initdb_bin.display()))?;
    if !output.status.success() {
        return Err(format!(
            "initdb failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }
    Ok(true)
}

/// Starts `postgres` directly (not via `pg_ctl`, so we hold the real child
/// PID and can kill it cleanly on app exit) bound to loopback-only TCP with
/// NO Unix socket — sidesteps the ~103-byte Unix-socket-path length limit
/// that an app-data directory path can easily exceed (hit exactly this
/// failure prototyping this sequence — see ADR-014) and needs no
/// platform-specific socket handling on Windows either.
pub fn spawn_postgres(resource_pg_dir: &Path, data_dir: &Path, port: u16) -> Result<Child, String> {
    Command::new(bin(resource_pg_dir, "postgres"))
        .args([
            "-D",
            &data_dir.to_string_lossy(),
            "-p",
            &port.to_string(),
            "-c",
            "listen_addresses=127.0.0.1",
            "-c",
            "unix_socket_directories=",
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("failed to start postgres: {e}"))
}

/// Polls with the bundled `pg_isready` (a real Postgres protocol check, more
/// correct than a raw TCP connect) until the server accepts connections or
/// this times out.
pub fn wait_ready(resource_pg_dir: &Path, port: u16) -> Result<(), String> {
    let deadline = std::time::Instant::now() + Duration::from_secs(20);
    loop {
        let ok = Command::new(bin(resource_pg_dir, "pg_isready"))
            .args(["-h", "127.0.0.1", "-p", &port.to_string()])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .map(|s| s.success())
            .unwrap_or(false);
        if ok {
            return Ok(());
        }
        if std::time::Instant::now() >= deadline {
            return Err("postgres did not become ready in time".into());
        }
        std::thread::sleep(Duration::from_millis(200));
    }
}

/// Roles + pg_trgm bootstrap — the exact same statements as
/// infra/db/init/00-roles.sh and the CI RLS job (verified by running this
/// literal sequence against a real Postgres 16 + the full 22-migration
/// dbmate chain + the RLS isolation suite while prototyping this — all
/// green), just parameterised with generated passwords instead of the
/// dev-default ones.
pub fn bootstrap_roles_and_extensions(
    resource_pg_dir: &Path,
    port: u16,
    secrets: &OfflineSecrets,
) -> Result<(), String> {
    let create_db = Command::new(bin(resource_pg_dir, "createdb"))
        .args(["-h", "127.0.0.1", "-p", &port.to_string(), "-U", "postgres", "pharmatrack"])
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| format!("failed to run createdb: {e}"))?;
    if !create_db.status.success() {
        return Err(format!(
            "createdb failed: {}",
            String::from_utf8_lossy(&create_db.stderr)
        ));
    }

    let sql = format!(
        r#"
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='app_owner') THEN
    CREATE ROLE app_owner LOGIN PASSWORD '{owner_pw}';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='app_authenticated') THEN
    CREATE ROLE app_authenticated LOGIN PASSWORD '{auth_pw}' NOBYPASSRLS;
  END IF;
END $$;
GRANT CREATE, USAGE ON SCHEMA public TO app_owner;
GRANT USAGE ON SCHEMA public TO app_authenticated;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
"#,
        owner_pw = secrets.app_owner_password.replace('\'', "''"),
        auth_pw = secrets.app_authenticated_password.replace('\'', "''"),
    );

    run_psql(resource_pg_dir, port, "postgres", "pharmatrack", &sql)
}

/// Applies infra/migrations/*.sql via the bundled `dbmate` sidecar — see
/// offline/mod.rs::run_dbmate (needs the AppHandle to resolve the sidecar,
/// so it lives there, not here).
fn run_psql(
    resource_pg_dir: &Path,
    port: u16,
    user: &str,
    database: &str,
    sql: &str,
) -> Result<(), String> {
    use std::io::Write;
    let mut child = Command::new(bin(resource_pg_dir, "psql"))
        .args([
            "-h",
            "127.0.0.1",
            "-p",
            &port.to_string(),
            "-U",
            user,
            "-d",
            database,
            "-v",
            "ON_ERROR_STOP=1",
        ])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("failed to run psql: {e}"))?;
    child
        .stdin
        .take()
        .ok_or("psql stdin unavailable")?
        .write_all(sql.as_bytes())
        .map_err(|e| format!("failed to write to psql stdin: {e}"))?;
    let output = child
        .wait_with_output()
        .map_err(|e| format!("failed to wait for psql: {e}"))?;
    if !output.status.success() {
        return Err(format!(
            "psql failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }
    Ok(())
}
