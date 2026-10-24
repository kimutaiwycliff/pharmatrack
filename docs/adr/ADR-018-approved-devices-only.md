# ADR-018 — Approved devices only (optional sign-in lock)
**Status:** Accepted (2026-10-24)

## Context
Owners want staff to use PharmaTrack only on the shop's own tills and
computers, not on a personal phone or a home laptop. Registered devices
already exist for offline selling (migration 029, ADR-013/016). Each has a
revocable token that is stored only as a sha256 hash, and the
`devices.manage` capability controls registration. Nothing ties a staff
*sign-in* to a registered device yet.

## Decision
- **Optional, per pharmacy, off by default.** The setting lives in
  `org_settings.settings.device_lock` as `{ enabled, managers_exempt }`.
  Existing tenants see no change until an owner turns it on.
- **Who it applies to.** Every staff role except the owner, who is always
  exempt so a pharmacy can't lock itself out. A tick box also exempts
  managers. Platform operators are unaffected.
- **One checkpoint.** Better Auth's `databaseHooks.session.create.before`
  runs for every sign-in method: email, Google, PIN and the phone app. When
  the lock applies, the request must carry an approved, active device of
  that pharmacy, or no session is created. The new session records
  `deviceId`.
- **Device key on the request.**
  - Web and desktop: an httpOnly cookie `pt_device`. It also covers the
    Google redirect.
  - Android: an `x-pt-device` header.
  - Browser tills registered before this ADR: they bind their existing
    key into the cookie once, when the till starts (`/api/devices/bind`).
- **Revoking a device deletes its sessions.** A lost phone or a departed
  employee is signed out immediately. Turning the lock on deletes the
  sessions of affected staff on unapproved devices; the turn-on dialog
  says how many.
- **Approval** (`device_request`, migration 041). A blocked sign-in creates
  a pending request and returns a one-time secret plus a 6-digit matching
  code. The secret *becomes the device key* when the request is approved,
  so the raw key is never stored or sent again. The device can be approved
  in two ways:
  - **on the spot:** an owner or manager with `devices.manage` enters
    their own till PIN on that device (same 5-try lockout as PIN sign-in);
  - **remotely:** in Settings → Devices, after checking that the codes
    match.
  
  The device polls the request's status, gets its cookie, and the sign-in
  is retried. Requests expire after 15 minutes.
- **Device purpose.** `till` sells and holds a stock share, as today.
  `office` (back office) can be used for sign-in only: it is excluded from
  stock shares and can't call `/api/sync/*`.
- **All plans.** This is a security control, not an upsell.

## Consequences
- Clearing a browser's data, a new browser profile or private mode makes it a
  new device. That is how the protection works, so the blocked screen says so.
- It controls *which device* is used, not *who* knows a PIN. Remote-control
  tools on an approved PC aren't detected.
- Approval needs the internet once; approved tills keep selling offline.
- The Android app needs an update to send `x-pt-device` at sign-in. It's
  JavaScript-only, so it ships over the air (EAS Update) to 1.3.0 installs.
  The bundle reports `app_version` 1.3.1, and until a device reports that,
  the setting warns that its staff will be blocked while the lock is on.
- The platform console can switch the lock off for a pharmacy (recovery).
