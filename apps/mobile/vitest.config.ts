import { defineConfig } from "vitest/config"

// Pure-logic tests only (src/lib/sync/core — no React Native imports), so a
// plain Node environment is enough; nothing here touches Metro or Expo.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
})
