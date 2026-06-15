"use client"

import { createAuthClient } from "better-auth/react"
import { organizationClient, adminClient } from "better-auth/client/plugins"

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL,
  plugins: [organizationClient(), adminClient()],
})

export const { signIn, signOut, signUp, useSession } = authClient
