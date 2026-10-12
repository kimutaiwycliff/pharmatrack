import { useEffect, useState } from "react"
import { Redirect } from "expo-router"
import { ActivityIndicator, View } from "react-native"
import { useSession } from "../src/lib/auth-client"
import { useTheme } from "../src/theme/useTheme"
import { env } from "../src/lib/env"
import { isFirstRun, getCurrentStaffId } from "../src/lib/local-auth"
import { getStoredLicense } from "../src/lib/license"
import { useSyncStore } from "../src/store/sync"
import { useStaffStore } from "../src/store/staff"

function Loading() {
  const theme = useTheme()
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.bg }}>
      <ActivityIndicator color={theme.green} />
    </View>
  )
}

// ADR-014 — the Offline Edition build never touches Better Auth's useSession()
// at all: "signed in" means a `staff` row's id is recorded locally (see
// local-auth.ts), and "needs setup" means no `staff` row exists yet.
function OfflineIndex() {
  const [href, setHref] = useState<"/pos" | "/login" | "/setup" | "/license" | null>(null)

  useEffect(() => {
    let cancelled = false
    async function resolve() {
      // ADR-014, Phase 3 — gates everything else, re-verified on every
      // launch (see src/lib/license.ts). Mirrors apps/desktop's native
      // license-dialog gate running before Postgres/Next even start.
      const license = await getStoredLicense()
      if (!license || !license.valid) {
        if (!cancelled) setHref("/license")
        return
      }
      const needsSetup = await isFirstRun()
      if (needsSetup) {
        if (!cancelled) setHref("/setup")
        return
      }
      const staffId = await getCurrentStaffId()
      if (!cancelled) setHref(staffId ? "/pos" : "/login")
    }
    resolve()
    return () => {
      cancelled = true
    }
  }, [])

  if (!href) return <Loading />
  return <Redirect href={href} />
}

// R1: a signed-in session goes through "Checking everything" first. A
// registered phone can also sell with no session at all (offline roster PIN
// switching), so it skips the login screen.
function OnlineIndex() {
  const { data, isPending } = useSession()
  const ready = useSyncStore((s) => s.ready)
  const device = useSyncStore((s) => s.device)
  const current = useStaffStore((s) => s.current)
  if (isPending || !ready) return <Loading />
  if (data?.session) return <Redirect href="/checking" />
  if (device) return <Redirect href={current ? "/checking" : "/switch-user"} />
  return <Redirect href="/login" />
}

export default function Index() {
  return env.EXPO_PUBLIC_OFFLINE_MODE ? <OfflineIndex /> : <OnlineIndex />
}
