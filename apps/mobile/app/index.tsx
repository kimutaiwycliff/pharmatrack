import { useEffect, useState } from "react"
import { Redirect } from "expo-router"
import { ActivityIndicator, View } from "react-native"
import { useSession } from "../src/lib/auth-client"
import { useTheme } from "../src/theme/useTheme"
import { env } from "../src/lib/env"
import { isFirstRun, getCurrentStaffId } from "../src/lib/local-auth"
import { getStoredLicense } from "../src/lib/license"

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

function OnlineIndex() {
  const { data, isPending } = useSession()
  if (isPending) return <Loading />
  return <Redirect href={data?.session ? "/pos" : "/login"} />
}

export default function Index() {
  return env.EXPO_PUBLIC_OFFLINE_MODE ? <OfflineIndex /> : <OnlineIndex />
}
