"use client"

import { Toaster } from "sonner"
import { useTheme } from "next-themes"

export function ThemedToaster() {
  const { theme } = useTheme()
  return (
    <Toaster
      richColors
      position="top-right"
      theme={(theme as "light" | "dark" | "system") ?? "system"}
    />
  )
}
