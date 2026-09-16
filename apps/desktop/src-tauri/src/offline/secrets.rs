use rand::distributions::Alphanumeric;
use rand::Rng;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

/// Per-install secrets generated once on first run and persisted to
/// `<app-data>/offline-secrets.json`. Never regenerated after that —
/// regenerating would orphan the Postgres roles already created with the
/// old passwords. The private license-signing key (ADR-014 Phase 3) is
/// intentionally NOT here: it never ships in the app at all, only its
/// public half does.
#[derive(Serialize, Deserialize, Clone)]
pub struct OfflineSecrets {
    pub app_owner_password: String,
    pub app_authenticated_password: String,
    pub better_auth_secret: String,
}

fn random_string(len: usize) -> String {
    rand::thread_rng()
        .sample_iter(&Alphanumeric)
        .take(len)
        .map(char::from)
        .collect()
}

impl OfflineSecrets {
    fn generate() -> Self {
        Self {
            app_owner_password: random_string(32),
            app_authenticated_password: random_string(32),
            better_auth_secret: random_string(48),
        }
    }

    /// Loads secrets persisted from a previous run, or generates and
    /// persists a fresh set on first run.
    pub fn load_or_create(secrets_path: &Path) -> Result<Self, String> {
        if secrets_path.exists() {
            let raw = fs::read_to_string(secrets_path)
                .map_err(|e| format!("failed to read secrets file: {e}"))?;
            return serde_json::from_str(&raw).map_err(|e| format!("corrupt secrets file: {e}"));
        }
        let secrets = Self::generate();
        if let Some(parent) = secrets_path.parent() {
            fs::create_dir_all(parent).map_err(|e| format!("failed to create app data dir: {e}"))?;
        }
        let raw = serde_json::to_string_pretty(&secrets).map_err(|e| e.to_string())?;
        fs::write(secrets_path, raw).map_err(|e| format!("failed to write secrets file: {e}"))?;
        restrict_permissions(secrets_path);
        Ok(secrets)
    }
}

#[cfg(unix)]
fn restrict_permissions(path: &Path) {
    use std::os::unix::fs::PermissionsExt;
    if let Ok(meta) = fs::metadata(path) {
        let mut perms = meta.permissions();
        perms.set_mode(0o600);
        let _ = fs::set_permissions(path, perms);
    }
}

// Windows: the per-user AppData directory is already restricted to the
// owning OS account by default; an ACL-level lockdown is left as a future
// hardening pass rather than blocking Phase 1 on it (accepted tradeoff, not
// an oversight — see ADR-014).
#[cfg(not(unix))]
fn restrict_permissions(_path: &Path) {}
