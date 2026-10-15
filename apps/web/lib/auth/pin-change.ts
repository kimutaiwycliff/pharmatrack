// Who may set or change their own till PIN (Settings → My profile, and the
// Android PIN screen). No account password: people who sign in with Google
// have none, so asking for it locked them out of PINs entirely.
//
//  - No PIN yet            → a signed-in session is enough to set one.
//  - Changing a PIN        → the current PIN, or
//  - Forgot the current PIN → a fresh sign-in (within RECENT_SIGN_IN_MS) proves
//                             it's really them; an owner/manager can also
//                             reset a staff member's PIN from Staff.

export const RECENT_SIGN_IN_MS = 15 * 60_000

export const CURRENT_PIN_REQUIRED =
  "Enter your current PIN. Forgot it? Sign out, sign back in, then set a new PIN within 15 minutes."
export const CURRENT_PIN_WRONG = "That's not your current PIN."

export type PinChangeCheck = { ok: true } | { ok: false; error: string }

export async function checkPinChange(args: {
  existingHash: string | null
  currentPin?: string | null
  sessionCreatedAt: Date | string | null | undefined
  now?: Date
  verify: (pin: string, hash: string) => Promise<boolean>
}): Promise<PinChangeCheck> {
  if (!args.existingHash) return { ok: true }
  const current = args.currentPin?.trim()
  if (current) {
    return (await args.verify(current, args.existingHash)) ? { ok: true } : { ok: false, error: CURRENT_PIN_WRONG }
  }
  const signedInAt = args.sessionCreatedAt ? new Date(args.sessionCreatedAt).getTime() : NaN
  const now = (args.now ?? new Date()).getTime()
  if (Number.isFinite(signedInAt) && now - signedInAt <= RECENT_SIGN_IN_MS) return { ok: true }
  return { ok: false, error: CURRENT_PIN_REQUIRED }
}
