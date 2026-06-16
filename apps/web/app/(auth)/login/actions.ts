"use server"

import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { auth } from "@/lib/auth/server"

export type ActionState = { error?: string }

/** Sign out via Better Auth, then back to /login. */
export async function signOut(): Promise<void> {
  await auth.api.signOut({ headers: await headers() })
  redirect("/login")
}
