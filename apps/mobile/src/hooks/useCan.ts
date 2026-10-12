import { useCallback, useMemo } from "react"
import type { Capability } from "@pharmatrack/core"
import { env } from "../lib/env"
import { effectivePermissions, type NavContext } from "../lib/nav/visibility"
import { useSessionStore } from "../store/session"
import { useStaffStore } from "../store/staff"

// R3: capability checks for screens and navigation. Reads whoever is using the
// device right now (staff store — an offline PIN switch changes it), falling
// back to the signed-in session and then to role defaults (Offline Edition).
// The server re-checks every write against the session cookie regardless.
export function usePermissions(): string[] {
  const staff = useStaffStore((s) => s.current)
  const sessionPermissions = useSessionStore((s) => s.permissions)
  const sessionRole = useSessionStore((s) => s.role)
  return useMemo(
    () => effectivePermissions({ staffPermissions: staff?.permissions, sessionPermissions, role: staff?.role ?? sessionRole }),
    [staff, sessionPermissions, sessionRole],
  )
}

/** `const can = useCan(); if (can("cost.view")) …` */
export function useCan(): (cap: Capability) => boolean {
  const perms = usePermissions()
  return useCallback((cap: Capability) => perms.includes(cap), [perms])
}

/** Inputs for lib/nav/visibility's visibleTabs()/visibleMenuItems(). */
export function useNavContext(): NavContext {
  const permissions = usePermissions()
  const planCode = useSessionStore((s) => s.planCode)
  return useMemo(() => ({ permissions, planCode, offline: env.EXPO_PUBLIC_OFFLINE_MODE }), [permissions, planCode])
}
