#!/usr/bin/env node
// ADR-014 — vendors the per-target, build-time third-party resources for the
// Offline Edition desktop build: a real Postgres 16 distribution, the
// Node.js runtime (as a Tauri sidecar), the dbmate migration runner (as a
// Tauri sidecar), and a copy of infra/migrations/*.sql. NONE of this is
// committed to the repo — everything this script writes lives under
// src-tauri/resources/ and src-tauri/binaries/, both gitignored.
//
// A single `tauri build` only ever targets one platform+arch, so this is
// run once per target right before building it — macOS ships as two
// separate per-arch installers (Intel + Apple Silicon), not one universal
// binary, because the vendored Postgres binaries can't be lipo-merged the
// way Tauri merges its own Rust output.
//
// Usage (from apps/desktop/):
//   node scripts/fetch-offline-resources.mjs --target aarch64-apple-darwin
//   node scripts/fetch-offline-resources.mjs --target x86_64-apple-darwin
//   node scripts/fetch-offline-resources.mjs --target x86_64-pc-windows-msvc
//   node scripts/fetch-offline-resources.mjs --target x86_64-unknown-linux-gnu
// Then:
//   pnpm tauri build --target <same triple> --features offline-edition \
//     --config src-tauri/tauri.offline.conf.json
//
// The Next.js standalone build (resources/web/) is assembled by this script
// too (see the bottom), but the build itself is NOT run by this script,
// since apps/web is this repo's own code, not a third party. Build it first
// (from the repo root):
//   NEXT_PUBLIC_APP_URL=http://127.0.0.1:47831 pnpm --filter web build
// The 47831 port must match offline::NEXT_PORT in
// src-tauri/src/offline/mod.rs — NEXT_PUBLIC_* values are baked into the
// client JS bundle at build time, not read at runtime (see self-hosting-vm
// project notes: the same gotcha already applies to the hosted SaaS build).

import { existsSync, mkdirSync, rmSync, cpSync, readdirSync, lstatSync, chmodSync, readFileSync, unlinkSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC_TAURI = join(__dirname, "..", "src-tauri");
const REPO_ROOT = join(__dirname, "..", "..", "..");

// Pinned versions — bump deliberately, not automatically. PG_VERSION is the
// exact build this whole sequence was validated against (ADR-014): a real
// Postgres 16.15.0 instance, TCP-loopback-only, roles + pg_trgm bootstrap,
// all 22 infra/migrations/*.sql via dbmate, and the RLS isolation suite —
// all green.
const PG_VERSION = "16.15.0";
const NODE_VERSION = "22.20.0"; // matches CLAUDE.md's Node 22 LTS pin
const DBMATE_VERSION = "2.35.1"; // matches CI's `ghcr.io/amacneil/dbmate:2`

const TARGETS = {
  "aarch64-apple-darwin": { pg: "aarch64-apple-darwin", node: { os: "darwin", arch: "arm64" }, dbmate: "dbmate-macos-arm64", exe: "" },
  "x86_64-apple-darwin": { pg: "x86_64-apple-darwin", node: { os: "darwin", arch: "x64" }, dbmate: "dbmate-macos-amd64", exe: "" },
  "x86_64-pc-windows-msvc": { pg: "x86_64-pc-windows-msvc", node: { os: "win", arch: "x64" }, dbmate: "dbmate-windows-amd64.exe", exe: ".exe" },
  "x86_64-unknown-linux-gnu": { pg: "x86_64-unknown-linux-gnu", node: { os: "linux", arch: "x64" }, dbmate: "dbmate-linux-amd64", exe: "" },
};

function fail(msg) {
  console.error(`[fetch-offline-resources] ${msg}`);
  process.exit(1);
}

function log(msg) {
  console.log(`[fetch-offline-resources] ${msg}`);
}

const targetIdx = process.argv.indexOf("--target");
const target = targetIdx !== -1 ? process.argv[targetIdx + 1] : null;
if (!target || !TARGETS[target]) {
  fail(`--target must be one of: ${Object.keys(TARGETS).join(", ")}`);
}
const cfg = TARGETS[target];

function download(url, dest) {
  log(`fetching ${url}`);
  execFileSync("curl", ["-sSL", "--fail", "-o", dest, url], { stdio: "inherit" });
}

// Extracts the first 64-hex-char run from arbitrary checksum-tool output —
// deliberately format-agnostic. Real-world formats seen across platforms:
// GNU coreutils sha256sum: "<hash>  <filename>" (note: prefixes the whole
// line with a literal "\" when the filename contains a backslash — always
// true of a Windows temp path — so a naive first-whitespace-token split
// would return "\<hash>", not "<hash>"); macOS/BSD shasum: same GNU-style
// format; theseus-rs's own Windows-target .sha256 release asset: raw
// `certutil -hashfile` output ("SHA256 hash of <file>:\r\n<hash>\r\nCertUtil:
// ..."), entirely different shape. Scanning for the hex run sidesteps all of
// that instead of special-casing each producer.
function extractHex64(text) {
  const match = text.match(/[0-9a-fA-F]{64}/);
  if (!match) fail(`could not find a SHA-256 hash in: ${text.slice(0, 200)}`);
  return match[0].toLowerCase();
}

function sha256(file) {
  let output;
  try {
    output = execFileSync("shasum", ["-a", "256", file]).toString();
  } catch {
    output = execFileSync("sha256sum", [file]).toString();
  }
  return extractHex64(output);
}

function verify(file, expectedFile) {
  const expected = extractHex64(readFileSync(expectedFile, "utf-8"));
  const actual = sha256(file);
  if (expected !== actual) {
    fail(`checksum mismatch for ${file}: expected ${expected}, got ${actual}`);
  }
  log(`checksum OK: ${file}`);
}

function freshDir(path) {
  rmSync(path, { recursive: true, force: true });
  mkdirSync(path, { recursive: true });
}

const work = join(tmpdir(), `pharmatrack-offline-fetch-${target}`);
freshDir(work);

// ── Postgres ──────────────────────────────────────────────────────────────
log(`vendoring Postgres ${PG_VERSION} (${cfg.pg})`);
const pgAsset = `postgresql-${PG_VERSION}-${cfg.pg}.tar.gz`;
const pgUrl = `https://github.com/theseus-rs/postgresql-binaries/releases/download/${PG_VERSION}/${pgAsset}`;
const pgArchive = join(work, pgAsset);
download(pgUrl, pgArchive);
download(`${pgUrl}.sha256`, `${pgArchive}.sha256`);
verify(pgArchive, `${pgArchive}.sha256`);
execFileSync("tar", ["-xzf", pgArchive, "-C", work]);
const pgExtractedDir = join(work, `postgresql-${PG_VERSION}-${cfg.pg}`);
const pgDest = join(SRC_TAURI, "resources", "postgres");
// freshDir(pgDest) itself, NOT its parent `resources/` — the parent also
// holds resources/web/ (the separately-built Next.js standalone output) and
// resources/migrations/, both of which must survive re-running this script.
// Hit this for real: an earlier version called freshDir(dirname(pgDest))
// and it silently deleted an already-built resources/web/ on a second run.
freshDir(pgDest);
// verbatimSymlinks: true is required — Postgres ships versioned .dylibs with
// a relative symlink alongside (e.g. libecpg.dylib -> libecpg.6.dylib).
// Node's default (false) "corrects" relative symlinks to absolute paths
// pointing at the SOURCE location during the copy, which then dangle the
// moment the source (this script's temp work dir) is cleaned up below —
// hit this exact failure vendoring for real: `tauri build` refused to
// bundle resources/postgres/lib/libecpg.dylib because the rewritten
// absolute target no longer existed. verbatimSymlinks preserves the
// original relative target text, which keeps resolving correctly since
// both the link and its target move together.
// Skip include/ (C headers for compiling extensions/ecpg — hundreds of
// files, purely build-time, never needed to just run the server; also
// floods tauri-build's resource file-watching with pointless entries).
cpSync(pgExtractedDir, pgDest, {
  recursive: true,
  verbatimSymlinks: true,
  filter: (src) => !src.includes(`${pgExtractedDir}/include`),
});
log(`Postgres vendored to ${pgDest}`);

// ── dbmate sidecar ───────────────────────────────────────────────────────
log(`vendoring dbmate ${DBMATE_VERSION}`);
const dbmateUrl = `https://github.com/amacneil/dbmate/releases/download/v${DBMATE_VERSION}/${cfg.dbmate}`;
const binariesDir = join(SRC_TAURI, "binaries");
mkdirSync(binariesDir, { recursive: true });
const dbmateDest = join(binariesDir, `dbmate-${target}${cfg.exe}`);
download(dbmateUrl, dbmateDest);
chmodSync(dbmateDest, 0o755);
log(`dbmate vendored to ${dbmateDest}`);

// ── node sidecar (just the single binary, not the full distribution) ────
log(`vendoring node ${NODE_VERSION} (${cfg.node.os}-${cfg.node.arch})`);
const isWindows = cfg.node.os === "win";
const nodeArchiveExt = isWindows ? "zip" : "tar.gz";
const nodeDistName = `node-v${NODE_VERSION}-${cfg.node.os}-${cfg.node.arch}`;
const nodeAsset = `${nodeDistName}.${nodeArchiveExt}`;
const nodeUrl = `https://nodejs.org/dist/v${NODE_VERSION}/${nodeAsset}`;
const nodeArchive = join(work, nodeAsset);
download(nodeUrl, nodeArchive);
if (isWindows) {
  try {
    execFileSync("unzip", ["-q", nodeArchive, "-d", work]);
  } catch {
    execFileSync("powershell", ["-Command", `Expand-Archive -Path '${nodeArchive}' -DestinationPath '${work}'`]);
  }
} else {
  execFileSync("tar", ["-xzf", nodeArchive, "-C", work]);
}
const nodeBinName = isWindows ? "node.exe" : "bin/node";
const nodeBinSrc = join(work, nodeDistName, nodeBinName);
const nodeDest = join(binariesDir, `node-${target}${cfg.exe}`);
cpSync(nodeBinSrc, nodeDest);
if (!isWindows) chmodSync(nodeDest, 0o755);
log(`node vendored to ${nodeDest}`);

// ── migrations (copy, not a symlink — resources must be real files) ─────
const migrationsSrc = join(REPO_ROOT, "infra", "migrations");
const migrationsDest = join(SRC_TAURI, "resources", "migrations");
freshDir(migrationsDest);
for (const f of readdirSync(migrationsSrc)) {
  if (f.endsWith(".sql")) cpSync(join(migrationsSrc, f), join(migrationsDest, f));
}
log(`migrations copied to ${migrationsDest}`);

rmSync(work, { recursive: true, force: true });

// ── web (this repo's own Next.js standalone build, not a third party) ──────
// Mirrors exactly what Dockerfile's runner stage does for the hosted SaaS
// build (.next/standalone at the root + .next/static + public/ copied in
// alongside), but with `dereference: true` — REQUIRED, not optional.
// pnpm's node_modules is one big web of symlinks into a central
// `.pnpm/<pkg>@<version>/node_modules/<pkg>` store; Tauri's bundler validates
// that every symlink it bundles resolves, so the whole tree must be
// materialized into real files first. Plain `cp -R`/cpSync without
// dereference (or even shell `cp -RL`, which mishandled some of pnpm's
// multi-level symlink chains when this was tried for real) leaves things
// like `@swc/helpers`'s actual implementation unreachable, which is silent
// until Next actually needs it at request time — hit this for real as a
// `MODULE_NOT_FOUND` for `@swc/helpers/cjs/_interop_require_default.cjs`
// inside the bundled .app, even though the plain `next start` boots fine.
const webStandaloneSrc = join(REPO_ROOT, "apps", "web", ".next", "standalone");
if (!existsSync(webStandaloneSrc)) {
  fail(
    `apps/web/.next/standalone not found — build it first: ` +
      `NEXT_PUBLIC_APP_URL=http://127.0.0.1:47831 pnpm --filter web build`,
  );
}
log("vendoring the Next.js standalone build (resources/web/)");
const webDest = join(SRC_TAURI, "resources", "web");
freshDir(webDest);
cpSync(webStandaloneSrc, webDest, { recursive: true, dereference: true });
mkdirSync(join(webDest, "apps", "web", ".next"), { recursive: true });
cpSync(join(REPO_ROOT, "apps", "web", ".next", "static"), join(webDest, "apps", "web", ".next", "static"), {
  recursive: true,
  dereference: true,
});
cpSync(join(REPO_ROOT, "apps", "web", "public"), join(webDest, "apps", "web", "public"), {
  recursive: true,
  dereference: true,
});

// Even with dereference: true, pnpm's tracer leaves a small number of
// symlinks that point nowhere resolvable at all (confirmed harmless —
// `.pnpm/node_modules/{scheduler,semver}` specifically, which Next inlines
// into its webpack output rather than requiring at runtime) — Tauri's
// bundler still refuses to ship ANY dangling symlink, so sweep for and
// remove them rather than special-case package names.
let removedBrokenSymlinks = 0;
function removeBrokenSymlinks(dir) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const st = lstatSync(p);
    if (st.isSymbolicLink()) {
      if (!existsSync(p)) {
        unlinkSync(p);
        removedBrokenSymlinks++;
      }
    } else if (st.isDirectory()) {
      removeBrokenSymlinks(p);
    }
  }
}
removeBrokenSymlinks(webDest);
log(`web vendored to ${webDest} (removed ${removedBrokenSymlinks} dangling symlink(s))`);

log("done.");
