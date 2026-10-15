import type { Metadata } from "next"
import { AppCaptcha } from "./AppCaptcha"

// Loaded inside the Android app (react-native-webview) when email sign-in
// needs the Cloudflare Turnstile check — the widget only works on this site's
// own domain, so the app shows this page instead of drawing its own.
export const metadata: Metadata = {
  title: "Security check",
  robots: { index: false, follow: false },
}

export default function AppCaptchaPage() {
  return <AppCaptcha />
}
