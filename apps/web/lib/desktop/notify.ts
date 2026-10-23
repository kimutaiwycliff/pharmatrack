"use client"

// OS notification from the till: the desktop app's own command (pt_notify,
// apps/desktop/src-tauri/src/desktop.rs) — it reaches the cashier even with
// the window hidden in the tray — or, in a browser, a web Notification when
// the user has already allowed them. Never throws.

type TauriInvoke = (cmd: string, args?: Record<string, unknown>) => Promise<unknown>

export async function notifyDesktop(title: string, body: string): Promise<boolean> {
  if (typeof window === "undefined") return false
  const internals = (window as unknown as { __TAURI_INTERNALS__?: { invoke?: TauriInvoke } }).__TAURI_INTERNALS__
  try {
    if (internals?.invoke) {
      await internals.invoke("pt_notify", { title, body })
      return true
    }
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification(title, { body })
      return true
    }
  } catch {
    // notifications are a nicety — the in-app banner still shows
  }
  return false
}
