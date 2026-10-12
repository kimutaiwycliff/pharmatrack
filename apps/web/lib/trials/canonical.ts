// Canonical forms of identity signals used to recognise a repeat trial.
// Pure functions — the SQL backfill in infra/migrations/030_trial_grant.sql
// mirrors canonicalEmail(); keep the two in sync.

const GMAIL_DOMAINS = new Set(["gmail.com", "googlemail.com"])

/**
 * Canonical email: lowercase + trim, drop any "+tag" from the local part, and
 * for Gmail (which ignores dots and treats googlemail.com as gmail.com) remove
 * dots in the local part. "Jane.Doe+trial@GoogleMail.com" → "janedoe@gmail.com".
 */
export function canonicalEmail(raw: string): string {
  const email = raw.trim().toLowerCase()
  const at = email.lastIndexOf("@")
  if (at <= 0) return email
  let local = email.slice(0, at)
  let domain = email.slice(at + 1)
  const plus = local.indexOf("+")
  if (plus >= 0) local = local.slice(0, plus)
  if (GMAIL_DOMAINS.has(domain)) {
    domain = "gmail.com"
    local = local.replace(/\./g, "")
  }
  return `${local}@${domain}`
}

/** Domain part of an email, lowercased ("" when there is none). */
export function emailDomain(raw: string): string {
  const email = raw.trim().toLowerCase()
  const at = email.lastIndexOf("@")
  return at >= 0 ? email.slice(at + 1) : ""
}

/**
 * Canonical PPB registration / licence number: uppercase with spaces, dashes
 * and slashes removed, so "ppb/ret/123-24" and "PPB RET 12324" match.
 * (Mirrored in SQL by the migration 030 backfill.)
 * Returns null for blank input.
 */
export function canonicalRegistrationNumber(raw: string | null | undefined): string | null {
  if (!raw) return null
  const v = raw.toUpperCase().replace(/[\s\-/]+/g, "")
  return v.length ? v : null
}
