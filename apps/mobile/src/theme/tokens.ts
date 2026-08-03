// Mirrors apps/web/app/globals.css's --pt-* CSS variables exactly (both the
// :root/light block and the .dark block) so the mobile app matches the web
// and desktop apps' color system instead of using ad-hoc colors.
export const lightTheme = {
  green: "#16a34a",
  green600: "#15803d",
  greenCta: "#15803d",
  green50: "#f0fdf4",
  green100: "#dcfce7",
  bg: "#f9fafb",
  surface: "#ffffff",
  muted: "#f9fafb",
  mutedStrong: "#f3f4f6",
  border: "#e5e7eb",
  borderStrong: "#d1d5db",
  text: "#111827",
  textSecondary: "#6b7280",
  textTertiary: "#9ca3af",
  red: "#ef4444",
  red50: "#fef2f2",
  amber: "#f59e0b",
  yellow: "#eab308",
}

export const darkTheme = {
  green: "#22c55e",
  green600: "#16a34a",
  greenCta: "#15803d",
  green50: "#0f2a1b",
  green100: "#173a26",
  bg: "#0e1116",
  surface: "#171b21",
  muted: "#1c212a",
  mutedStrong: "#232a34",
  border: "#2a313b",
  borderStrong: "#3a424d",
  text: "#e6e8eb",
  textSecondary: "#9ba3af",
  textTertiary: "#6b7480",
  red: "#f87171",
  red50: "#2a1517",
  amber: "#fbbf24",
  yellow: "#facc15",
}

export type Theme = typeof lightTheme
