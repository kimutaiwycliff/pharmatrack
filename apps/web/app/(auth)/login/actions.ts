"use server"

import { createAdminClient, createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { z } from "zod"
import bcrypt from "bcryptjs"

export type ActionState = { error?: string }

const emailSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
})

export async function signInWithEmail(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = emailSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid credentials" }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  })
  if (error) return { error: error.message }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "Login failed" }

  // Platform (SaaS operator) admins go to the platform console — they may not
  // belong to any pharmacy, so check before the profile lookup.
  const admin = createAdminClient()
  const { data: platformAdmin } = await admin
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle()
  if (platformAdmin) redirect("/platform")

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single()

  const role = profile?.role
  if (role === "cashier" || role === "pharmacist") redirect("/pos")
  redirect("/dashboard")
}

export async function signInWithPin(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const rawPhone = String(formData.get("phone") ?? "").trim()
  const pin = String(formData.get("pin") ?? "")

  if (!rawPhone) return { error: "Phone number is required" }
  if (pin.length !== 4 || !/^\d{4}$/.test(pin)) return { error: "Enter your 4-digit PIN" }

  // Normalize: 0712345678 → +254712345678, 254712345678 → +254712345678
  const phone = rawPhone
    .replace(/\s+/g, "")
    .replace(/^0(\d)/, "+254$1")
    .replace(/^254(\d)/, "+254$1")

  const admin = createAdminClient()

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id, role, pin_hash")
    .eq("phone", phone)
    .eq("is_active", true)
    .maybeSingle()

  if (profileError ?? !profile) return { error: "No active account found for this number" }
  if (!profile.pin_hash) return { error: "PIN login not set up for this account" }

  const valid = await bcrypt.compare(pin, profile.pin_hash)
  if (!valid) return { error: "Incorrect PIN" }

  // Get user email to generate magic link token
  const { data: userData, error: userError } = await admin.auth.admin.getUserById(profile.id)
  if (userError ?? !userData.user?.email) return { error: "Failed to resolve account" }

  // Generate a one-time token for this user
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: userData.user.email,
  })
  if (linkError ?? !linkData.properties?.hashed_token) {
    return { error: "Failed to create session" }
  }

  // Exchange token for a session using the cookie-backed server client
  const supabase = await createClient()
  const { error: verifyError } = await supabase.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: "magiclink",
  })
  if (verifyError) return { error: "Session verification failed" }

  const role = profile.role
  if (role === "cashier" || role === "pharmacist") redirect("/pos")
  redirect("/dashboard")
}

export async function signOut(): Promise<void> {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect("/login")
}
