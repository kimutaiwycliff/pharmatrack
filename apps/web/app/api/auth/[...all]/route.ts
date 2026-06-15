import { toNextJsHandler } from "better-auth/next-js"
import { auth } from "@/lib/auth/server"

// Better Auth mounts all its endpoints (sign-in/up, session, org, admin, …) here.
export const { GET, POST } = toNextJsHandler(auth)
