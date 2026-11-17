# ADR-021 — Cashier station (paid add-on)
**Status:** Proposed (2026-11-17)

## Context
Busier pharmacies run several counters. Today every till takes its own
payment, so every attendant handles money, and cash variance is spread across
several drawers. Larger Kenyan pharmacies and supermarkets split the job:
counter staff serve the customer and build the order, then one **cashier**
takes the money (cash, M-Pesa, card), confirms it has arrived and hands the
goods over.

We want to offer this as a **paid add-on**. Tenants that don't buy it, and
branches where it is off, must see **no change at all**: same POS, same
`/api/sales` behaviour, same reports, same apps.

Decisions already taken with the product owner:
1. Stock is **held** when an order is sent, so the cashier never finds it gone.
2. The **cashier releases the goods directly**: confirming payment *is* the
   release. There is no separate dispatch step.
3. The add-on is **switched on per branch**, but billed as **one flat monthly
   fee per tenant**, whatever the number of branches.

## Decision

### The flow
1. **Order desk** (any till in an enabled branch): builds the cart as today,
   then taps **Send to cashier**. The server prices the order, holds the
   stock and gives it a short number for the day (`A-047`). The customer gets
   a slip, printed on the receipt printer (ADR-015) or shown on screen, with
   the number, the lines, the total and a QR code of the order id. The cart
   clears and the attendant serves the next customer.
2. **Cashier station**: a queue of open orders for the branch, refreshed by
   polling every 4 s (no WebSockets, §3). The cashier scans the slip's QR code
   (or types the number), checks the lines, may **remove** a line the customer
   no longer wants (never add one), and takes payment:
   - **Cash**: amount tendered, change shown (existing `CashModal`).
   - **M-Pesa**: STK push from the cashier screen, confirmed by Safaricom
     and claimed once (the existing #70 flow, `mpesa_stk_request`).
   - **Card**: the cashier confirms the terminal approved it and types the
     approval code. There is no card API (as §6.2).
   - **Split**: cash plus M-Pesa (existing `SplitModal`).
3. **Paid = released.** Collecting creates the real sale (receipt, FEFO
   decrement, controlled register, payment rows) and the order becomes `paid`.
   The cashier hands over the goods and prints the receipt. The order desk sees
   the order turn green in its "My orders" strip. That status is
   informational only: the release has already happened at the cashier.

Unpaid orders **expire** (default 30 minutes, set per branch). An expired
order holds nothing. The order desk can **re-send** it, which re-prices it
and re-checks stock.

### Orders live outside `sale`
An order is **not** a sale until it is paid. It lives in its own tables, and
collecting calls the same sale-creation code the till uses today. So:
- the `sale.status` CHECK, reports, dashboard, shifts, the platform insights
  digest, Android/desktop sync and `GET /api/sales` are untouched, because
  an unpaid order never appears as a sale;
- shift variance keeps working: the sale carries the **cashier's** shift, so
  the cash lands in one drawer.

### Schema (migration `046_cashier_station.sql`, additive only)
```sql
-- Add-on catalogue (operator-managed, like plan) + what each tenant has.
CREATE TABLE addon (
  code            text PRIMARY KEY,                 -- 'cashier_station'
  name            text NOT NULL,
  price_kes_month numeric(12,2) NOT NULL,           -- flat, per tenant
  is_active       boolean NOT NULL DEFAULT true
);
CREATE TABLE org_addon (
  organization_id text NOT NULL REFERENCES "organization"(id) ON DELETE CASCADE,
  addon_code      text NOT NULL REFERENCES addon(code),
  status          text NOT NULL CHECK (status IN ('active','cancelled')),
  activated_at    timestamptz NOT NULL DEFAULT now(),
  cancelled_at    timestamptz,
  granted_by      text,            -- operator id when comped / manually paid
  PRIMARY KEY (organization_id, addon_code)
);
-- RLS: tenant members read their own rows; writes only via app_owner
-- (checkout webhook, operator console), same as subscription.

-- Per-branch switch + settings. Defaults keep every branch as it is today.
ALTER TABLE branch
  ADD COLUMN cashier_station_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN order_hold_minutes      integer NOT NULL DEFAULT 30
                                     CHECK (order_hold_minutes BETWEEN 5 AND 240),
  ADD COLUMN order_desk_direct_sale  boolean NOT NULL DEFAULT false;
  -- ↑ may order-desk staff still check out directly while the station is on?

CREATE TABLE counter_order (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  text NOT NULL REFERENCES "organization"(id) ON DELETE CASCADE,
  branch_id        uuid NOT NULL REFERENCES branch(id),
  business_date    date NOT NULL,                   -- Africa/Nairobi day
  number           integer NOT NULL,                -- shown as A-047
  status           text NOT NULL DEFAULT 'awaiting_payment'
                   CHECK (status IN ('awaiting_payment','paid','cancelled','expired')),
  sent_by          text NOT NULL REFERENCES "user"(id),
  collected_by     text REFERENCES "user"(id),
  cancelled_by     text REFERENCES "user"(id),
  sale_id          uuid REFERENCES sale(id) ON DELETE SET NULL,
  subtotal         numeric(12,2) NOT NULL,
  discount_amount  numeric(12,2) NOT NULL DEFAULT 0,
  total_amount     numeric(12,2) NOT NULL,
  customer_name    text,
  customer_phone   text,
  client_reference text UNIQUE,                     -- idempotent "send" retries
  expires_at       timestamptz NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (branch_id, business_date, number)
);
CREATE INDEX idx_counter_order_queue ON counter_order (branch_id, status, expires_at);

CREATE TABLE counter_order_item (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id         uuid NOT NULL REFERENCES counter_order(id) ON DELETE CASCADE,
  organization_id  text NOT NULL,                   -- for RLS without a join
  product_id       uuid NOT NULL REFERENCES product(id),
  product_name     text NOT NULL,
  product_strength text,
  base_unit        text NOT NULL,
  is_controlled    boolean NOT NULL,
  quantity         integer NOT NULL CHECK (quantity > 0),   -- base units = held
  pack_size_id     uuid REFERENCES product_pack_size(id),
  unit_count       integer,
  unit_price       numeric(12,2) NOT NULL,          -- locked at send
  discount_percent numeric(5,2) NOT NULL DEFAULT 0,
  line_total       numeric(12,2) NOT NULL,
  removed_at       timestamptz,                     -- cashier removed it
  removed_by       text REFERENCES "user"(id)
);
-- Both tables: RLS deny-by-default, organization_id = user_organization_id().

-- Who served vs who took the money. Nullable: existing rows/inserts unchanged.
ALTER TABLE sale
  ADD COLUMN counter_order_id uuid REFERENCES counter_order(id) ON DELETE SET NULL,
  ADD COLUMN sold_by          text REFERENCES "user"(id);

-- Card approval code (card is new at the cashier station; the DB already
-- allows payment.method = 'card').
ALTER TABLE payment ADD COLUMN reference text;
```

### Stock holds
- A hold = `counter_order_item.quantity` where the order is
  `awaiting_payment` **and** `expires_at > now()` and the line isn't removed.
  Expiry needs no job for correctness: a stale order simply stops counting.
  A worker cron (every 5 min) marks such orders `expired` for tidiness and the
  queue view.
- New `reservedByOrders(db, branchId, productIds, excludeOrderId?)` next to
  `reservedByDevices` in `apps/web/lib/sync/allocation.ts`. Available stock
  everywhere becomes `batches − device holds − order holds`:
  - `POST /api/sales` stock guard,
  - `POST /api/orders` (send),
  - device allowance refresh (so offline devices aren't given held units),
  - POS product search "in stock" figure.
- Everything runs under the existing per-branch advisory lock
  (`alloc:<branch_id>`), so sends, sales and allowance refreshes can't race.
- **When the branch has the station off, `reservedByOrders` is not called**,
  so tenants without the add-on run exactly the queries they run today.

### Sale creation is shared, not copied
`POST /api/sales`'s transaction body moves into
`apps/web/lib/sales/create-sale.ts → createSale(db, ctx, input, options)`.
The route becomes a thin wrapper. Collecting an order calls the same function
with:
- `lockedLines`: prices and discounts from the order (no re-pricing, so a
  price edit after sending doesn't change the bill),
- `excludeOrderHold: orderId` (its own hold is what it's about to consume),
- `soldBy: order.sent_by`, `counterOrderId`, cashier as `cashier_id`, the
  cashier's `shift_id`,
- `allowCard: true` (card is accepted only on this path in v1).

This refactor ships **first, alone**, with parity tests (see Testing) before
any add-on code depends on it.

### API (all Zod-validated, all `withTenant`)
| Route | Who | Does |
|---|---|---|
| `POST /api/orders` | `orders.send` | Price server-side (same rules as a sale: clamp discounts, reject unpriced), check stock minus holds, number, hold, return slip data. Idempotent on `client_reference`. |
| `GET /api/orders?branch_id&status=open` | `orders.collect` (queue) or `orders.send` (own orders only) | Cashier queue and the desk's "My orders" strip. Polled. |
| `GET /api/orders/[id]` (also `?number=A-047`) | either | One order with lines, for scanning. |
| `POST /api/orders/[id]/collect` | `orders.collect` + open shift | Atomically flips `awaiting_payment → paid` (`UPDATE … WHERE status='awaiting_payment' AND expires_at > now()`), then `createSale(...)` in the same transaction. If someone else already collected it, returns 409. |
| `POST /api/orders/[id]/remove-line` | `orders.collect` | Removes one line, releasing its hold. An order can't lose its last line (cancel it instead). |
| `POST /api/orders/[id]/cancel` | sender (own) or `orders.collect` | Releases the hold. |
| `POST /api/orders/[id]/resend` | `orders.send` | Expired → new order with re-pricing and a fresh stock check. |
| `GET/POST /api/settings/addons` | `billing.manage` | View and activate/cancel add-ons (activation goes via Paystack). |
| `PATCH /api/branches/[id]` (extend) | `branches.manage` | The three branch fields. Enabling requires the add-on to be active. |

Every orders route first runs `requireAddon(orgId, "cashier_station")` and
checks that the branch has it enabled. Without both, it returns
`403 { code: "addon_locked" }`.

### Enforcing the split (only in enabled branches)
- New capabilities in `packages/core/src/permissions.ts`, group
  "Cashier station":
  - `orders.send`: send orders to the cashier (default: everyone; requires
    `pos.sell`);
  - `orders.collect`: run the cashier station, take payment, release goods,
    remove lines and cancel any order (default: owner, manager, cashier).
  Like all capabilities, they are editable per pharmacy (`role_permission`).
  The group is **hidden from the permissions screen unless the add-on is
  active**.
- In an enabled branch with `order_desk_direct_sale = false`, an **online**
  `POST /api/sales` from a user without `orders.collect` returns
  `403 { code: "use_cashier" }`. Order desks can't skip the cashier.
- **Offline sales are always accepted** (constraint §2.3: a sale is never
  lost). A synced sale with `offline_reference` made by a user without
  `orders.collect` in an enabled branch is accepted (`counter_order_id = null`)
  and shown in a new **"Direct sales at order desks"** list on the Sales
  report, so the owner can see who bypassed the station.
- Android and older app versions aren't touched in v1. In an enabled branch
  their sales count as direct sales, are allowed as above, and are listed.

### Shifts
- In an enabled branch, **order-desk mode needs no clock-in or float**: it
  never takes money.
- The cashier station needs an open shift. All collected cash goes to it, so
  variance belongs to one person. The shift summary is unchanged.

### UI (web + desktop; desktop is the same app in Tauri, ADR-012)
- **POS, branch off:** identical to today. No new buttons, no polling.
- **POS, branch on:** the device picks a mode once, remembered on the device
  (`localStorage`; per-device, not per-user):
  - *Order desk*: the payment buttons become **Send to cashier** (plus
    *Direct checkout* only if the branch allows it or the user has
    `orders.collect`). After sending, the slip modal (big number + QR,
    print button) appears. A strip of the desk's own open orders shows
    *Waiting / Paid / Expired (resend)*.
  - *Cashier*: `/pos/cashier`, with the queue on the left (number, sender,
    lines, total, age, time left before expiry), a scan box (USB-wedge or
    camera, ADR-015; reads the QR code or `A-047`), and the order on the
    right with *Remove line*, *Cancel*, and *Cash / M-Pesa / Card / Split*.
    After payment, the receipt opens and a large **"Paid — hand over items"**
    confirmation shows.
- **Offline:** *Send to cashier* is disabled with "No connection — the
  cashier can't see new orders". If direct checkout is allowed, the desk
  can sell normally (queued, flagged as above). The cashier can still ring up
  a normal sale.
- **Settings → Add-ons** (owner only, `billing.manage`): a card describing the
  Cashier station with its monthly price and *Activate*. Once active:
  **Settings → Branches** gets a toggle per branch plus the hold time and
  direct-sale switch.
- **Reports:** Sales report gains a *Sold by* column and a cashier filter only
  when the add-on is active. Totals are unchanged because orders aren't sales
  until paid.
- **Operator console (`/platform/[orgId]`):** add-on status, *Grant* /
  *Revoke* (for comps and manual payments), and an add-on line in the
  insights card (ADR-017).

### Billing: flat per tenant, per month
- `addon.price_kes_month` is charged **once per tenant**, however many
  branches use it.
- **Activation mid-period:** a one-off Paystack checkout for the rest of the
  current period, pro-rated by day in integer cents (ADR-008), with
  `type: "addon_activation"` in metadata. The webhook sets
  `org_addon.status = 'active'` and records a `subscription_payment` row.
- **Renewal:** `POST /api/billing/checkout` adds active add-ons to the plan
  amount: one payment and one period end, so there is nothing new for the
  tenant to track. For annual plans, the add-on is charged × 12. Whether to
  apply the annual discount is an open question below.
- **During the trial:** the add-on can be tried free until `trial_ends_at`.
  It is then included in the first checkout like the plan.
- **Lapse:** if the subscription goes `past_due`/`suspended`, the existing
  gate applies to everything. If only the add-on is cancelled, enabled
  branches revert to normal checkout at once. Open orders can still be
  **collected** (no customer is stranded), but no new ones can be sent.
- `requireAddon()` lives in `apps/web/lib/entitlements.ts` beside
  `requireFeatureApi`. Add-ons are a separate axis from plan features.
  Including an add-on in a plan (for example Enterprise) can come later as a
  plan → add-on mapping.

### Not in v1
Android order-desk and cashier modes. C2B/Paybill auto-matching (order
number as the account number). A customer "Now serving" screen. Offline QR
hand-off (whole cart in the QR code). Prescription linking at send.
Commission reports. Offline Edition (ADR-014) support.

## Keeping current users unaffected
1. **Additive schema only.** New tables. New columns are nullable or default
   to today's behaviour (`cashier_station_enabled = false`). No existing
   CHECK, default or column is changed. `migrate:down` drops it all cleanly.
2. **One gate.** Every new code path checks *add-on active **and** branch
   enabled*. That is resolved once per request. When it is false, no
   order-hold query runs, no new UI renders and no polling starts.
3. **The only shared change is the `createSale` refactor**, shipped alone in
   PR 1 with parity tests and no behaviour change, before anything depends
   on it.
4. **No client update needed.** Android, desktop and older web tabs keep
   calling `POST /api/sales` exactly as now. The new `use_cashier` 403 can
   only happen in a branch that an owner has explicitly switched on.
5. **Kill switch.** `CASHIER_STATION_ENABLED` env (default `false` until
   launch) hides the add-on everywhere, including Settings, while the code is
   deployed.
6. **Dark launch, then a pilot.** Deploy with the kill switch off, then grant
   the add-on to one pilot tenant from the operator console, then open
   Settings → Add-ons to everyone.

## Testing
- **RLS:** `counter_order`, `counter_order_item`, `org_addon` added to
  `rls-isolation.test.ts`. `make test-rls` must pass (§2.1).
- **Parity (PR 1):** `createSale` vs. the current route on fixed fixtures
  (cash, M-Pesa with STK claim, split, pack sizes, discounts clamped,
  insufficient stock, unpriced, offline dedupe): same rows, same response.
- **Unit:** order numbering per Nairobi day; hold arithmetic with device
  holds and expired orders; locked pricing; card payment rows; pro-rata
  add-on amount in integer cents.
- **Concurrency:** two cashiers collecting the same order (one 409); a sale
  and a send racing for the last units (no oversell); a collect at the moment
  of expiry.
- **Gating:** every orders route returns `addon_locked` without the add-on or
  with the branch off; direct sale blocked online and allowed offline (and
  listed) in an enabled branch; `orders.*` permissions respected.
- **Playwright:** desk sends → cashier collects with cash, STK (sandbox),
  card and split; remove line; expiry → resend. **Regression:** the existing
  POS e2e suite run unchanged against a tenant without the add-on.

## Delivery plan (one PR each, in order)
1. **Refactor:** `createSale()` extracted, parity tests. No behaviour change.
2. **Schema + entitlements:** migration 046, Drizzle schema, `requireAddon`,
   `orders.*` capabilities (hidden group), kill switch, RLS tests.
3. **Orders API:** send / queue / get / collect / remove-line / cancel /
   resend, holds in every availability check, expiry cron, `use_cashier`
   enforcement, direct-sale flagging.
4. **POS UI:** mode picker, order desk (send, slip, my orders), cashier
   station (queue, scan, pay with card added, release), offline behaviour.
5. **Billing + settings:** Add-ons page, branch toggles, pro-rata activation,
   renewal bundling, webhook, operator grant/revoke, reports' *Sold by* and
   direct-sales list.
6. **Pilot:** one tenant, one branch, two weeks. Then GA and a landing-page /
   pricing update.

Phase 2 (after pilot): Paybill/C2B auto-match by order number, "Now serving"
display, Android modes.

## Open questions
1. Add-on price (KES / month), and whether annual plans get the annual
   discount on it.
2. Pro-rata on activation (recommended), or free until the next renewal?
3. Default hold time: 30 min, or shorter at busy branches?
4. Should order-desk staff hear a "Paid" alert for their orders, or is the
   status strip enough?

## Consequences
- **+** One drawer per branch and clear cash accountability, which is the
  reason owners will pay for this. Faster service at busy counters. Add-on
  billing infrastructure that later add-ons (eTIMS/SHA, Phase 8) can reuse.
- **−** Order holds join every availability calculation in enabled branches.
  Orders can't cross devices while offline (v1 falls back to direct
  checkout). Physical hand-over still depends on staff discipline: the
  software makes it auditable, not impossible.
