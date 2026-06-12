import { NextResponse } from "next/server"
import type { ZodError } from "zod"

/**
 * Consistent JSON error shape for API routes: `{ error: string }`.
 * Centralised so every route reports failures the same way and the client can
 * rely on a single field.
 */
export function apiError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

/**
 * Turns a Zod validation failure into an actionable message that names the
 * failing field, e.g. `Invalid UUID (field: items.0.product_id)`. Without the
 * path, a bare "Invalid UUID" is impossible to diagnose.
 */
export function zodErrorResponse(error: ZodError, status = 400) {
  const issue = error.issues[0]
  const path = issue?.path.join(".")
  const message = issue?.message ?? "Invalid request"
  return apiError(path ? `${message} (field: ${path})` : message, status)
}
