import { useEffect } from "react"
import { AppState } from "react-native"
import NetInfo from "@react-native-community/netinfo"
import { env } from "../env"
import { useCartStore } from "../../store/cart"
import { useStaffStore } from "../../store/staff"
import { deferSyncWhile, initSync, noteTillActivity, scheduleSoonSync, setOnline, syncNow, tickClock } from "./engine"

const POLL_MS = 5 * 60_000
const TICK_MS = 60_000

// Mounted once from app/_layout.tsx so sync runs app-wide, whatever screen is
// open (R1 rule 8). Triggers: app start, coming back to the foreground,
// network reconnect, every 5 minutes in the foreground, plus the per-sale and
// clock-out triggers the engine exposes. A minute tick feeds the clock-tamper
// guard and re-evaluates the selling lock / 21:00 banner. Renders nothing; a
// no-op in the Offline Edition build.
// After-sale and poll syncs wait for a quiet till (engine.ts): a cart with
// lines means a sale is in progress, and every cart change counts as activity.
export function SyncRunner() {
  useEffect(() => {
    useStaffStore.getState().load()
    initSync()
    if (env.EXPO_PUBLIC_OFFLINE_MODE) return

    void syncNow("start")

    deferSyncWhile(() => useCartStore.getState().items.length > 0)
    const cartUnsubscribe = useCartStore.subscribe(noteTillActivity)

    let wasOnline: boolean | null = null
    const netUnsubscribe = NetInfo.addEventListener((state) => {
      const online = !!state.isConnected && state.isInternetReachable !== false
      setOnline(online)
      if (online && wasOnline === false) void syncNow("reconnect")
      wasOnline = online
    })

    const appStateSubscription = AppState.addEventListener("change", (next) => {
      if (next === "active") {
        tickClock()
        // The listener only reports changes; re-read on return so a stale
        // "offline" (e.g. after a failed request) can't stick.
        NetInfo.fetch()
          .then((state) => setOnline(!!state.isConnected && state.isInternetReachable !== false))
          .catch(() => undefined)
        void syncNow("foreground")
      }
    })

    const poll = setInterval(() => {
      if (AppState.currentState === "active") scheduleSoonSync("poll")
    }, POLL_MS)
    const tick = setInterval(tickClock, TICK_MS)

    return () => {
      cartUnsubscribe()
      netUnsubscribe()
      appStateSubscription.remove()
      clearInterval(poll)
      clearInterval(tick)
    }
  }, [])

  return null
}
