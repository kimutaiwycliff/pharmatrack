import * as ed from "@noble/ed25519"
import { sha512 } from "@noble/hashes/sha2.js"
import { kvGet, kvSet } from "./kv"

// ADR-014, Phase 3 — signed offline license verification, mirroring
// apps/desktop/src-tauri/src/offline/license.rs exactly: same envelope
// format, same public key, same re-verify-every-launch approach (a cached
// "already licensed" boolean would be trivial to fake by editing local
// state; the signature check itself is the actual guard). See that file's
// header comment for the full envelope format rationale — repeated here
// only where it affects this file's own logic.
//
// @noble/ed25519 needs a synchronous SHA-512 implementation wired in before
// any sync verify() call works — @noble/hashes' pure-JS implementation
// avoids depending on WebCrypto, which RN/Hermes doesn't expose.
ed.hashes.sha512 = sha512

// PRODUCTION KEY, generated 2026-09-17 via scripts/generate-offline-license.mjs.
// The matching private key is held only by the operator, outside this repo
// and outside any CI-reachable storage — see ADR-014. Must stay identical to
// apps/desktop's copy. Regenerating the key invalidates every license
// already signed with this one.
const OFFLINE_LICENSE_PUBLIC_KEY_HEX =
  "dd954fef5947144acd654d1ad86ad20d09d3973a0f273ca230f7a1630184d463"

const LICENSE_KV_KEY = "offline_license_raw"

export interface LicensePayload {
  licenseId: string
  pharmacyName: string
  issuedAt: string
  expiresAt: string | null
}

interface LicenseEnvelope {
  version: number
  payload: string
  signature: string
}

export type LicenseCheckResult =
  | { valid: true; payload: LicensePayload }
  | { valid: false; error: string }

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim()
  const bytes = new Uint8Array(Math.floor(clean.length / 2))
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.substring(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

export function verifyLicenseRaw(raw: string): LicenseCheckResult {
  let envelope: LicenseEnvelope
  try {
    envelope = JSON.parse(raw)
  } catch {
    return { valid: false, error: "Not a valid license file" }
  }
  if (envelope.version !== 1 || typeof envelope.payload !== "string" || typeof envelope.signature !== "string") {
    return { valid: false, error: "Unrecognized license file format" }
  }

  let ok: boolean
  try {
    const message = new TextEncoder().encode(envelope.payload)
    const signature = hexToBytes(envelope.signature)
    const publicKey = hexToBytes(OFFLINE_LICENSE_PUBLIC_KEY_HEX)
    if (signature.length !== 64) return { valid: false, error: "Corrupt license signature (wrong length)" }
    ok = ed.verify(signature, message, publicKey)
  } catch {
    return { valid: false, error: "Corrupt license signature" }
  }
  if (!ok) return { valid: false, error: "License signature does not match — the file is invalid or was tampered with" }

  try {
    const payload = JSON.parse(envelope.payload) as LicensePayload
    return { valid: true, payload }
  } catch {
    return { valid: false, error: "Corrupt license payload" }
  }
}

/** Re-verifies the stored license's signature on every call — see the
 *  module doc above for why this isn't just a cached boolean. Returns null
 *  when no license has ever been stored (first run). */
export async function getStoredLicense(): Promise<LicenseCheckResult | null> {
  const raw = await kvGet<string>(LICENSE_KV_KEY)
  if (!raw) return null
  return verifyLicenseRaw(raw)
}

export async function storeLicenseRaw(raw: string): Promise<void> {
  await kvSet(LICENSE_KV_KEY, raw)
}
