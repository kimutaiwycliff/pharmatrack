"use client"

import { useEffect, useState } from "react"

/** Reactive online/offline status. Assumes online during SSR/first paint. */
export function useOnline(): boolean {
  const [online, setOnline] = useState(true)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOnline(navigator.onLine)
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener("online", on)
    window.addEventListener("offline", off)
    return () => {
      window.removeEventListener("online", on)
      window.removeEventListener("offline", off)
    }
  }, [])

  return online
}
