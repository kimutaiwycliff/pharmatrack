import { useState } from "react"
import { ActivityIndicator, StyleSheet, View } from "react-native"
import { WebView, type WebViewMessageEvent } from "react-native-webview"
import { env } from "../lib/env"
import { useTheme } from "../theme/useTheme"
import { space } from "../theme/tokens"
import { Sheet } from "./Sheet"
import { Text } from "./Text"

// Email sign-in on the server is guarded by Cloudflare Turnstile, which only
// works on pharmatrack.co.ke itself — so the app shows the site's own small
// check page (apps/web/app/app-captcha) in a WebView and receives the token
// through postMessage. Phone + PIN and Google sign-in never need it.
//
// onResult(token): a token to send as `x-captcha-response`; null when the
// server has no check configured (local/dev) — sign in without one.
export function CaptchaSheet({ open, onResult, onClose }: { open: boolean; onResult: (token: string | null) => void; onClose: () => void }) {
  const theme = useTheme()
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  function onMessage(e: WebViewMessageEvent) {
    let msg: { type?: string; token?: string | null; reason?: string }
    try {
      msg = JSON.parse(e.nativeEvent.data) as typeof msg
    } catch {
      return
    }
    if (msg.type !== "pt-captcha") return
    if (msg.token) onResult(msg.token)
    else if (msg.reason === "disabled") onResult(null)
    // "expired": the widget re-shows itself; wait for a fresh token.
  }

  return (
    <Sheet open={open} onClose={onClose} title="Security check">
      <Text tone="secondary">Tick the box to confirm you’re not a robot, then we’ll sign you in.</Text>
      <View style={[styles.frame, { borderColor: theme.border }]}>
        {open ? (
          <WebView
            source={{ uri: `${env.EXPO_PUBLIC_API_URL}/app-captcha` }}
            onMessage={onMessage}
            onLoadEnd={() => setLoading(false)}
            onError={() => setFailed(true)}
            onHttpError={() => setFailed(true)}
            style={styles.webview}
            javaScriptEnabled
            domStorageEnabled
            setSupportMultipleWindows={false}
          />
        ) : null}
        {loading && !failed ? (
          <View style={styles.overlay} pointerEvents="none">
            <ActivityIndicator color={theme.green600} />
          </View>
        ) : null}
      </View>
      {failed ? (
        <Text tone="danger" accessibilityLiveRegion="polite">
          Couldn’t load the security check. Check your internet connection, or sign in with Google or your till PIN.
        </Text>
      ) : null}
    </Sheet>
  )
}

const styles = StyleSheet.create({
  frame: { height: 260, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, overflow: "hidden", marginTop: space.sm },
  webview: { flex: 1, backgroundColor: "transparent" },
  overlay: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, alignItems: "center", justifyContent: "center" },
})
