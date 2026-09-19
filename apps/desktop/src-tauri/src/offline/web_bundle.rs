use std::fs::File;
use std::path::{Path, PathBuf};

use flate2::read::GzDecoder;
use tar::Archive;

/// Extracts the vendored `resources/web.tar.gz` into the app's (writable)
/// data directory on first run, returning the extracted root — the same
/// tree `fetch-offline-resources.mjs` used to bundle as loose files directly
/// (see that script's own comment for why: NSIS's makensis has to
/// individually open every bundled file by its full source path at BUILD
/// time, and pnpm's `.pnpm/<pkg>@<version>_<hash>/...` store paths — Next.js
/// itself included, not just optional integrations — routinely exceed
/// Windows's 260-char MAX_PATH). A single short-named archive sidesteps that
/// limit entirely; this function is where the tradeoff (extract once,
/// however long that takes, instead of never dealing with it) is paid.
///
/// Idempotent: skips extraction if `server.js` already exists at the
/// expected location, so a normal launch after the first one is a no-op
/// path check, not a re-extract.
pub fn ensure_web_extracted(resource_dir: &Path, data_dir: &Path) -> Result<PathBuf, String> {
    let web_root = data_dir.join("web");
    let server_js = web_root.join("apps").join("web").join("server.js");
    if server_js.exists() {
        return Ok(web_root);
    }

    let archive_path = resource_dir.join("web.tar.gz");
    let file = File::open(&archive_path)
        .map_err(|e| format!("failed to open {}: {e}", archive_path.display()))?;
    let decoder = GzDecoder::new(file);
    let mut archive = Archive::new(decoder);

    // Extract into a temp sibling first, then rename into place — an
    // interrupted extraction (crash, force-quit mid-unpack) must never leave
    // a partial `web/` directory that then passes the `server_js.exists()`
    // check above on the next launch.
    let staging = data_dir.join("web.extracting");
    let _ = std::fs::remove_dir_all(&staging);
    std::fs::create_dir_all(&staging).map_err(|e| format!("failed to create staging dir: {e}"))?;
    archive
        .unpack(&staging)
        .map_err(|e| format!("failed to extract {}: {e}", archive_path.display()))?;

    let _ = std::fs::remove_dir_all(&web_root);
    std::fs::rename(&staging, &web_root)
        .map_err(|e| format!("failed to move extracted web bundle into place: {e}"))?;

    Ok(web_root)
}

#[cfg(test)]
mod tests {
    use super::*;
    use flate2::write::GzEncoder;
    use flate2::Compression;

    fn make_test_archive(dir: &Path) -> PathBuf {
        // Mirrors fetch-offline-resources.mjs's real output shape closely
        // enough to exercise the extraction path, including a deeply-nested
        // entry name of the kind that broke NSIS directly.
        let src = dir.join("src");
        let deep = src.join("apps").join("web").join("node_modules").join(
            "very-long-directory-name-simulating-a-real-pnpm-store-entry-with-hashed-peer-deps",
        );
        std::fs::create_dir_all(&deep).unwrap();
        std::fs::write(deep.join("index.js"), b"// deep file").unwrap();
        let web_dir = src.join("apps").join("web");
        std::fs::write(web_dir.join("server.js"), b"console.log('server')").unwrap();

        let archive_path = dir.join("web.tar.gz");
        let tar_gz = File::create(&archive_path).unwrap();
        let enc = GzEncoder::new(tar_gz, Compression::default());
        let mut tar_builder = tar::Builder::new(enc);
        tar_builder.append_dir_all(".", &src).unwrap();
        tar_builder.into_inner().unwrap().finish().unwrap();
        archive_path
    }

    #[test]
    fn extracts_and_is_idempotent() {
        let tmp = std::env::temp_dir().join(format!("pt-web-bundle-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&tmp);
        let resource_dir = tmp.join("resources");
        let data_dir = tmp.join("data");
        std::fs::create_dir_all(&resource_dir).unwrap();
        std::fs::create_dir_all(&data_dir).unwrap();
        make_test_archive(&resource_dir);

        let web_root = ensure_web_extracted(&resource_dir, &data_dir).expect("first extraction should succeed");
        assert!(web_root.join("apps").join("web").join("server.js").exists());
        assert!(web_root
            .join("apps")
            .join("web")
            .join("node_modules")
            .join("very-long-directory-name-simulating-a-real-pnpm-store-entry-with-hashed-peer-deps")
            .join("index.js")
            .exists());

        // Idempotency: remove the archive so a second real extraction attempt
        // would fail, then confirm the existence check short-circuits it.
        std::fs::remove_file(resource_dir.join("web.tar.gz")).unwrap();
        let web_root_again = ensure_web_extracted(&resource_dir, &data_dir).expect("second call should be a no-op, not re-extract");
        assert_eq!(web_root, web_root_again);

        let _ = std::fs::remove_dir_all(&tmp);
    }
}
