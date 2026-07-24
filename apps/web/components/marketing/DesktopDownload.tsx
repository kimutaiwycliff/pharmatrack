"use client"

import { useEffect, useState } from "react"
import { Download, Monitor } from "lucide-react"
import type { DesktopRelease } from "@/lib/desktop/release"

type DetectedOs = "windows" | "mac" | "other"

function detectOs(): DetectedOs {
  const ua = navigator.userAgent
  if (/Win/i.test(ua)) return "windows"
  if (/Mac/i.test(navigator.platform) || /Macintosh/i.test(ua)) return "mac"
  return "other"
}

export function DesktopDownload({ release }: { release: DesktopRelease | null }) {
  const [os, setOs] = useState<DetectedOs | null>(null)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOs(detectOs())
  }, [])

  if (!release || (!release.windowsUrl && !release.macUrl)) return null

  const primary =
    os === "mac" && release.macUrl
      ? { label: "Download for Mac", url: release.macUrl, note: "macOS · universal (Intel & Apple Silicon)" }
      : release.windowsUrl
        ? { label: "Download for Windows", url: release.windowsUrl, note: "Windows 10/11 · 64-bit" }
        : { label: "Download for Mac", url: release.macUrl!, note: "macOS · universal (Intel & Apple Silicon)" }

  const secondary =
    primary.url === release.windowsUrl && release.macUrl
      ? { label: "Download for Mac", url: release.macUrl }
      : primary.url === release.macUrl && release.windowsUrl
        ? { label: "Download for Windows", url: release.windowsUrl }
        : null

  return (
    <div className="mk-rise flex flex-col sm:flex-row sm:items-center gap-3" style={{ animationDelay: "320ms" }}>
      <a
        href={primary.url}
        className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-xl bg-[var(--pt-surface)] border border-[var(--pt-border-strong)] text-[var(--pt-text)] font-semibold hover:bg-[var(--pt-muted-strong)] transition-colors"
      >
        <Monitor size={17} /> {primary.label}
        <span className="text-xs font-normal text-[var(--pt-text-tertiary)]">v{release.version}</span>
      </a>
      {secondary && (
        <a
          href={secondary.url}
          className="inline-flex items-center gap-1.5 text-sm text-[var(--pt-text-secondary)] hover:text-[var(--pt-text)] underline underline-offset-2"
        >
          <Download size={14} /> {secondary.label}
        </a>
      )}
      <p className="text-xs text-[var(--pt-text-tertiary)] sm:ml-1">
        {primary.note} · unsigned build — Windows will show a SmartScreen prompt
        (click &quot;More info&quot; → &quot;Run anyway&quot;); macOS needs
        right-click → Open the first time.
      </p>
    </div>
  )
}
