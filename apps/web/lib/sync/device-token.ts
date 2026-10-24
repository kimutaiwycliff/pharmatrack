import { createHash, randomBytes } from "node:crypto"

// Device keys (offline tills, ADR-013/016; approved devices, ADR-018). Only
// the sha256 is ever stored. Kept free of auth/db imports so the sign-in hook
// (lib/auth/server.ts → lib/devices/lock.ts) doesn't import itself in a loop.
export const hashDeviceToken = (token: string) => createHash("sha256").update(token).digest("hex")
export const newDeviceToken = () => `ptd_${randomBytes(32).toString("base64url")}`
