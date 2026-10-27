# ADR-019 — Setup guide: sign-up to first sale
**Status:** Accepted (2026-10-27)

## Context
New trial owners landed on a dashboard of zeros. Quick Start was hidden on the
Products page, stock was a separate trip, and the first shift asked for an
"opening float" with no explanation. Nothing marked the first sale, and the
only trial emails were about billing. Pharmacies that stall in setup don't
convert.

## Decision
- **Five core steps**, defined in `packages/core/src/onboarding.ts` (pure,
  shared with Android):
  1. Pharmacy created
  2. Add your products
  3. Set your prices
  4. Add your stock
  5. Make your first sale
  
  Optional steps follow: staff, M-Pesa, receipt logo, offline tills.
  **Progress is worked out from real data**, never from "mark as done" clicks
  (`GET /api/onboarding/progress`).
- **Owners and managers see it** (by role). Each can hide the dashboard card
  for themselves (`org_settings.settings.setup_guide.hidden_users`). It's
  always at `/getting-started`, which is in the sidebar with a progress ring
  until the first sale, then at the bottom of the menu. Android shows the
  same card on its dashboard.
- **Entry points:**
  - **Welcome dialog** after sign-up (`/home?welcome=1`): Quick Start,
    Excel import, or look around.
  - **Empty Products page:** Quick Start / Import / Add one.
  - **Deep links:** `?quickstart=1`, `?needsPrice=1`, `?import=1`,
    `/inventory/receive?tour=1`, `/pos?coach=1`.
- **Quick Start gains a stock step** (`QuickStartStock`): quantity and expiry
  month per product, saved through `/api/batches`. Expiry is required, never
  guessed.
- **Coaching** uses driver.js 1.9.0 (MIT, pinned), with steps short and skippable:
  - **Receive stock:** a four-stop walkthrough, the first time and on `?tour=1`.
  - **POS:** tips react to the screen (search when the cart is empty, pay
    when it isn't) and get out of the way as soon as the person types.
  - **Start-shift screens:** explain the opening float.
  - **After the first receipt closes:** a celebration with next steps.
- **Operator funnel:** each pharmacy's setup stage (no products → no prices →
  no stock → no sale → selling) is on the platform list, as a clickable
  funnel and a "Stuck in setup" filter.
- **Activation emails** (`/api/cron/activation-emails`, hourly from the
  worker), sent only to trial pharmacies under 14 days old:
  - welcome (day 0);
  - "add products" (day 1, if there are none);
  - "first sale" (day 3, if not selling);
  - halfway (day 7).
  
  Each email is sent once (`audit_log activation.email.<kind>`) and is **off
  until `ACTIVATION_EMAILS_ENABLED=1`**, after the owner approves the wording.
  `?preview=1` shows what would be sent without sending.

## Consequences
- The guide follows data, so a pharmacy that imports products or receives stock
  any other way sees the step tick itself off.
- Coach "seen" flags are per browser (localStorage) — a convenience, not state.
- `--pt-green-700` was used across the app but never defined; it is now
  (light `#166534`, dark `#4ade80`), so links that were meant to be green now are.
