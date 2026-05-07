# PharmaTrack — Claude Code Build Prompt
## A Production-Grade Pharmacy POS & Inventory Management System

**How to use this document:**
Paste one PHASE at a time into Claude Code. Complete the verification checklist at the end of each phase before moving to the next. If a session ends mid-phase, resume by pasting the "Session Resume" block at the top of the phase you were in, then continue from where you left off.

---

## PROJECT OVERVIEW

Build **PharmaTrack** — a web-based pharmacy POS and inventory management system targeting independent pharmacies and small chains in Kenya. The system must work offline, support tablet-level medicine dispensing, capture batch/expiry data from GS1 barcodes, and give owners real-time visibility into sales, staff activity, and stock levels.

**Target users:** Pharmacist/cashier (daily POS use), pharmacy owner (dashboard & reports), chain manager (multi-branch oversight).

**Core principles:**
- Offline-first: all sales must complete without internet, syncing when connectivity returns
- Scan-first: every workflow should be operable primarily via barcode scanner
- Kenya-specific: M-Pesa STK Push as primary payment method, KES currency, PPB compliance hooks
- Speed: POS checkout must complete in under 10 keystrokes from scan to receipt

---

## TECH STACK

```
Frontend:     Next.js 15 (App Router), React 19, TypeScript strict
UI:           shadcn/ui, Tailwind CSS v4
Database:     Supabase (PostgreSQL + Row Level Security)
Auth:         Supabase Auth (email/password + PIN for cashier mode)
Realtime:     Supabase Realtime (stock sync across tabs/terminals)
Caching:      Upstash Redis (product lookup cache, session rate limiting)
Offline:      Dexie.js (IndexedDB wrapper) + Next.js Service Worker
Jobs:         Trigger.dev (expiry alerts, daily reports, low-stock notifications)
Payments:     M-Pesa Daraja API (STK Push), cash (manual)
Receipts:     @react-pdf/renderer + WebUSB ESC/POS for thermal printers
Barcode:      Custom HID keyboard listener + gs1js for GS1 parsing
State:        Zustand (UI state), TanStack Query v5 (server state)
Validation:   Zod
ORM:          Drizzle ORM (type-safe queries against Supabase PostgreSQL)
Testing:      Vitest (unit), Playwright (E2E)
Deployment:   Vercel (Phase 1), Docker Swarm on VPS (Phase 2)
```

---

## MONOREPO STRUCTURE

```
pharmatrack/
├── apps/
│   └── web/                    # Next.js app
│       ├── app/
│       │   ├── (auth)/         # Login, PIN entry
│       │   ├── (dashboard)/    # Owner dashboard
│       │   ├── (pos)/          # POS terminal
│       │   ├── (inventory)/    # Stock management
│       │   ├── (staff)/        # Employee management
│       │   ├── (reports)/      # Analytics & reports
│       │   └── api/            # API routes
│       ├── components/
│       │   ├── ui/             # shadcn/ui components
│       │   ├── pos/            # POS-specific components
│       │   ├── inventory/      # Inventory components
│       │   └── shared/         # Shared components
│       └── lib/
│           ├── supabase/       # Supabase client & types
│           ├── barcode/        # GS1 parser & scanner hook
│           ├── offline/        # Dexie schema & sync logic
│           ├── mpesa/          # Daraja API client
│           └── store/          # Zustand stores
├── packages/
│   ├── db/                     # Drizzle schema & migrations
│   └── types/                  # Shared TypeScript types
├── supabase/
│   ├── migrations/             # SQL migrations
│   └── seed/                   # Development seed data
└── docs/
    └── CONTEXT.md              # Living document updated after each phase
```

---

## LIVING CONTEXT FILE

At the end of every phase, update `docs/CONTEXT.md` with:
- What was built
- Key decisions made
- Database tables created
- Environment variables added
- Anything incomplete or deferred

**This file is the session resume mechanism.** At the start of every new Claude Code session, read `docs/CONTEXT.md` first.

---
---

# PHASE 1 — Project Scaffolding & Database Foundation

**Goal:** Working Next.js project connected to Supabase, with the complete database schema deployed and seed data loaded.

**Estimated time:** 2–3 hours

---

## Session Resume Block (paste this if resuming Phase 1)

```
Read docs/CONTEXT.md first. We are building PharmaTrack — a pharmacy POS system.
We are in Phase 1: Project scaffolding and database schema.
Check what's already done in CONTEXT.md and continue from where we left off.
```

---

## Task 1.1 — Initialise the monorepo

```
Create a new monorepo called `pharmatrack` using the following structure:

1. Initialise the root with pnpm workspaces. Create pnpm-workspace.yaml pointing 
   to apps/* and packages/*.

2. Create apps/web as a Next.js 15 app with:
   - App Router
   - TypeScript strict mode (noUncheckedIndexedAccess: true, strictNullChecks: true)
   - Tailwind CSS v4
   - ESLint + Biome for formatting (no Prettier)
   - src/ directory: NO (use app/ at root of apps/web)

3. Create packages/db with:
   - package.json name: @pharmatrack/db
   - Drizzle ORM installed
   - drizzle.config.ts pointing to supabase connection string from env

4. Create packages/types with:
   - package.json name: @pharmatrack/types
   - index.ts exporting shared interfaces

5. Install in apps/web:
   @supabase/supabase-js @supabase/ssr
   @tanstack/react-query zustand
   dexie
   zod
   gs1js (for GS1 barcode parsing)
   @upstash/redis @upstash/ratelimit
   lucide-react
   sonner (toast notifications)

6. Install shadcn/ui and add these components:
   button, input, label, card, badge, dialog, sheet, 
   table, tabs, select, dropdown-menu, separator, 
   skeleton, avatar, tooltip, command, popover

7. Create .env.local.example with all required env vars documented:
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

8. Create docs/CONTEXT.md with initial project description.
```

**Verification 1.1:**
```
- [ ] pnpm install completes with no errors
- [ ] pnpm --filter web dev starts without errors on localhost:3000
- [ ] TypeScript strict mode is active (tsconfig shows strict: true)
- [ ] shadcn/ui Button component renders on the home page
- [ ] docs/CONTEXT.md exists
```

---

## Task 1.2 — Supabase project setup & auth configuration

```
Set up Supabase authentication and the multi-tenant foundation.

1. Create lib/supabase/client.ts — browser client using createBrowserClient from @supabase/ssr
2. Create lib/supabase/server.ts — server client using createServerClient from @supabase/ssr 
   with cookie handling for Next.js App Router
3. Create middleware.ts at apps/web root — refresh session on every request, 
   redirect unauthenticated users away from protected routes
4. Create lib/supabase/types.ts — placeholder for generated Database types 
   (will be populated after schema is created)

Auth roles to support:
- owner: full access, can see all branches, all reports, manage staff
- manager: access to their assigned branch only, can manage inventory and staff
- pharmacist: POS + inventory receive only
- cashier: POS only, no inventory management

Enable in Supabase dashboard (document in CONTEXT.md):
- Email auth
- Disable email confirmation for development
```

**Verification 1.2:**
```
- [ ] lib/supabase/client.ts and server.ts exist and TypeScript passes
- [ ] middleware.ts redirects unauthenticated requests to /login
- [ ] Visiting /dashboard while logged out redirects to /login
```

---

## Task 1.3 — Core database schema

```
Create the complete database schema in packages/db/schema/.
Write each table as a separate Drizzle schema file, then create an index.ts 
that exports all of them.

Also write the equivalent raw SQL in supabase/migrations/001_initial_schema.sql
so it can be applied via the Supabase dashboard or CLI.

TABLES TO CREATE:

--- Multi-tenancy ---

organizations
  id: uuid primary key default gen_random_uuid()
  name: text not null
  registration_number: text (PPB registration)
  phone: text
  email: text
  address: text
  logo_url: text
  settings: jsonb default '{}'  (stores: currency, tax_rate, receipt_footer, etc.)
  created_at: timestamptz default now()

branches
  id: uuid primary key
  organization_id: uuid references organizations(id)
  name: text not null
  address: text
  phone: text
  is_active: boolean default true
  created_at: timestamptz

--- Staff ---

profiles (extends Supabase auth.users)
  id: uuid primary key (same as auth.users.id)
  organization_id: uuid references organizations(id)
  branch_id: uuid references branches(id) nullable (null = all branches)
  full_name: text not null
  phone: text
  role: text not null check role in ('owner','manager','pharmacist','cashier')
  pin_hash: text (bcrypt hash of 4-digit PIN for quick cashier login)
  is_active: boolean default true
  created_at: timestamptz

shifts
  id: uuid primary key
  branch_id: uuid references branches(id)
  staff_id: uuid references profiles(id)
  clocked_in_at: timestamptz not null
  clocked_out_at: timestamptz nullable
  opening_float: numeric(12,2) default 0
  closing_cash: numeric(12,2) nullable
  notes: text
  created_at: timestamptz

--- Products & Inventory ---

categories
  id: uuid primary key
  organization_id: uuid references organizations(id)
  name: text not null
  created_at: timestamptz

suppliers
  id: uuid primary key
  organization_id: uuid references organizations(id)
  name: text not null
  phone: text
  email: text
  address: text
  created_at: timestamptz

products
  id: uuid primary key
  organization_id: uuid references organizations(id)
  category_id: uuid references categories(id) nullable
  
  -- Identity
  name: text not null               (generic/INN name e.g. "Amoxicillin")
  brand_name: text                  (e.g. "Amoxil")
  manufacturer: text
  gtin: text                        (GS1 GTIN-13 / EAN-13, indexed)
  barcode_raw: text                 (raw barcode if not GS1, indexed)
  
  -- Pharmaceutical details
  strength: text                    (e.g. "500mg", "250mg/5ml")
  dosage_form: text                 (tablet, capsule, syrup, cream, injection, etc.)
  
  -- Unit of measure hierarchy
  base_unit: text not null          (the smallest sellable unit: "tablet","ml","g","unit")
  pack_label: text                  (what a full pack is called: "Box","Bottle","Tube")
  units_per_pack: integer default 1 (how many base_units in one pack)
  
  -- Pricing (in KES)
  cost_price: numeric(12,2)         (per base unit)
  selling_price: numeric(12,2) not null (per base unit)
  
  -- Inventory control
  reorder_level: integer default 10 (in base units)
  reorder_quantity: integer default 100 (suggested order qty in base units)
  
  -- Regulatory
  is_controlled: boolean default false  (narcotics, psychotropics)
  requires_prescription: boolean default false
  
  -- Metadata
  is_active: boolean default true
  created_by: uuid references profiles(id)
  created_at: timestamptz
  updated_at: timestamptz

product_batches
  id: uuid primary key
  product_id: uuid references products(id)
  branch_id: uuid references branches(id)
  supplier_id: uuid references suppliers(id) nullable
  
  batch_number: text not null
  expiry_date: date not null
  manufactured_date: date nullable
  
  quantity_received: integer not null    (in base units)
  quantity_remaining: integer not null   (in base units, decremented on sale)
  cost_price: numeric(12,2)             (cost at time of this purchase)
  
  received_at: timestamptz default now()
  received_by: uuid references profiles(id)
  purchase_order_id: uuid nullable       (reference to future PO table)
  
  notes: text
  created_at: timestamptz

IMPORTANT CONSTRAINT: Add a check that quantity_remaining >= 0 and quantity_remaining <= quantity_received.

-- Stock view (computed current stock per product per branch)
-- Create as a PostgreSQL VIEW not a table:
CREATE VIEW product_stock AS
SELECT 
  p.id as product_id,
  p.organization_id,
  pb.branch_id,
  p.name,
  p.base_unit,
  p.selling_price,
  p.reorder_level,
  p.is_controlled,
  COALESCE(SUM(pb.quantity_remaining), 0) as stock_on_hand,
  MIN(pb.expiry_date) as earliest_expiry,
  COUNT(pb.id) as batch_count
FROM products p
LEFT JOIN product_batches pb ON pb.product_id = p.id AND pb.quantity_remaining > 0
GROUP BY p.id, p.organization_id, pb.branch_id, p.name, p.base_unit, 
         p.selling_price, p.reorder_level, p.is_controlled;

--- Sales ---

sales
  id: uuid primary key
  branch_id: uuid references branches(id)
  shift_id: uuid references shifts(id) nullable
  cashier_id: uuid references profiles(id)
  
  -- Status
  status: text default 'completed' check in ('completed','voided','refunded')
  
  -- Totals
  subtotal: numeric(12,2) not null
  discount_amount: numeric(12,2) default 0
  tax_amount: numeric(12,2) default 0
  total_amount: numeric(12,2) not null
  
  -- Payment
  payment_method: text not null check in ('cash','mpesa','card','credit','split')
  amount_tendered: numeric(12,2)   (for cash, what was given)
  change_given: numeric(12,2)
  mpesa_reference: text            (M-Pesa transaction code)
  
  -- Customer (optional)
  customer_name: text
  customer_phone: text
  
  -- Metadata
  receipt_number: text unique not null  (human-readable: BR-001-20240115-0042)
  notes: text
  voided_at: timestamptz
  voided_by: uuid references profiles(id)
  created_at: timestamptz default now()

sale_items
  id: uuid primary key
  sale_id: uuid references sales(id) on delete cascade
  product_id: uuid references products(id)
  batch_id: uuid references product_batches(id) nullable
  
  product_name: text not null          (snapshot at time of sale)
  product_strength: text               (snapshot)
  base_unit: text not null             (snapshot)
  
  quantity: integer not null           (in base units)
  unit_price: numeric(12,2) not null   (per base unit at time of sale)
  discount_percent: numeric(5,2) default 0
  line_total: numeric(12,2) not null
  
  created_at: timestamptz

-- IMPORTANT: sale_items snapshots product name/price so historical records
-- are accurate even if the product is later edited or deleted.

--- Narcotics Register ---
-- Required by PPB for controlled substances

controlled_substance_log
  id: uuid primary key
  branch_id: uuid references branches(id)
  product_id: uuid references products(id)
  batch_id: uuid references product_batches(id)
  
  transaction_type: text check in ('received','dispensed','destroyed','adjusted')
  quantity: integer not null
  balance_after: integer not null
  
  sale_id: uuid references sales(id) nullable
  patient_name: text
  prescriber_name: text
  prescription_number: text
  
  recorded_by: uuid references profiles(id)
  created_at: timestamptz

--- Receipt number sequence function ---
CREATE OR REPLACE FUNCTION generate_receipt_number(p_branch_id uuid)
RETURNS text AS $$
DECLARE
  branch_code text;
  today_str text;
  seq integer;
BEGIN
  SELECT LEFT(name, 3) INTO branch_code FROM branches WHERE id = p_branch_id;
  today_str := TO_CHAR(NOW(), 'YYYYMMDD');
  SELECT COUNT(*) + 1 INTO seq 
  FROM sales 
  WHERE branch_id = p_branch_id 
    AND DATE(created_at) = CURRENT_DATE;
  RETURN UPPER(branch_code) || '-' || today_str || '-' || LPAD(seq::text, 4, '0');
END;
$$ LANGUAGE plpgsql;
```

**Verification 1.3:**
```
- [ ] supabase/migrations/001_initial_schema.sql runs with no errors
- [ ] All tables appear in Supabase dashboard Table Editor
- [ ] product_stock VIEW returns data when product_batches has rows
- [ ] generate_receipt_number() function works in SQL editor
- [ ] Drizzle schema files compile with no TypeScript errors
- [ ] Run: pnpm --filter @pharmatrack/db generate (produces drizzle output)
```

---

## Task 1.4 — Row Level Security policies

```
Write RLS policies for every table. Apply them in supabase/migrations/002_rls.sql.

The security model:
- Every authenticated user belongs to an organization (via profiles table)
- Users can only see data belonging to their organization
- Branch-level users can only see data for their assigned branch
- Owners and managers can see all branches in their organization

Helper functions to create first:

CREATE OR REPLACE FUNCTION auth.user_organization_id()
RETURNS uuid AS $$
  SELECT organization_id FROM profiles WHERE id = auth.uid()
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION auth.user_branch_id()
RETURNS uuid AS $$
  SELECT branch_id FROM profiles WHERE id = auth.uid()
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION auth.user_role()
RETURNS text AS $$
  SELECT role FROM profiles WHERE id = auth.uid()
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

RLS POLICIES:

Enable RLS on: organizations, branches, profiles, shifts, categories, 
suppliers, products, product_batches, sales, sale_items, 
controlled_substance_log

For each table, create SELECT/INSERT/UPDATE/DELETE policies following this logic:

organizations:
  SELECT: id = auth.user_organization_id()
  (no direct INSERT/UPDATE from client — done via service role)

branches:
  SELECT: organization_id = auth.user_organization_id()
  INSERT/UPDATE: role IN ('owner','manager') AND organization_id = auth.user_organization_id()

profiles:
  SELECT: organization_id = auth.user_organization_id()
  UPDATE: id = auth.uid() OR auth.user_role() IN ('owner','manager')

products:
  SELECT: organization_id = auth.user_organization_id()
  INSERT/UPDATE/DELETE: auth.user_role() IN ('owner','manager','pharmacist')
                        AND organization_id = auth.user_organization_id()

product_batches:
  SELECT: check organization_id via JOIN to products
  INSERT: auth.user_role() IN ('owner','manager','pharmacist')
  UPDATE: auth.user_role() IN ('owner','manager','pharmacist')

sales:
  SELECT: branch_id = auth.user_branch_id() 
          OR auth.user_role() IN ('owner','manager')
  INSERT: branch_id = auth.user_branch_id()
          AND auth.user_role() IN ('owner','manager','pharmacist','cashier')

sale_items:
  SELECT/INSERT: via sale_id ownership (check sale's branch_id)

shifts:
  SELECT: staff_id = auth.uid() OR auth.user_role() IN ('owner','manager')
  INSERT: staff_id = auth.uid()
  UPDATE: staff_id = auth.uid() OR auth.user_role() IN ('owner','manager')
```

**Verification 1.4:**
```
- [ ] 002_rls.sql runs without errors
- [ ] RLS is enabled on all tables (verify in Supabase dashboard → Table → RLS)
- [ ] Test with Supabase SQL editor using SET request.jwt.claims... to simulate 
      different roles and confirm data isolation works
- [ ] Owner can see all branches; cashier can only see their branch
```

---

## Task 1.5 — Seed data for development

```
Create supabase/seed/001_dev_seed.sql with:

1. One organization: "Nairobi Pharmacy" 
2. Two branches: "CBD Branch", "Westlands Branch"
3. Three staff members:
   - owner@test.com / password: Test1234! / role: owner
   - pharmacist@test.com / password: Test1234! / role: pharmacist (CBD Branch)
   - cashier@test.com / password: Test1234! / role: cashier (CBD Branch)
4. Five product categories: Antibiotics, Analgesics, Antifungals, Vitamins, OTC General
5. Three suppliers: Dawa Limited, Cosmos Limited, Elys Chemical Industries
6. Fifteen realistic medicines (Kenyan pharmacy common stock) with:
   - GTINs (use real EAN-13 format: 13 digits starting with 6)
   - Correct base_unit (tablet, ml, g, unit)
   - Realistic selling prices in KES
   - requires_prescription flags
   - At least 2 controlled substances

   Include these medicines:
   Amoxicillin 500mg caps (pack of 28), Paracetamol 500mg tabs (pack of 100),
   Metronidazole 200mg tabs (pack of 30), Ibuprofen 400mg tabs (pack of 30),
   Cotrimoxazole 480mg tabs (pack of 28), Fluconazole 150mg caps (single),
   ORS Sachet (single), Omeprazole 20mg caps (pack of 30),
   Albendazole 400mg tabs (single), Vitamin C 500mg tabs (pack of 30),
   Diazepam 5mg tabs - CONTROLLED (pack of 30), 
   Tramadol 50mg caps - CONTROLLED (pack of 30),
   Chloramphenicol Eye Drops (5ml bottle), Salbutamol Inhaler 100mcg,
   Zinc Sulfate 20mg tabs (pack of 60)

7. Two product batches per product for CBD Branch with:
   - Realistic batch numbers
   - Expiry dates spread across 2025-2027
   - One batch per product already partially used

Also create a TypeScript seed runner at supabase/seed/run-seed.ts that:
- Uses Supabase service role client
- Creates the auth.users entries via supabase.auth.admin.createUser()
- Then inserts the profile records
- Then runs the SQL seed file
- Is idempotent (can be run multiple times safely)
```

**Verification 1.5:**
```
- [ ] pnpm seed runs without errors
- [ ] Can log in as owner@test.com in the browser
- [ ] Supabase Table Editor shows 15 products, 30 batches (2 per product)
- [ ] product_stock VIEW returns stock quantities for CBD Branch
- [ ] Both controlled substances have is_controlled = true
```

---

## Task 1.6 — Generate Supabase TypeScript types & update CONTEXT.md

```
1. Run: npx supabase gen types typescript --local > apps/web/lib/supabase/database.types.ts
   (or use the Supabase dashboard API if local CLI is not set up)

2. Update lib/supabase/client.ts and server.ts to use the Database type:
   createBrowserClient<Database>(url, key)

3. Create packages/types/index.ts with these domain types built from the 
   generated Database types:

   export type Organization = Database['public']['Tables']['organizations']['Row']
   export type Branch = Database['public']['Tables']['branches']['Row']
   export type Profile = Database['public']['Tables']['profiles']['Row']
   export type Product = Database['public']['Tables']['products']['Row']
   export type ProductBatch = Database['public']['Tables']['product_batches']['Row']
   export type Sale = Database['public']['Tables']['sales']['Row']
   export type SaleItem = Database['public']['Tables']['sale_items']['Row']
   export type Shift = Database['public']['Tables']['shifts']['Row']

   Also export these composite types:
   
   export type ProductWithStock = Product & {
     stock_on_hand: number
     earliest_expiry: string | null
     batch_count: number
   }
   
   export type SaleWithItems = Sale & {
     items: (SaleItem & { product: Pick<Product, 'name' | 'strength' | 'dosage_form'> })[]
     cashier: Pick<Profile, 'full_name'>
   }

   export type CartItem = {
     product: ProductWithStock
     batch_id: string | null
     quantity: number          // in base units
     unit_price: number
     discount_percent: number
     line_total: number
   }

4. Update docs/CONTEXT.md:
   - Mark Phase 1 as complete
   - List all tables created
   - List all env vars needed
   - Note the seed credentials
   - Document the receipt number format
```

**Verification 1.6:**
```
- [ ] database.types.ts exists and has no TypeScript errors
- [ ] All imports from @pharmatrack/types resolve correctly
- [ ] CartItem type is exported and used correctly
- [ ] docs/CONTEXT.md is up to date
- [ ] Full TypeScript check passes: pnpm tsc --noEmit
```

---
---

# PHASE 2 — Authentication & Navigation Shell

**Goal:** Complete auth flow (email login, PIN quick-login for cashiers), role-based navigation, and the main app shell.

**Session Resume Block:**
```
Read docs/CONTEXT.md first. We are building PharmaTrack — a pharmacy POS system.
We completed Phase 1 (database schema). Now starting Phase 2: Auth & navigation shell.
Check CONTEXT.md for credentials and schema details.
```

---

## Task 2.1 — Login page & session management

```
Build the authentication UI at app/(auth)/login/page.tsx.

Design requirements:
- Clean, professional pharmacy aesthetic — white background, green accent (#16a34a)
- PharmaTrack logo (text-based, no image needed yet)
- Email + password form
- "Quick PIN login" tab for cashiers (4-digit PIN pad, shows after entering phone number)
- Error messages shown inline, not as alerts
- Loading states on submit buttons
- Redirect to /pos after cashier login, /dashboard after owner/manager/pharmacist login

Implement:
1. app/(auth)/login/page.tsx — the login page
2. app/(auth)/login/actions.ts — server actions for signIn, signInWithPin
3. components/auth/LoginForm.tsx — email/password form
4. components/auth/PinLoginForm.tsx — phone + PIN pad
5. app/(auth)/layout.tsx — centered layout for auth pages

PIN login logic:
- User enters their phone number
- System looks up profiles by phone, gets their branch
- User enters 4-digit PIN
- Verify: bcrypt.compare(enteredPin, profile.pin_hash)
- Create Supabase session via service role (supabase.auth.admin.createSession)
- Set session cookies

After login:
- Owner/manager → /dashboard
- Pharmacist → /inventory (or /pos)
- Cashier → /pos
```

**Verification 2.1:**
```
- [ ] Can log in as owner@test.com → redirected to /dashboard
- [ ] Can log in as cashier@test.com → redirected to /pos
- [ ] Wrong password shows inline error (not a page refresh)
- [ ] Logout clears session and redirects to /login
- [ ] Middleware protects all non-auth routes
```

---

## Task 2.2 — App shell & navigation

```
Build the main application shell that wraps all authenticated pages.

Create app/(dashboard)/layout.tsx (and app/(pos)/layout.tsx as a separate minimal shell):

MAIN SHELL (for dashboard, inventory, staff, reports):
- Sidebar navigation (collapsible, 240px expanded / 64px icon-only collapsed)
- Top bar: branch selector (owners see all branches), user avatar menu, 
  notifications bell (badge count for low stock + expiring items)
- Role-based nav items:
  
  Always visible:
    POS Terminal (icon: ShoppingCart)
  
  Pharmacist + above:
    Inventory (icon: Package)
    Stock Receive (icon: PackagePlus)
  
  Manager + above:
    Staff (icon: Users)
    Shifts (icon: Clock)
  
  Owner only:
    Reports (icon: BarChart3)
    Settings (icon: Settings)

POS SHELL (minimal, distraction-free):
- Top bar only: branch name, current shift status, cashier name, clock
- Button to return to main app

Implement:
1. app/(dashboard)/layout.tsx
2. app/(pos)/layout.tsx  
3. components/layout/Sidebar.tsx
4. components/layout/TopBar.tsx
5. components/layout/BranchSelector.tsx
6. lib/store/uiStore.ts — Zustand store for sidebar collapsed state, active branch

The active branch is critical: all data queries must filter by the selected branch.
Store branch_id in Zustand. Owners can switch branches from the top bar dropdown.
```

**Verification 2.2:**
```
- [ ] Sidebar shows correct nav items for each role (test with all three seed accounts)
- [ ] Sidebar collapses to icon-only on click
- [ ] Branch selector shows "Nairobi Pharmacy — CBD Branch" for cashier
- [ ] Owner sees branch dropdown with both branches
- [ ] Mobile: sidebar is a drawer (Sheet component) triggered by hamburger icon
- [ ] Active route is highlighted in sidebar
```

---

## Task 2.3 — Shift management (clock in/out)

```
Implement shift clock-in/out as a gate before the POS can be used.

Logic:
- When a cashier/pharmacist navigates to /pos, check if they have an active shift
- If no active shift: show ClockInDialog (mandatory, cannot dismiss)
- ClockInDialog: shows current time, asks for opening float amount, confirm button
- After clock-in: shift record is created, POS unlocks

Clock-out:
- Button in POS top bar: "End Shift"
- Shows: shift duration, number of sales, total cash collected, expected float
- Asks for closing cash amount (physical count)
- Calculates variance (closing_cash - opening_float - cash_sales)
- Saves shift record with clocked_out_at

Implement:
1. components/pos/ClockInDialog.tsx
2. components/pos/ClockOutDialog.tsx
3. app/api/shifts/route.ts — POST to create shift, PATCH to close shift
4. lib/hooks/useActiveShift.ts — hook that checks for active shift

Owner/manager are not required to clock in (they don't operate the POS directly),
but their visits to the POS screen still log a shift for audit purposes.
```

**Verification 2.3:**
```
- [ ] Visiting /pos without active shift shows ClockInDialog (cannot dismiss)
- [ ] Entering opening float and confirming creates a shift record in database
- [ ] ClockInDialog closes and POS loads after clock-in
- [ ] "End Shift" button shows correct shift summary
- [ ] Closing cash variance is calculated correctly
- [ ] Shift record updated with clocked_out_at in database
```

---
---

# PHASE 3 — Barcode Engine & Product Lookup

**Goal:** Fast, robust barcode scanning with GS1 parsing, product lookup with caching, and the new product registration flow.

**Session Resume Block:**
```
Read docs/CONTEXT.md first. We are building PharmaTrack — a pharmacy POS system.
We completed Phase 2 (auth + navigation). Now starting Phase 3: Barcode engine.
```

---

## Task 3.1 — Global barcode scanner listener

```
Implement a global keyboard listener that captures barcode scanner input.

Barcode scanners connected via USB HID or Bluetooth emit keystrokes extremely 
fast (full barcode in <50ms) followed by an Enter keypress. This is distinct 
from human typing.

Create lib/barcode/useBarcodeScanner.ts:

interface BarcodeScanEvent {
  raw: string           // the full raw string from scanner
  type: 'EAN13' | 'EAN8' | 'CODE128' | 'CODE39' | 'GS1_128' | 'DATAMATRIX' | 'QR' | 'UNKNOWN'
  gtin?: string         // extracted GTIN if GS1
  batchNumber?: string  // extracted from GS1 AI (10)
  expiryDate?: Date     // extracted from GS1 AI (17)
  serialNumber?: string // extracted from GS1 AI (21)
}

Hook behaviour:
- Listens on document keydown events
- Buffers characters; if >2 chars arrive within 50ms, treat as scanner input
- On Enter (or after 100ms timeout with >3 buffered chars): process the scan
- Debounce: ignore scans within 300ms of each other (prevent double-scan)
- Emit an onScan callback with the parsed BarcodeScanEvent
- Only active when the hook is mounted (unmount removes listener)

GS1 parsing (use gs1js library):
- Detect GS1 by presence of FNC1 character (ASCII 29) or symbology identifier ]d2
- Extract Application Identifiers:
  (01) = GTIN-14 → trim leading zero for GTIN-13
  (17) = Expiry YYMMDD → parse, handle day=00 as last day of month
  (10) = Batch/Lot number
  (21) = Serial number
- For plain EAN-13: just a 13-digit string, no AIs

Create lib/barcode/barcodeParser.ts with pure functions (no DOM):
  parseBarcode(raw: string): BarcodeScanEvent
  isGS1(raw: string): boolean
  parseGS1(raw: string): Partial<BarcodeScanEvent>
  detectBarcodeType(raw: string): BarcodeScanEvent['type']
  normalizeGTIN(gtin: string): string  // ensure 13 digits, strip leading zeros from 14
```

**Verification 3.1:**
```
- [ ] Unit tests in lib/barcode/__tests__/barcodeParser.test.ts pass for:
    - Plain EAN-13: "6901028075909" → type: 'EAN13', gtin: '6901028075909'
    - GS1-128 with expiry+batch: parse correctly
    - Expiry with day=00: maps to last day of month
    - 14-digit GTIN with leading zero: normalised to 13 digits
- [ ] useBarcodeScanner fires correctly in a test page when text is typed rapidly
- [ ] Human typing (>100ms between keystrokes) does NOT trigger onScan
- [ ] pnpm vitest passes all barcode tests
```

---

## Task 3.2 — Product lookup API with caching

```
Build a fast product lookup endpoint used by both POS and stock-receive flows.

Create app/api/products/lookup/route.ts:
  GET /api/products/lookup?barcode=6901028075909&branch_id=...
  
Logic:
1. Check Upstash Redis cache first: key = `product:${orgId}:${barcode}`
   Cache TTL: 1 hour. Return cached result immediately if found.

2. If cache miss: query Supabase
   SELECT products + product_stock view WHERE gtin = barcode OR barcode_raw = barcode
   AND organization_id = user's org
   
3. If found: cache it, return ProductWithStock

4. If not found: query open GS1 database APIs in this order:
   a. Open Food Facts: GET https://world.openfoodfacts.org/api/v0/product/{barcode}.json
      Extract: product_name, brands, quantity
   b. If not found there, return { found: false, gtin: barcode }
   
5. Response shape:
   {
     found: boolean
     product?: ProductWithStock     // if already in system
     suggestion?: {                  // if found in external DB but not in system
       name: string
       manufacturer: string
       gtin: string
     }
   }

Also create:
- lib/hooks/useProductLookup.ts — React hook wrapping the API call with TanStack Query
- The hook accepts a barcode string and returns { data, isLoading, isError }
- Cache the result in TanStack Query for 5 minutes (stale-while-revalidate)
```

**Verification 3.2:**
```
- [ ] GET /api/products/lookup?barcode=6901028075909 returns a product from seed data
- [ ] Second request (within 1hr) is served from Redis cache (check Redis dashboard)
- [ ] Unknown barcode returns { found: false }
- [ ] A barcode that exists on Open Food Facts returns a suggestion object
- [ ] Response time for cached lookup: <20ms
```

---

## Task 3.3 — New product registration flow

```
When a scan returns { found: false }, the pharmacist must register the product.
Build a guided registration form that pre-fills whatever data is available.

Create components/inventory/NewProductDialog.tsx:

A multi-step dialog (not a page):
  Step 1 — Identity (pre-filled from scan/suggestion):
    - Generic name (required)
    - Brand name (optional)
    - Manufacturer (optional)
    - GTIN (pre-filled, read-only if came from scan)
    
  Step 2 — Pharmaceutical details:
    - Strength (text field: "500mg", "250mg/5ml")
    - Dosage form (select: Tablet, Capsule, Syrup, Cream, Gel, Injection, Drops, Inhaler, Sachet, Other)
    - Category (select from categories table)
    - Requires prescription? (toggle)
    - Controlled substance? (toggle — if yes, extra warning shown)
    
  Step 3 — Units & Pricing (critical for tablet-level dispensing):
    - Base unit (select: tablet, capsule, ml, g, unit)
    - Pack label (text: "Box", "Bottle", "Strip")
    - Units per pack (number: e.g. 28 for a box of 28 tablets)
    - Cost price per base unit (calculated: show "or enter pack cost: ____")
      Helper: if they enter KES 280 for a 28-tablet box → KES 10.00 per tablet
    - Selling price per base unit
    - Margin shown live as a percentage
    - Reorder level (in base units)
    
  Step 4 — Confirm & First Batch:
    - Summary of the product being created
    - Batch number (from scan if GS1, otherwise text field)
    - Expiry date (from scan if GS1, otherwise date picker)
    - Quantity received (number)
    - Supplier (select from suppliers, optional)

On submit: 
- POST /api/products (create product)
- POST /api/batches (create first batch)
- Invalidate product lookup cache for this GTIN
- Close dialog, emit the new product back to the calling context

Include form validation with Zod at every step.
Show step progress indicator (1 of 4).
```

**Verification 3.3:**
```
- [ ] Scan an unknown barcode → dialog opens
- [ ] If Open Food Facts has the product → Step 1 is pre-filled
- [ ] Step 3 pack cost calculator works: entering 280 KES for 28 tablets 
      shows 10.00 KES per tablet
- [ ] Margin percentage updates live as prices change
- [ ] Completing all 4 steps creates product + batch in database
- [ ] Product is immediately available for scanning after registration
- [ ] Controlled substance toggle shows warning message
```

---
---

# PHASE 4 — Point of Sale (POS) Terminal

**Goal:** The primary cashier interface. Fast, keyboard-operable, offline-capable sale processing with M-Pesa and cash payments.

**Session Resume Block:**
```
Read docs/CONTEXT.md first. We are building PharmaTrack — a pharmacy POS system.
We completed Phase 3 (barcode engine). Now starting Phase 4: POS terminal.
```

---

## Task 4.1 — POS layout & cart state

```
Build the POS terminal page at app/(pos)/pos/page.tsx.

LAYOUT (two-column, full viewport height):
  Left column (60% width): Cart
    - Cart items list (product name, qty, unit, price, line total)
    - Empty state: "Scan a product or search to begin"
    - Cart footer: subtotal, discount, tax, TOTAL (large)
    - Payment buttons: CASH | M-PESA | SPLIT
    
  Right column (40% width): Product lookup
    - Search input (always focused when no dialog is open)
    - Recent products (last 10 scanned, for quick re-add)
    - Scan status indicator (green flash on successful scan)

Cart behaviour:
- Scan arrives → immediate product lookup → item added to cart
- If product not found → NewProductDialog opens
- Clicking a cart item expands it to show: qty stepper, discount field, remove button
- Quantity in base units, displayed in human form:
  "3 tablets", "2 strips (28 tabs each = 56 tablets)", "150ml"

Create lib/store/cartStore.ts (Zustand):
  State:
    items: CartItem[]
    discount_global: number      (global discount %)
    note: string
    customer_name: string
    customer_phone: string
  
  Actions:
    addItem(product: ProductWithStock, quantity: number, batch_id?: string): void
    updateQuantity(productId: string, quantity: number): void
    updateItemDiscount(productId: string, discountPercent: number): void
    removeItem(productId: string): void
    clearCart(): void
    setGlobalDiscount(percent: number): void
  
  Computed (derive from items):
    subtotal: number
    discountAmount: number
    taxAmount: number
    total: number

FEFO batch selection:
When adding an item to cart, automatically select the batch with 
the earliest expiry date that has sufficient stock.
If multiple batches are needed (qty > single batch stock), split across batches.
```

**Verification 4.1:**
```
- [ ] POS page loads and the search input is auto-focused
- [ ] Scanning seed product barcode adds it to cart instantly
- [ ] Cart totals update correctly on every change
- [ ] Quantity stepper works: increment/decrement updates line total
- [ ] Global discount of 10% correctly reduces total
- [ ] Removing last item shows empty state
- [ ] Cart state persists across page refreshes (Zustand persist middleware)
```

---

## Task 4.2 — Cash payment flow

```
Implement the cash payment checkout flow.

When "CASH" button is clicked:
1. Open CashPaymentDialog
2. Show order total prominently
3. Tendered amount input (large, numeric keyboard friendly)
4. Real-time change calculation: change = tendered - total
5. Quick amount buttons: [Exact] [500] [1000] [2000] [5000] (KES denominations)
6. "CONFIRM SALE" button (disabled until tendered >= total)

On confirm:
- POST /api/sales with full cart data + payment_method: 'cash'
- Server creates sale + sale_items records atomically (use Supabase transaction)
- Server decrements product_batches.quantity_remaining
- Server generates receipt_number via generate_receipt_number() function
- If product is_controlled: server creates controlled_substance_log entry
- Return sale ID + receipt number
- Open receipt dialog

Create app/api/sales/route.ts:
  POST handler that:
  1. Validates request body with Zod schema
  2. Begins Supabase transaction (use RPC or multiple operations)
  3. Creates sale record
  4. For each cart item:
     a. Creates sale_item record (with product name snapshot)
     b. Decrements product_batches.quantity_remaining (FEFO order)
     c. If product.is_controlled: creates controlled_substance_log entry
  5. Returns { sale, receiptNumber }
  
Error handling:
- If any product is out of stock at checkout time: return specific error
- If batch quantity insufficient: re-run FEFO selection and retry once
```

**Verification 4.2:**
```
- [ ] Cash dialog opens with order total
- [ ] Entering KES 1000 for KES 750 sale shows "Change: KES 250.00"
- [ ] [Exact] button fills tendered with exact total amount
- [ ] Confirm creates sale record in database
- [ ] product_batches.quantity_remaining is decremented correctly
- [ ] Receipt number is in correct format (e.g. NAI-20260512-0001)
- [ ] Controlled substance sale creates controlled_substance_log entry
- [ ] After successful sale: cart is cleared, ready for next customer
```

---

## Task 4.3 — M-Pesa STK Push payment

```
Implement M-Pesa STK Push (Lipa na M-Pesa) payment flow.

Create lib/mpesa/daraja.ts:
  - getAccessToken(): fetch OAuth token from Daraja API
  - stkPush(phone: string, amount: number, reference: string): initiate push
  - querySTKStatus(checkoutRequestId: string): poll for completion
  
  Use the sandbox for development (api.safaricom.co.ke for prod, 
  sandbox.safaricom.co.ke for dev).

M-Pesa payment flow:
1. Cashier clicks "M-PESA"
2. MpesaPaymentDialog opens:
   - Phone number input (pre-filled with customer_phone if set)
   - Amount shown (editable for partial payment)
   - "Send STK Push" button
3. On send: POST /api/payments/mpesa/initiate
   - Formats phone: strip leading 0, prefix 254 (e.g. 0712345678 → 254712345678)
   - Calls stkPush API
   - Returns checkoutRequestId
4. Dialog shows: "Check your phone — enter M-Pesa PIN to confirm"
   - Countdown timer: 60 seconds
   - Polling: every 5 seconds, GET /api/payments/mpesa/status?id=...
5. On success (ResultCode: 0):
   - Store MpesaReceiptNumber (e.g. RGQ45HTYS8)
   - Proceed with sale creation (same as cash flow, payment_method: 'mpesa')
6. On timeout or failure: show error, allow retry or switch to cash

Create app/api/payments/mpesa/initiate/route.ts
Create app/api/payments/mpesa/status/route.ts
Create app/api/payments/mpesa/callback/route.ts (for production webhook)

Note: In sandbox, STK Push always succeeds. The callback URL must be HTTPS —
use ngrok in development and document the setup in CONTEXT.md.
```

**Verification 4.3:**
```
- [ ] M-Pesa dialog opens and shows phone input
- [ ] Phone number normalisation: 0712345678 → 254712345678
- [ ] STK Push API call succeeds in Daraja sandbox
- [ ] Polling detects success and closes dialog
- [ ] Sale is created with payment_method: 'mpesa' and mpesa_reference stored
- [ ] Timeout after 60 seconds shows error state with retry option
```

---

## Task 4.4 — Receipt generation & printing

```
Generate and optionally print receipts after every sale.

CREATE components/pos/ReceiptDialog.tsx:
- Modal that shows immediately after successful sale
- Shows formatted receipt:
  - Pharmacy name, branch, address, phone
  - Receipt number, date, time
  - Cashier name
  - Line items: name | qty | unit price | total
  - Subtotal, discount, tax, TOTAL
  - Payment method + reference
  - Change given (if cash)
  - Footer: "Thank you for your business"
  - "Powered by PharmaTrack"

Buttons:
- PRINT (if thermal printer connected)
- DOWNLOAD PDF
- SHARE (WhatsApp link — for mobile, creates wa.me link with receipt text)
- NEW SALE (closes dialog, ready for next customer)

PDF generation (for download):
Create lib/receipt/generateReceiptPDF.ts using @react-pdf/renderer.
Receipt should be styled to fit 80mm thermal paper width (approximately 302px at 96dpi).

Thermal printer (WebUSB):
Create lib/receipt/thermalPrinter.ts:
- requestDevice(): prompt user to select USB printer
- connect(): open connection and claim interface
- printReceipt(receipt: ReceiptData): send ESC/POS commands
  - ESC/POS commands needed:
    - ESC @ (initialize)
    - ESC ! (text formatting: double width for totals)
    - GS V (cut paper)
    - Line feed commands
    - Text encoding: UTF-8 with proper byte conversion

Store selected printer in localStorage. Auto-reconnect on page load.
Show printer status indicator in POS top bar (green = connected, gray = no printer).
```

**Verification 4.4:**
```
- [ ] Receipt dialog opens after every successful sale
- [ ] Receipt shows all correct fields from the sale
- [ ] PDF download works and is formatted correctly for 80mm width
- [ ] WhatsApp share generates a correctly formatted text receipt
- [ ] NEW SALE clears cart and closes dialog
- [ ] If WebUSB is available: printer selection prompt works
```

---

## Task 4.5 — Offline mode with Dexie.js sync

```
Make the POS work completely offline.

Create lib/offline/db.ts — Dexie database:

class PharmaTrackDB extends Dexie {
  products: Dexie.Table<OfflineProduct, string>
  sales_queue: Dexie.Table<OfflineSale, string>
  
  constructor() {
    super('pharmatrack')
    this.version(1).stores({
      products: 'id, gtin, barcode_raw, name',
      sales_queue: 'id, created_at, synced'
    })
  }
}

OfflineProduct: a flattened version of ProductWithStock, updated from server on login.
OfflineSale: full sale + items, with synced: boolean flag.

Create lib/offline/syncManager.ts:

class SyncManager {
  syncProducts(): fetch all products for branch from Supabase, store in Dexie
  syncPendingSales(): find all sales where synced=false, POST each to /api/sales
  
  // Called on every API request:
  isOnline(): boolean  // navigator.onLine + connectivity test
}

Modify product lookup (Task 3.2) to:
1. Check Dexie first (always — fastest path)
2. If not found in Dexie AND online: check Supabase + cache in Dexie
3. If offline AND not found in Dexie: show "Product not found offline. Connect to add."

Modify sale creation (Task 4.2) to:
1. If online: POST to /api/sales as normal
2. If offline: save to sales_queue in Dexie (synced: false), show toast 
   "Sale saved offline — will sync when connected"

Create lib/offline/useOnlineStatus.ts hook:
- Listen to window online/offline events
- When coming online: trigger syncPendingSales()
- Show banner in POS: "OFFLINE MODE — Sales will sync when connected" (amber bar)
```

**Verification 4.5:**
```
- [ ] Open POS, disconnect internet — amber "OFFLINE MODE" banner appears
- [ ] Scan product → found from Dexie cache
- [ ] Complete a cash sale while offline → sale saved to Dexie, cart clears normally
- [ ] Reconnect internet → offline sale appears in Supabase within 5 seconds
- [ ] Online sale flow continues to work normally when connected
- [ ] Run pnpm playwright test pos.spec.ts (offline scenario)
```

---
---

# PHASE 5 — Inventory Management

**Goal:** Stock receiving via barcode scan, stock adjustments, expiry tracking, and reorder alerts.

**Session Resume Block:**
```
Read docs/CONTEXT.md first. We are building PharmaTrack — a pharmacy POS system.
We completed Phase 4 (POS terminal). Now starting Phase 5: Inventory management.
```

---

## Task 5.1 — Stock receive (goods inward)

```
Build the stock receiving workflow at app/(dashboard)/inventory/receive/page.tsx.

This is how new deliveries are entered into the system.

LAYOUT:
- Left: scan/search panel (same barcode listener as POS)
- Right: receiving list (products being received in this session)
- Bottom: "Post Receiving" button with total items count

WORKFLOW:
1. Pharmacist scans a box from the delivery
2. System looks up the product:
   a. Found: shows product card with current stock level
   b. Not found: opens NewProductDialog (Task 3.3)
3. If GS1 DataMatrix/QR barcode: batch number + expiry are pre-filled
4. ReceiveItemDialog opens with:
   - Product name (read-only)
   - Batch number (pre-filled from scan or editable)
   - Expiry date (pre-filled from scan or date picker)
   - Quantity (in packs — auto-converts to base units)
     Show: "12 boxes × 28 tablets = 336 tablets"
   - Cost price (optional, updates product.cost_price if entered)
   - Supplier (select)
5. "Add to Receiving" saves to local state (not DB yet)
6. After all items are entered: "Post Receiving" 
   - Creates product_batches records for all items
   - Updates stock levels
   - If any product had a purchase order: links the batch

Show live stock level after receive: "Paracetamol 500mg: 48 → 384 tablets"

Handle duplicates: if same product is scanned twice, ask:
"This product is already in the list. Add another batch or increase quantity?"
```

**Verification 5.1:**
```
- [ ] Scan product from seed data → shows product card with current stock
- [ ] GS1 DataMatrix scan → batch number and expiry pre-filled
- [ ] Quantity conversion displays correctly (e.g. "12 boxes × 28 = 336 tablets")
- [ ] Post Receiving creates product_batches records in database
- [ ] product_stock VIEW updates immediately after posting
- [ ] Scanning same product twice shows the duplicate warning
```

---

## Task 5.2 — Inventory list & stock status

```
Build app/(dashboard)/inventory/page.tsx — the main inventory view.

Features:
- Searchable, filterable product table
- Columns: Name | Strength | Form | Stock (with base unit) | 
           Batches | Earliest Expiry | Reorder Level | Status | Actions
- Status badge logic:
  🔴 Out of Stock: stock_on_hand = 0
  🟠 Low Stock: stock_on_hand <= reorder_level
  🟡 Expiring Soon: earliest_expiry within 60 days
  🟢 OK: everything else
  🔵 Controlled: is_controlled = true (always shown alongside other status)

Filters:
- Category (select)
- Status (all/low stock/expiring/out of stock/controlled)
- Search (name, brand, GTIN)
- Sort: name, stock level, expiry date

Actions per row:
- View batches (expand row to show batch details)
- Adjust stock (manual adjustment with reason)
- Edit product details

Stock adjustment dialog:
- Shows current stock per batch
- Type: Addition / Reduction / Write-off
- Quantity (in base units)
- Reason (Damaged / Expired / Count Correction / Return to Supplier / Other)
- Notes field
- Creates an audit log entry (extend product_batches or create stock_adjustments table)

EXPIRY DASHBOARD section (above the table):
Three cards:
- Expired: count of items with expiry_date < today
- Expiring within 30 days: count + list
- Expiring within 60 days: count + list
```

**Verification 5.2:**
```
- [ ] Inventory page loads all 15 seed products
- [ ] Status badges show correctly (set a batch to expiry in 20 days to test)
- [ ] Search by name filters correctly
- [ ] Filtering by "Low Stock" shows only items at/below reorder level
- [ ] Stock adjustment dialog saves to database
- [ ] Row expansion shows batch details (batch number, expiry, qty remaining)
- [ ] Expiry dashboard cards show correct counts
```

---

## Task 5.3 — Low stock alerts with Trigger.dev

```
Create background jobs for automated alerts.

Create trigger/jobs/stockAlerts.ts:

Job 1: dailyStockCheck (runs every day at 7:00 AM EAT)
  - Query all products where stock_on_hand <= reorder_level for each branch
  - Query all batches expiring within 60 days
  - For each branch with issues: send an alert
  - Alert delivery for MVP: create a notifications record in database
    (real SMS/email can be added later)

Create notifications table migration (add to a new migration file):
  id: uuid pk
  organization_id: uuid
  branch_id: uuid
  type: text ('low_stock' | 'expiring_soon' | 'expired' | 'system')
  title: text
  message: text
  product_id: uuid nullable
  is_read: boolean default false
  created_at: timestamptz

Job 2: expiryCheck (runs every day at 7:00 AM EAT)
  - Mark batches as expired where expiry_date < today AND quantity_remaining > 0
  - Create notification for each expired batch

Create app/api/notifications/route.ts:
  GET: return unread notifications for user's org/branch
  PATCH /:id: mark as read

Wire up the bell icon in TopBar (Task 2.2):
  - Show unread count as a badge
  - Dropdown shows 5 most recent notifications
  - Link to /notifications for full list

Register Trigger.dev jobs in trigger/index.ts and configure in trigger.config.ts.
```

**Verification 5.3:**
```
- [ ] Trigger.dev dashboard shows both jobs registered
- [ ] Manually trigger dailyStockCheck → creates notifications for low-stock products
- [ ] Bell icon in TopBar shows correct unread count
- [ ] Clicking a notification marks it as read
- [ ] Notification dropdown shows product name and stock level
```

---
---

# PHASE 6 — Staff & Shift Management

**Goal:** Employee management, shift history, and per-employee performance reporting.

**Session Resume Block:**
```
Read docs/CONTEXT.md first. We are building PharmaTrack — a pharmacy POS system.
We completed Phase 5 (inventory management). Now starting Phase 6: Staff management.
```

---

## Task 6.1 — Employee management

```
Build app/(dashboard)/staff/page.tsx.

Features:
- List all staff members in the organization (grouped by branch)
- Add new employee form:
  - Full name, email (for login), phone (for PIN login)
  - Role (select: manager/pharmacist/cashier)
  - Branch assignment (or "All branches" for manager)
  - Initial PIN (4 digits, confirm field)
  - Auto-generate temporary email password
- Edit employee: update details, change role, change branch, reset PIN
- Deactivate (not delete) employee: is_active = false
  - Deactivated employees cannot log in
  - Their historical records are preserved

Staff detail page (/staff/[id]):
- Employee info card
- Today's shift status (clocked in / not clocked in)
- This month's shifts table (date, clock in, clock out, duration, sales count, cash collected)
- Quick stats: average sales per shift, total revenue this month

Create server action: createStaffMember()
- Creates Supabase auth user via admin API (service role)
- Creates profile record
- Hashes PIN with bcrypt before storing
- Sends welcome email (placeholder for now)
```

**Verification 6.1:**
```
- [ ] Staff list shows 3 seed employees grouped by branch
- [ ] Creating a new employee creates auth.users + profiles records
- [ ] New employee can log in with their email + password
- [ ] New employee can log in with their phone + PIN
- [ ] Deactivating an employee prevents login (test this)
- [ ] Staff detail page shows shift history
```

---

## Task 6.2 — Shift reports & time tracking

```
Build app/(dashboard)/shifts/page.tsx.

Owner/manager view:
- Date range picker (default: today)
- Branch filter
- Table: Employee | Clock In | Clock Out | Duration | Sales Count | Cash | M-Pesa | Variance
- Export to CSV button

Variance column:
  variance = closing_cash - opening_float - (sum of cash sales in that shift)
  Positive = overage (more cash than expected)
  Negative = shortage (less cash than expected)
  Color code: green for ±50 KES, amber for ±200 KES, red for >200 KES

Shift detail view (/shifts/[id]):
- Full shift info
- List of all sales made during this shift
  (link each sale to its receipt)
- Payment method breakdown (cash vs M-Pesa vs card)

MY SHIFTS view (for cashiers/pharmacists — they see only their own):
- This week's shifts
- Total hours worked
- Total sales completed
```

**Verification 6.2:**
```
- [ ] Clock-in and clock-out times display in EAT timezone (UTC+3)
- [ ] Variance calculation is correct for seed sales
- [ ] CSV export downloads a properly formatted file
- [ ] Cashier viewing /shifts only sees their own shifts
- [ ] Manager sees all shifts for their branch
- [ ] Owner sees all shifts across all branches
```

---
---

# PHASE 7 — Owner Dashboard & Reports

**Goal:** Real-time overview for owners and managers. Sales analytics, revenue trends, and top products.

**Session Resume Block:**
```
Read docs/CONTEXT.md first. We are building PharmaTrack — a pharmacy POS system.
We completed Phase 6 (staff management). Now starting Phase 7: Dashboard and reports.
```

---

## Task 7.1 — Owner dashboard (real-time)

```
Build app/(dashboard)/page.tsx — the main dashboard.

Real-time Supabase subscription:
- Subscribe to INSERT on sales table (filtered by branch)
- Every new sale updates the dashboard totals live

DASHBOARD LAYOUT:

Row 1 — Today's KPI cards (4 cards):
  - Today's Revenue: sum of today's sales total
  - Transactions: count of today's completed sales
  - Average Basket: revenue / transactions
  - Cash vs M-Pesa: split percentage

Row 2 — Revenue chart (last 30 days, bar chart using Recharts)
  - X axis: date, Y axis: KES revenue
  - Color code: completed vs voided sales

Row 3 — Two panels:
  Left: Today's Sales Activity (live table, last 10 sales)
    Columns: Time | Cashier | Items | Total | Payment | Receipt#
  Right: Stock Alerts
    - Out of stock items (red)
    - Low stock items (orange)  
    - Expiring within 30 days (yellow)
    Each item links to inventory

Row 4 — Top 10 Products (by revenue this month, horizontal bar chart)

For multi-branch owners: all charts have branch selector (or "All Branches" combined view).

All charts use Recharts with the green brand color palette.
All monetary values: Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' })
```

**Verification 7.1:**
```
- [ ] Dashboard loads with today's stats from seed data
- [ ] Making a sale in another tab updates the dashboard live (Supabase Realtime)
- [ ] Revenue chart renders correctly for last 30 days
- [ ] Stock alerts section shows the low-stock/expiring products from seed data
- [ ] KES formatting is correct (e.g. "KSh 1,250.00")
- [ ] All charts are responsive (test at 1024px and 1440px width)
```

---

## Task 7.2 — Sales reports

```
Build app/(dashboard)/reports/sales/page.tsx.

Filters:
- Date range (presets: Today, Yesterday, This Week, This Month, Custom)
- Branch (for owners)
- Payment method
- Staff member

Report sections:

1. Summary table:
   Period | Revenue | Transactions | Avg Basket | Discount Given | 
   Cash | M-Pesa | Card | Tax Collected

2. Sales by hour of day (line chart — useful for staffing decisions)

3. Payment method breakdown (donut chart)

4. Void/refund log:
   Date | Receipt# | Original Amount | Reason | Voided By

5. Sales transaction table (paginated, 50 per page):
   DateTime | Receipt# | Cashier | Items | Total | Payment | Actions(view)

Export options:
- Download as CSV (all transactions for the selected period)
- Download as PDF (summary report with charts as static images)

Create app/(dashboard)/reports/inventory/page.tsx:

1. Stock valuation: total cost value of current inventory (sum of cost_price × stock_on_hand)
2. Slow-moving stock: products with zero sales in last 30 days
3. Fast-moving stock: top 20 products by units sold
4. Expiry waste report: batches that expired with remaining stock
5. Purchase history: what was received from each supplier, with totals
```

**Verification 7.2:**
```
- [ ] Date range presets work correctly
- [ ] CSV export is correctly formatted and includes all columns
- [ ] Voided sales appear in the void log
- [ ] Slow-moving stock report shows products not sold recently
- [ ] Inventory valuation matches manual calculation from seed data
- [ ] Reports are accessible to owner only (test with cashier account — should get 403)
```

---
---

# PHASE 8 — Settings, Polish & Production Readiness

**Goal:** Organization settings, receipt customisation, the controlled substances register, and production deployment preparation.

**Session Resume Block:**
```
Read docs/CONTEXT.md first. We are building PharmaTrack — a pharmacy POS system.
We completed Phase 7 (dashboard & reports). Now starting Phase 8: Settings and production readiness.
```

---

## Task 8.1 — Organization & branch settings

```
Build app/(dashboard)/settings/page.tsx (owner only).

Sections:

1. Organization Profile:
   - Name, registration number (PPB), logo upload (Supabase Storage)
   - Contact: phone, email, address
   - Tax rate (default 16% VAT, toggle on/off)
   - Currency (KES — locked for now)

2. Receipt Customisation:
   - Receipt header (pharmacy name auto-filled)
   - Tagline (e.g. "Your health is our priority")
   - Footer message (e.g. "Goods once sold are not refundable")
   - Show/hide: tax line, cashier name, branch address
   - Live receipt preview updates as settings change

3. Branch Management:
   - List branches, add new branch, edit branch details
   - Each branch: name, address, phone, is_active toggle

4. Inventory Settings:
   - Default expiry alert threshold (days): 30/60/90
   - Low stock alert method: dashboard only / SMS / email (SMS/email = future)

5. User Preferences (per-user, not org-wide):
   - Default view after login
   - Receipt auto-print (if printer connected)

Store all org settings in the organizations.settings JSONB column.
Use Zod to validate the settings shape before saving.
```

**Verification 8.1:**
```
- [ ] Saving organization name updates it across the app header
- [ ] Receipt preview updates live as footer text is edited
- [ ] Adding a new branch creates it in database and it appears in branch selector
- [ ] Logo upload works (stored in Supabase Storage, URL saved to organizations.logo_url)
- [ ] Settings page is only accessible to owners (403 for other roles)
```

---

## Task 8.2 — Controlled substances register

```
Build app/(dashboard)/reports/controlled-substances/page.tsx.

This is a legally required register for PPB compliance — treat it as read-only 
audit trail, never editable after creation.

Register view:
- Product selector (only shows is_controlled products)
- Date range filter
- Table matching PPB narcotics register format:
  Date | Reference | Type | Patient Name | Prescriber | Rx Number | 
  Qty Dispensed | Qty Received | Running Balance
  
Running balance is calculated by iterating all log entries in date order.

Export:
- Print-friendly PDF formatted as the official PPB register format
- CSV export

The register is auto-populated:
- When a controlled substance is sold → controlled_substance_log entry (Task 4.2)
- When a controlled substance is received → log entry created in Task 5.1

Add a manual entry form for:
- Destruction of expired controlled substances (requires two-person sign-off fields)
- Adjustments discovered during physical count
```

**Verification 8.2:**
```
- [ ] Register shows entries for both controlled substance seed products
- [ ] Running balance calculates correctly across dates
- [ ] Selling a controlled substance in POS creates a log entry immediately
- [ ] Receiving a controlled substance in goods-in creates a log entry
- [ ] PDF export is formatted cleanly for printing
- [ ] Manual destruction entry requires two staff name fields
```

---

## Task 8.3 — End-to-end tests & production checklist

```
Write Playwright E2E tests covering the most critical flows.

Create tests/ directory with:

tests/auth.spec.ts:
  - Login as owner → reaches dashboard
  - Login as cashier → reaches POS  
  - Logout → redirected to login
  - Invalid credentials → shows error

tests/pos.spec.ts:
  - Clock in → scan product → cash sale → receipt shown → cart cleared
  - Scan unknown barcode → new product dialog opens
  - Cash: change calculation correct
  - Offline: disable network → make sale → re-enable → sale syncs

tests/inventory.spec.ts:
  - Receive goods: scan → fill form → post → stock increases
  - Low stock product appears in alerts
  - Expiring product appears in expiry dashboard

tests/reports.spec.ts:
  - Owner can access reports
  - Cashier cannot access reports (403)
  - CSV download triggers file download

PRODUCTION CHECKLIST (document in docs/DEPLOYMENT.md):

Environment variables audit:
  - [ ] All NEXT_PUBLIC_ vars are safe to expose to browser
  - [ ] SUPABASE_SERVICE_ROLE_KEY is never sent to client
  - [ ] MPESA keys are only used in server-side routes
  - [ ] All secrets are in Vercel environment variables (not in code)

Security:
  - [ ] RLS is enabled on every table (verify in Supabase)
  - [ ] No direct table access bypasses RLS
  - [ ] Rate limiting on /api/payments/mpesa/initiate (5 per minute per IP)
  - [ ] Rate limiting on /api/auth/pin-login (10 attempts per hour)
  - [ ] Receipt number is generated server-side (never trusted from client)

Performance:
  - [ ] Product lookup cached in Redis (verify cache hit rate)
  - [ ] Database indexes on: products.gtin, products.barcode_raw, 
        sales.branch_id + created_at, product_batches.product_id + expiry_date
  - [ ] Images served via Supabase Storage CDN

Vercel deployment:
  - [ ] next.config.ts has proper security headers (CSP, X-Frame-Options)
  - [ ] Edge middleware for session refresh
  - [ ] Service Worker registered for offline mode
  - [ ] pnpm build passes with 0 TypeScript errors and 0 ESLint errors
```

**Verification 8.3:**
```
- [ ] pnpm playwright test passes all specs (>80% pass rate acceptable for MVP)
- [ ] pnpm build completes with 0 errors
- [ ] pnpm tsc --noEmit passes
- [ ] Vercel deployment succeeds and app loads at production URL
- [ ] Can complete a full sale flow on the deployed version
- [ ] RLS verified: logging in as cashier@test.com cannot access owner data via API
```

---
---

# APPENDIX A — Key Design Decisions Reference

Keep this section in mind throughout all phases. If a question arises about any of 
these decisions, default to what is documented here.

**Currency:** All amounts stored as numeric(12,2) in KES. Never use floating point.
Displayed as: Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' })

**Timezone:** All timestamps stored as UTC in PostgreSQL. Displayed in Africa/Nairobi (EAT, UTC+3).
Use: new Date().toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' })

**Quantity model:**
- product_batches.quantity_remaining: always in base units (tablets, ml, g)
- CartItem.quantity: always in base units
- UI may display in packs ("2 boxes") but always converts to base units before saving
- Never store fractional quantities (integer only)

**Deleted records:** Never hard-delete. Always set is_active = false.
Exception: sale_items can be hard-deleted only as part of a void (which creates a new 
void record referencing the original sale).

**Receipt numbers:** Generated server-side using the PostgreSQL function. Format:
{BRANCH_3_CHARS}-{YYYYMMDD}-{SEQUENCE_4_DIGITS}. Example: NAI-20260512-0042.
Sequence resets daily per branch.

**Barcode precedence:** When looking up a product, check gtin first, then barcode_raw.
A product can have both (gtin from GS1, barcode_raw for legacy codes).

**FEFO:** Always sell from the earliest-expiring batch. Never auto-expire a batch 
(pharmacist must manually write off expired stock).

**Multi-tenancy isolation:** Every query to the database MUST include the 
organization_id filter (enforced by RLS, but also explicit in every query for 
defense-in-depth).

---

# APPENDIX B — Env Variable Quick Reference

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...   # Server only, never exposed to client
DATABASE_URL=postgresql://...       # For Drizzle direct connection

# Upstash Redis
UPSTASH_REDIS_REST_URL=https://xxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=xxx

# M-Pesa Daraja
MPESA_CONSUMER_KEY=xxx
MPESA_CONSUMER_SECRET=xxx
MPESA_SHORTCODE=174379              # Sandbox: 174379
MPESA_PASSKEY=xxx
MPESA_CALLBACK_URL=https://yourapp.vercel.app/api/payments/mpesa/callback

# Trigger.dev
TRIGGER_API_KEY=tr_dev_xxx

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

# APPENDIX C — Session Resume Template

Copy and paste this at the start of any new Claude Code session:

```
Read docs/CONTEXT.md first and tell me:
1. Which phase we are in
2. What was last completed
3. What comes next

Then continue from where we left off.

Project: PharmaTrack — pharmacy POS and inventory management system
Stack: Next.js 15, Supabase, TypeScript strict, shadcn/ui, Dexie.js (offline), 
       Upstash Redis, M-Pesa Daraja, Trigger.dev
```
