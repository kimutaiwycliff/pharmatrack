#!/usr/bin/env node
// ADR-014, Phase 3 — standalone tool for the Offline Edition's signed
// license files. Run manually by the PharmaTrack operator; never imported by
// apps/web, apps/desktop, or apps/mobile.
//
// SECURITY: `keypair` writes the private key to secrets/ (gitignored) as a
// convenience default, NOT as the intended long-term home — move that file
// to a password manager or an encrypted offline drive once generated, and
// never commit it or hand it to anyone. Only the 32-byte PUBLIC key (printed
// to stdout) is meant to be pasted into the apps' source.
//
// License envelope format (what `sign` writes, what both apps verify):
//   { version: 1, payload: "<JSON string>", signature: "<128-char hex>" }
// `signature` is a raw Ed25519 signature (RFC 8032, 64 bytes, hex-encoded)
// over the UTF-8 bytes of `payload` EXACTLY AS WRITTEN — verifiers check the
// signature against that literal string, then JSON.parse it, so there is no
// canonical-JSON step to get wrong on either side.
//
// payload shape: { licenseId, pharmacyName, issuedAt, expiresAt: null }
// (expiresAt is always null — these are perpetual, one-off licenses; the
// field exists so a future non-perpetual license type wouldn't need a
// format change.)

import { generateKeyPairSync, sign as cryptoSign, createPrivateKey, randomUUID } from "node:crypto"
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SECRETS_DIR = path.join(__dirname, "..", "secrets")
const PRIVATE_KEY_PATH = path.join(SECRETS_DIR, "offline-license-private-key.pem")
const PUBLIC_KEY_PATH = path.join(SECRETS_DIR, "offline-license-public-key.txt")

function argValue(args, flag) {
  const i = args.indexOf(flag)
  return i === -1 ? undefined : args[i + 1]
}

// Ed25519 keys are always exactly 32 raw bytes. Both the PKCS8 (private) and
// SPKI (public) DER encodings put those 32 bytes at the very end of a fixed
// small ASN.1 prefix, so slicing off the last 32 bytes avoids needing an
// ASN.1 parser just to get the raw key apps/desktop and apps/mobile need.
function rawKeyFromDer(der) {
  return der.subarray(der.length - 32)
}

function cmdKeypair(args) {
  if (existsSync(PRIVATE_KEY_PATH) && !args.includes("--force")) {
    console.error(`A private key already exists at ${PRIVATE_KEY_PATH}.`)
    console.error("Overwriting it would invalidate every license already signed with the old key.")
    console.error("Pass --force if you're certain you want a new key.")
    process.exit(1)
  }
  mkdirSync(SECRETS_DIR, { recursive: true })

  const { publicKey, privateKey } = generateKeyPairSync("ed25519")
  writeFileSync(PRIVATE_KEY_PATH, privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600 })

  const publicRaw = rawKeyFromDer(publicKey.export({ type: "spki", format: "der" }))
  const publicHex = Buffer.from(publicRaw).toString("hex")
  writeFileSync(PUBLIC_KEY_PATH, publicHex + "\n")

  console.log(`Private key written to ${PRIVATE_KEY_PATH}`)
  console.log("NEVER commit that file — move it somewhere safe outside the repo once you've read this.\n")
  console.log("Public key (hex) — paste into BOTH apps' license verification code:")
  console.log(publicHex)
  console.log("\nAs a Rust byte array (apps/desktop/src-tauri/src/offline/license.rs):")
  console.log(`[${Array.from(Buffer.from(publicHex, "hex")).join(", ")}]`)
}

function cmdSign(args) {
  const pharmacyName = argValue(args, "--pharmacy")
  const out = argValue(args, "--out")
  const licenseId = argValue(args, "--license-id") ?? randomUUID()
  const keyPath = argValue(args, "--key") ?? PRIVATE_KEY_PATH

  if (!pharmacyName || !out) {
    console.error('Usage: generate-offline-license.mjs sign --pharmacy "Name" --out file.ptlicense [--license-id uuid] [--key path.pem]')
    process.exit(1)
  }
  if (!existsSync(keyPath)) {
    console.error(`No private key found at ${keyPath}. Run "generate-offline-license.mjs keypair" first.`)
    process.exit(1)
  }

  const privateKey = createPrivateKey(readFileSync(keyPath, "utf8"))
  const payload = { licenseId, pharmacyName, issuedAt: new Date().toISOString(), expiresAt: null }
  const payloadJson = JSON.stringify(payload)
  const signature = cryptoSign(null, Buffer.from(payloadJson, "utf8"), privateKey)
  const envelope = { version: 1, payload: payloadJson, signature: signature.toString("hex") }

  writeFileSync(out, JSON.stringify(envelope, null, 2))
  console.log(`License written to ${out}`)
  console.log(`  licenseId:    ${licenseId}`)
  console.log(`  pharmacyName: ${pharmacyName}`)
  console.log(`  issuedAt:     ${payload.issuedAt}`)
}

const [, , cmd, ...rest] = process.argv
if (cmd === "keypair") cmdKeypair(rest)
else if (cmd === "sign") cmdSign(rest)
else {
  console.log("Usage:")
  console.log("  node scripts/generate-offline-license.mjs keypair [--force]")
  console.log('  node scripts/generate-offline-license.mjs sign --pharmacy "Name" --out file.ptlicense [--license-id uuid]')
  process.exit(cmd ? 1 : 0)
}
