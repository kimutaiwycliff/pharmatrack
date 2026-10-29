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

## Amendment — part 2 (2026-10-29)
- **Every request, not just sign-in.** `getTenantContext` (all tenant pages
  and API routes) checks that a locked person's request carries the key of
  the approved device their session started on (`requestDeviceAllowed`,
  30 s cache). A session caught on another machine is deleted and the person
  goes to `/login?expired=1`; signing in there shows the approval screen.
  Android sends `x-pt-device` on every call from bundle 1.3.2 (OTA); older
  bundles are trusted on their session's own device until they update.
- **Who approves.** `device_lock.approvers`: `owner` (default) or
  `owner_managers`. It applies to approving on the spot, approving remotely,
  and registering a device while the lock is on. Remote approval now needs
  the approver's own PIN too, so a tap alone can't let a device in.
- **How long.** An approval is "Always", "7 days" or "Just today" (until
  midnight in Nairobi): `device.approved_until`, migration 043. When it
  passes, sign-in and every request are refused; an expired till may still
  upload sales it already made (`/api/sync/push`), but can't pull or take
  stock.
- **Telling the owner.** A blocked sign-in emails the owner (at most once per
  person every 10 minutes); the desktop app raises an OS notification when a
  new request arrives; the setup guide suggests turning the lock on.
- **What a device is for** (`device.access`, migration 043): `all`
  (default — every existing device keeps working as before), `selling` or
  `back_office`. Owners pick one "Used as" option, which sets purpose and
  access together: **Till only** (selling, shifts, customers — no products,
  stock or reports screens), **Back office** (everything but selling; no
  offline selling) or **Everything**. With the lock on, a person's
  permissions on a device are their role's permissions limited by its access
  (`permissionsOnDevice`, in `getTenantContext`), so navigation, pages and
  permission-checked API routes all follow it. Phones are never back office.
  Changing a device's use is an approval decision (owner, or managers if
  allowed). Owners are never limited.
