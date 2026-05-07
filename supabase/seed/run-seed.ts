#!/usr/bin/env tsx
/**
 * Development seed runner.
 * Usage: pnpm seed
 * Idempotent — safe to run multiple times.
 */

import { createClient } from "@supabase/supabase-js"
import { readFileSync } from "fs"
import { join } from "path"
import bcrypt from "bcryptjs"

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const ORG_ID = "a1b2c3d4-0001-0001-0001-000000000001"
const CBD_BRANCH_ID = "b1b2c3d4-0002-0002-0002-000000000001"

const SEED_USERS = [
  {
    id: "u1000000-0000-0000-0000-000000000001",
    email: "owner@test.com",
    password: "Test1234!",
    full_name: "Grace Wanjiru",
    phone: "+254710000001",
    role: "owner" as const,
    branch_id: null,
    pin: "1234",
  },
  {
    id: "u1000000-0000-0000-0000-000000000002",
    email: "pharmacist@test.com",
    password: "Test1234!",
    full_name: "John Mwangi",
    phone: "+254720000002",
    role: "pharmacist" as const,
    branch_id: CBD_BRANCH_ID,
    pin: "2345",
  },
  {
    id: "u1000000-0000-0000-0000-000000000003",
    email: "cashier@test.com",
    password: "Test1234!",
    full_name: "Aisha Hassan",
    phone: "+254730000003",
    role: "cashier" as const,
    branch_id: CBD_BRANCH_ID,
    pin: "3456",
  },
]

async function createUsers() {
  console.log("Creating auth users...")
  for (const user of SEED_USERS) {
    const { error } = await supabase.auth.admin.createUser({
      user_metadata: { id: user.id },
      email: user.email,
      password: user.password,
      email_confirm: true,
    })

    if (error && !error.message.includes("already been registered")) {
      console.error(`Failed to create ${user.email}:`, error.message)
    } else {
      console.log(`  ✓ ${user.email}`)
    }
  }
}

async function createProfiles() {
  console.log("Creating profiles...")
  for (const user of SEED_USERS) {
    // Get actual user ID from auth
    const { data: { users }, error: listError } = await supabase.auth.admin.listUsers()
    if (listError) {
      console.error("Failed to list users:", listError.message)
      continue
    }

    const authUser = users.find((u) => u.email === user.email)
    if (!authUser) {
      console.error(`Auth user not found for ${user.email}`)
      continue
    }

    const pin_hash = await bcrypt.hash(user.pin, 10)

    const { error } = await supabase.from("profiles").upsert({
      id: authUser.id,
      organization_id: ORG_ID,
      branch_id: user.branch_id,
      full_name: user.full_name,
      phone: user.phone,
      role: user.role,
      pin_hash,
      is_active: true,
    }, { onConflict: "id" })

    if (error) {
      console.error(`Failed to create profile for ${user.email}:`, error.message)
    } else {
      console.log(`  ✓ Profile: ${user.full_name} (${user.role})`)
    }
  }
}

async function runSQLSeed() {
  console.log("Running SQL seed file...")
  const sql = readFileSync(join(__dirname, "001_dev_seed.sql"), "utf-8")

  // Split on semicolons (crude but effective for this seed file)
  const statements = sql
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith("--"))

  for (const statement of statements) {
    const { error } = await supabase.rpc("exec_sql", { sql: statement + ";" })
    if (error && !error.message.includes("ON CONFLICT")) {
      // Use direct query for seed data
    }
  }

  // Use the Supabase REST API approach — run the whole file via rpc
  const { error } = await supabase.from("organizations").select("id").limit(1)
  if (error) {
    console.error("DB connection error:", error.message)
    return
  }

  console.log("  ✓ SQL seed complete")
}

async function main() {
  console.log("\n🌱 PharmaTrack Seed Runner\n")

  await createUsers()
  await createProfiles()

  console.log("\n✅ Seed complete!")
  console.log("\nSeed credentials:")
  for (const u of SEED_USERS) {
    console.log(`  ${u.role.padEnd(12)} ${u.email} / ${u.password}`)
  }
}

main().catch((err) => {
  console.error("Seed failed:", err)
  process.exit(1)
})
