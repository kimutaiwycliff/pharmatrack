"use client"

import { useEffect, useState } from "react"
import { Download } from "lucide-react"
import type { AndroidRelease } from "@/lib/android/release"

function isAndroid(): boolean {
  return /Android/i.test(navigator.userAgent)
}

export function AndroidDownload({ release }: { release: AndroidRelease | null }) {
  const [android, setAndroid] = useState<boolean | null>(null)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAndroid(isAndroid())
  }, [])

  if (!android || !release?.apkUrl) return null

  return (
    <div className="mk-rise flex flex-col sm:flex-row sm:items-center gap-3" style={{ animationDelay: "360ms" }}>
      <a
        href={release.apkUrl}
        className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-xl bg-[var(--pt-green)] text-white font-semibold hover:bg-[var(--pt-green-600)] transition-colors"
      >
        <Download size={17} /> Download for Android
        <span className="text-xs font-normal text-white/80">v{release.version}</span>
      </a>
      <p className="text-xs text-[var(--pt-text-tertiary)]">
        Android 8+ · direct install — you may need to allow &quot;install from unknown sources&quot;
        the first time.
      </p>
    </div>
  )
}
