# PharmaTrack — Living Context File

> This file is the session resume mechanism. Read it at the start of every new Claude Code session.

## Project Overview

**PharmaTrack** — a web-based pharmacy POS and inventory management system targeting independent pharmacies in Kenya.

- **Tech stack:** Next.js 16.2.5 (App Router), React 19, TypeScript strict, Supabase, shadcn/ui, Tailwind CSS v4, Drizzle ORM, Dexie.js (offline), Upstash Redis, M-Pesa Daraja, Trigger.dev
- **Currency:** KES (numeric(12,2) in DB, displayed via Intl.NumberFormat 'en-KE')
- **Timezone:** UTC stored, Africa/Nairobi (EAT, UTC+3) displayed
- **Receipt format:** `{BRANCH_3_CHARS}-{YYYYMMDD}-{SEQ_4_DIGITS}` e.g. `NAI-20260512-0042`
- **Monorepo root:** `/Users/wycliffkimutai/Desktop/Client Projects/pharmatrack`
- **Web app root:** `apps/web`

---

## Phase Status

| Phase | Description | Status |
|-------|-------------|--------|
| 1 | Scaffolding & Database Foundation | Complete |
| 2 | Authentication & Navigation Shell | Complete |
| 3 | Barcode Engine & Product Lookup | Next |
| 4 | Point of Sale Terminal | Not Started |
| 5 | Inventory Management | Not Started |
| 6 | Staff & Shift Management | Not Started |
| 7 | Owner Dashboard & Reports | Not Started |
| 8 | Settings, Polish & Production | Not Started |

---

## Phase 1 — Completed Tasks

### Task 1.1 — Monorepo Initialisation (COMPLETE)

- Root `pnpm-workspace.yaml` pointing to `apps/*` and `packages/*`
- `apps/web` — Next.js 16.2.5 (App Router, TypeScript strict, Tailwind CSS v4)
  - tsconfig: strict:true, noUncheckedIndexedAccess:true, strictNullChecks:true
  - shadcn/ui initialised, components installed: button, input, label, card, badge, dialog, sheet, table, tabs, select, dropdown-menu, separator, skeleton, avatar, tooltip, command, popover
- `packages/db` (@pharmatrack/db) — Drizzle ORM + drizzle.config.ts
- `packages/types` (@pharmatrack/types) — Shared TypeScript types

**Key packages in apps/web:**
- @supabase/supabase-js @supabase/ssr
- @tanstack/react-query zustand
- dexie (offline IndexedDB)
- zod, gs1js, @upstash/redis @upstash/ratelimit, lucide-react, sonner, @react-pdf/renderer

### Task 1.2 — Supabase Setup (COMPLETE — files created, activate in Supabase dashboard)

- `apps/web/lib/supabase/client.ts` — browser client (createBrowserClient)
- `apps/web/lib/supabase/server.ts` — server client + service role client
- `apps/web/lib/supabase/types.ts` — placeholder (replace with generated types in 1.6)
- `apps/web/middleware.ts` — session refresh, redirect unauthenticated to /login

**Auth roles:** owner, manager, pharmacist, cashier

**Supabase dashboard required:**
- Enable Email auth
- Disable email confirmation (dev mode)

### Task 1.3 — Core Database Schema (COMPLETE — SQL written, apply to Supabase)

**SQL file:** `supabase/migrations/001_initial_schema.sql`

**Tables:**
- organizations — multi-tenant root
- branches — org branches
- profiles — extends auth.users (id = auth.uid())
- shifts — clock in/out records
- categories — product categories
- suppliers — medicine suppliers
- products — medicine catalogue
- product_batches — batch/lot tracking with FEFO
- sales — completed sales
- sale_items — line items (with product snapshots)
- controlled_substance_log — PPB narcotics register

**Views:**
- product_stock — computed stock per product/branch (LEFT JOIN batches with quantity_remaining > 0)

**Functions:**
- generate_receipt_number(branch_id) -> text: format {BRANCH3}-{YYYYMMDD}-{SEQ4}

**Drizzle schema:** all tables in `packages/db/src/schema/*.ts`

### Task 1.4 — RLS Policies (COMPLETE — SQL written, apply to Supabase)

**SQL file:** `supabase/migrations/002_rls.sql`

**Helper functions in auth schema:**
- auth.user_organization_id() — org_id for current user
- auth.user_branch_id() — branch_id for current user
- auth.user_role() — role for current user

**Security model:**
- All data filtered by organization_id (multi-tenancy)
- Branch users (cashier/pharmacist) see only their branch
- Owners/managers see all branches in their org

### Task 1.5 — Seed Data (COMPLETE — SQL written, TypeScript runner ready)

**SQL file:** `supabase/seed/001_dev_seed.sql`
**Runner:** `supabase/seed/run-seed.ts` (requires bcryptjs)

**Fixed UUIDs for easy reference:**
- Org: `a1b2c3d4-0001-0001-0001-000000000001` (Nairobi Pharmacy)
- CBD Branch: `b1b2c3d4-0002-0002-0002-000000000001`
- Westlands Branch: `b1b2c3d4-0002-0002-0002-000000000002`

**Seed credentials (created via run-seed.ts):**
- owner@test.com / Test1234! → role: owner (PIN: 1234)
- pharmacist@test.com / Test1234! → role: pharmacist, CBD Branch (PIN: 2345)
- cashier@test.com / Test1234! → role: cashier, CBD Branch (PIN: 3456)

**15 products seeded** — includes 2 controlled substances (Diazepam 5mg, Tramadol 50mg)
**30 product batches** — 2 per product for CBD Branch

### Task 1.6 — TypeScript Types (COMPLETE)

- Generated from Supabase project `ylrhxbvmunbmhfdphwlh`
- **`apps/web/lib/supabase/database.types.ts`** — full generated schema (11 tables, 1 view, 4 functions)
- **`apps/web/lib/supabase/types.ts`** — re-exports `Database`, `Tables`, `TablesInsert`, `TablesUpdate`, `Enums`
- **`packages/types/src/index.ts`** — self-contained domain types: Organization, Branch, Profile, Product, ProductBatch, ProductStock, Sale, SaleItem, Shift, CartItem, ShiftSummary, etc.

---

## Environment Variables Required

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
DATABASE_URL=
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
MPESA_CONSUMER_KEY=
MPESA_CONSUMER_SECRET=
MPESA_SHORTCODE=
MPESA_PASSKEY=
MPESA_CALLBACK_URL=
TRIGGER_API_KEY=
NEXT_PUBLIC_APP_URL=
```

Place these in `apps/web/.env.local` (see `.env.local.example`)

---

## Design System

**File:** `docs/design/tokens.css`

Key tokens:
- Brand: `--pt-green: #16a34a`, `--pt-green-600: #15803d`
- Background: `--pt-bg: #f9fafb`, Surface: `--pt-surface: #ffffff`
- Font: Inter (primary), JetBrains Mono (monospace)
- Border radius: 6-16px

**Screens designed (in docs/design/screens/):**
1. login.jsx — email + PIN tab login
2. pos.jsx — POS terminal + Cash/Mpesa/Split/Receipt modals
3. dashboard.jsx — Owner KPI dashboard
4. inventory.jsx — Inventory list with badges
5. staff.jsx — Staff management card grid
6. settings.jsx — Settings + live receipt preview
7. stock-receive.jsx — Stock receiving workflow
8. shift-report.jsx — Shift report table with variance

---

## Phase 2 — Completed Tasks

### Task 2.1 — Auth Proxy & Login Page (COMPLETE)

- `apps/web/proxy.ts` — Next.js 16 auth proxy (replaces middleware.ts; Next.js 16 breaking change)
  - Exports `proxy` function + `config` matcher
  - Redirects unauthenticated users to `/login`; redirects authenticated users away from `/login`
- `apps/web/app/(auth)/layout.tsx` — centered auth layout
- `apps/web/app/(auth)/login/page.tsx` — login page
- `apps/web/app/(auth)/login/actions.ts` — server actions: `signInWithEmail`, `signInWithPin`, `signOut`
  - PIN login: phone → profile lookup → bcrypt verify → magic link OTP → session exchange
- `apps/web/components/auth/LoginForm.tsx` — email/PIN tab switcher
- `apps/web/components/auth/PinLoginForm.tsx` — PIN numpad + phone input

### Task 2.2 — App Shell (COMPLETE)

- `apps/web/components/layout/Sidebar.tsx` — collapsible sidebar, role-filtered nav, user footer with sign-out
- `apps/web/components/layout/AppTopBar.tsx` — top bar with breadcrumb, notifications, avatar
- `apps/web/components/layout/BranchSelector.tsx` — dropdown for owners/managers with >1 branch
- `apps/web/app/(dashboard)/layout.tsx` — dashboard shell: fetches profile + branches, wraps in Providers
- `apps/web/app/(dashboard)/dashboard/page.tsx` — KPI placeholder grid (Phase 7 will populate)

### Task 2.3 — POS Shell & Shifts (COMPLETE)

- `apps/web/app/(pos)/layout.tsx` — POS layout wrapping PosShell with profile + branches
- `apps/web/app/(pos)/pos/page.tsx` — POS placeholder (Phase 4 will build full terminal)
- `apps/web/components/pos/PosShell.tsx` — POS top bar, shift gating (clock-in required), clock-out button
- `apps/web/components/pos/ClockInDialog.tsx` — full-screen mandatory gate with opening float
- `apps/web/components/pos/ClockOutDialog.tsx` — closing cash + variance display
- `apps/web/app/api/shifts/route.ts` — POST (clock-in) + PATCH (clock-out) with auth + validation
- `apps/web/lib/hooks/useActiveShift.ts` — TanStack Query hook for active shift polling

### Task 2.4 — Session & UI Stores (COMPLETE)

- `apps/web/lib/store/sessionStore.ts` — Zustand: profile + branches
- `apps/web/lib/store/uiStore.ts` — Zustand + persist: sidebar collapsed, activeBranchId
- `apps/web/components/providers.tsx` — QueryClientProvider + SessionInit (syncs server data to Zustand)
- `apps/web/app/layout.tsx` — Sonner `<Toaster />` added at root

### next.config.ts changes (Phase 2)

- Removed `reactCompiler: true` — caused OOM crashes with Turbopack (too much Babel overhead)
- Added `serverExternalPackages: ['@react-pdf/renderer', '@react-pdf/yoga']` — prevents WASM bundling crash

---

## Key Architectural Decisions

- **FEFO:** Always sell from earliest-expiring batch
- **Never hard-delete:** Use is_active = false
- **Multi-tenancy:** Every query must include org_id (enforced by RLS + explicit)
- **Quantity model:** Always in base units (tablets, ml, g) in DB; display in packs in UI
- **Receipt numbers:** Generated server-side via PostgreSQL function (never from client)
- **Offline:** Dexie.js IndexedDB for product cache + sales queue; sync on reconnect
