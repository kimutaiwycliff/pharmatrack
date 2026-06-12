import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** True for a well-formed UUID string. Guards client payloads before they hit
 *  the server's stricter validation. */
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value)
}
