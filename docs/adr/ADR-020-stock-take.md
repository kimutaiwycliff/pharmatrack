# ADR-020 — Stock take, shelf by shelf
**Status:** Accepted (2026-10-28)

## Context
Pharmacies count stock the way it sits: department by department, shelf by
shelf, writing down each batch, its expiry and how many are left. PharmaTrack
only offered a per-batch "Count correction" inside each product's batches
sheet, and Receive stock is built for a supplier delivery (search one product,
add a batch). New pharmacies also had to make three passes over the same list
(pick products in Quick Start, price them, add stock), which is where most of
them stall.

## Decision
- **A Stock take mode**, separate from Delivery (tabs on Receive stock, and an
  entry from Inventory). One screen serves two jobs:
  - **Count** — compare the shelf with recorded stock and fix the differences.
  - **Setup** — a new pharmacy adds products, prices and stock in one walk
    from the shared catalogue (curated list first; the PPB register behind
    "Show all" and search). One row creates the product and its batch.
- **Shelves** are the pharmacy's own categories (two levels), plus the default
  departments/subcategories (`packages/core` taxonomy) that the catalogue uses,
  so a new pharmacy has shelves before it has products. New products land in
  the matching department/subcategory, created on first use
  (`resolveDefaultCategory`, as when adding a product by hand).
- **Sessions are saved on the server** (`stock_count`, `stock_count_line`,
  migration 042, RLS deny-by-default): autosave, continue later or on another
  device, two people counting different shelves. Each line records who
  counted it and when; line ids come from the client so a retried save is an
  upsert, never a duplicate.
- **Expected quantity is captured per line, at the moment it is counted**, by
  the server (never from the client). Posting applies
  `counted − expected` to the batch's *current* quantity (never below zero),
  so sales made while the shelf was being counted are not reported as missing.
- **Prices in setup are confirmed per product.** The catalogue's reference
  price is shown as a suggestion; it is saved only if the person types a price
  or taps "Use KES n" on that row. A product without a confirmed price is
  created inactive ("Needs price", the existing KES 0 rule) and can't be sold.
- **Who can do what** (permissions, editable per pharmacy):
  - new `stock.count` — count and save (owner, manager, pharmacist by default);
  - posting differences needs `stock.adjust` (owner, manager) **unless** every
    difference is small (≤ 2 units and ≤ KES 1,000 at cost) and none is on a
    controlled drug — then whoever counted can post it. Otherwise the session
    goes to "Waiting for approval";
  - setup lines also need `products.create` and `stock.receive`; confirming a
    price on an existing product needs `products.edit`.
- **Posting** is one transaction: `stock_adjustment` (count correction) per
  changed batch, new `product_batch` rows for batches found, new products for
  catalogue rows, a `controlled_substance_log` row for controlled changes, and
  one `audit_log` row (`stock_take.post`) with the totals. A posted session is
  read-only; posting twice is a no-op.
- **Hide recorded quantity** while counting is a per-session option, on by
  default for counts (people otherwise "find" the number they expect), off
  for setup.

## Phases
1. Web + desktop: shelves, count list, setup with per-product prices, saved
   sessions, scanning, review, posting, CSV report.
2. Approval list, recount suggestion, printable count sheets, "last counted"
   on the dashboard, onboarding guide wired to setup.
3. Android (offline), cycle-count schedule and reminders.

## Consequences
- Wedge scanners now send the GS1 separator correctly in the browser
  (Ctrl+] → ASCII 29, `wedgeKeyChar`), so a 2D pack fills batch and expiry.
  Android reads scans as text and may still drop the separator; that needs a
  native key hook (phase 3).
- The catalogue has no GTINs. A scan that matches nothing can be attached to
  the row being counted, which teaches the pharmacy's barcodes as it goes.
- Quick Start stays as the 15-minute "try the till" route. It still seeds
  catalogue reference prices; setup mode is the careful route.
