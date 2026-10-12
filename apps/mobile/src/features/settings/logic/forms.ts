import { normalizeKePhone } from "@pharmatrack/core"

// Pure validation for the Settings / Staff forms (no React Native, unit
// tested). Rules mirror the server so mistakes show under the field before a
// round-trip: apps/web/lib/auth/pin.ts (validatePin), the Zod schemas in
// apps/web/app/api/settings/route.ts and apps/web/app/api/staff/**, and
// web's ProfileSettingsForm / OrgSettingsForm messages.

export type FieldErrors<K extends string> = Partial<Record<K, string>>

export function hasErrors(errors: Record<string, string | undefined>): boolean {
  return Object.values(errors).some(Boolean)
}

// Same list as the server's validatePin — trivially guessable 4-digit PINs.
const WEAK_PINS = new Set([
  "0000", "1111", "2222", "3333", "4444", "5555", "6666", "7777", "8888", "9999",
  "1234", "2345", "3456", "4567", "5678", "6789", "0123",
  "9876", "8765", "7654", "6543", "5432", "4321", "3210",
])

/**
 * Online PINs are exactly 4 digits and not trivial (the server's rule).
 * The Offline Edition has always accepted 4–8 digits (local-auth.ts hashes
 * whatever it's given), so that stays as it was.
 */
export function pinError(pin: string, opts: { offline: boolean }): string | null {
  if (opts.offline) return /^\d{4,8}$/.test(pin) ? null : "PIN must be 4-8 digits"
  if (!/^\d{4}$/.test(pin)) return "PIN must be exactly 4 digits"
  if (WEAK_PINS.has(pin)) return "Choose a less predictable PIN"
  return null
}

export interface PinForm {
  pin: string
  confirm: string
  /** Account password — online only (PATCH /api/settings?target=pin re-checks it). */
  password: string
}

export function validatePinForm(form: PinForm, opts: { offline: boolean }): FieldErrors<keyof PinForm> {
  const errors: FieldErrors<keyof PinForm> = {}
  const pinErr = pinError(form.pin, opts)
  if (pinErr) errors.pin = pinErr
  else if (form.confirm !== form.pin) errors.confirm = "PINs do not match"
  if (!opts.offline && !form.password) errors.password = "Enter your account password to confirm"
  return errors
}

export interface PasswordForm {
  current: string
  next: string
  confirm: string
}

export function validatePasswordForm(form: PasswordForm): FieldErrors<keyof PasswordForm> {
  const errors: FieldErrors<keyof PasswordForm> = {}
  if (!form.current) errors.current = "Enter your current password"
  if (form.next.length < 8) errors.next = "New password must be at least 8 characters"
  else if (form.next !== form.confirm) errors.confirm = "Passwords do not match"
  return errors
}

/**
 * Accepts every Kenyan pattern normalizeKePhone understands (07…, 2547…,
 * +2547…, bare 7…, and 01… lines); a number with a country code that isn't
 * Kenyan still passes as long as it looks like E.164.
 */
export function phoneError(raw: string, opts: { required: boolean }): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return opts.required ? "Enter a phone number" : null
  const e164 = normalizeKePhone(trimmed)
  if (/^\+254[17]\d{8}$/.test(e164)) return null
  if (!e164.startsWith("+254") && /^\+[1-9]\d{8,14}$/.test(e164)) return null
  return "Enter a valid phone number, e.g. 0712 345 678"
}

export interface ProfileForm {
  fullName: string
  phone: string
}

/** `phoneRequired`: the Offline Edition signs in by phone + PIN, so clearing it would lock you out. */
export function validateProfileForm(form: ProfileForm, opts: { phoneRequired?: boolean } = {}): FieldErrors<keyof ProfileForm> {
  const errors: FieldErrors<keyof ProfileForm> = {}
  if (form.fullName.trim().length < 2) errors.fullName = "Enter your full name"
  const phoneErr = phoneError(form.phone, { required: !!opts.phoneRequired })
  if (phoneErr) errors.phone = phoneErr
  return errors
}

export interface OrgForm {
  name: string
  registrationNumber: string
  phone: string
  email: string
  address: string
}

export const EMAIL_RE = /^\S+@\S+\.\S+$/

export function validateOrgForm(form: OrgForm): FieldErrors<keyof OrgForm> {
  const errors: FieldErrors<keyof OrgForm> = {}
  if (form.name.trim().length < 2) errors.name = "Enter the pharmacy name"
  if (form.email.trim() && !EMAIL_RE.test(form.email.trim())) errors.email = "Enter a valid email address"
  return errors
}

export interface OrgPayload {
  name: string
  registration_number?: string
  phone?: string
  email?: string
  address?: string
}

/**
 * Body for PATCH /api/settings?target=org (and the local repo). Blank optional
 * fields are sent as undefined, as web's OrgSettingsForm does — the server's
 * `email: z.string().email().optional()` rejects an empty string.
 */
export function orgPayload(form: OrgForm): OrgPayload {
  const opt = (v: string) => v.trim() || undefined
  return {
    name: form.name.trim(),
    registration_number: opt(form.registrationNumber),
    phone: opt(form.phone),
    email: opt(form.email),
    address: opt(form.address),
  }
}
