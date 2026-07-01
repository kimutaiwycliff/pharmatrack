import "server-only"
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto"

// AES-256-GCM at-rest encryption for tenant secrets (M-Pesa consumer secret /
// passkey). The key is derived from BETTER_AUTH_SECRET so there's no extra env to
// manage; rotating BETTER_AUTH_SECRET would require re-saving stored secrets.
// Format: "v1:<iv b64>:<tag b64>:<ciphertext b64>". Never send plaintext to the client.

function key(): Buffer {
  const secret = process.env.BETTER_AUTH_SECRET
  if (!secret) throw new Error("BETTER_AUTH_SECRET is not set")
  return createHash("sha256").update(`pt-mpesa:${secret}`).digest() // 32 bytes
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key(), iv)
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${ct.toString("base64")}`
}

export function decryptSecret(blob: string | null | undefined): string | null {
  if (!blob) return null
  const parts = blob.split(":")
  if (parts.length !== 4 || parts[0] !== "v1") return null
  try {
    const [, ivB64, tagB64, ctB64] = parts
    const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB64!, "base64"))
    decipher.setAuthTag(Buffer.from(tagB64!, "base64"))
    return Buffer.concat([decipher.update(Buffer.from(ctB64!, "base64")), decipher.final()]).toString("utf8")
  } catch {
    return null
  }
}
