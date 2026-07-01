import type { MetadataRoute } from "next"

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PharmaTrack — Pharmacy POS for Kenya",
    short_name: "PharmaTrack",
    description: "Offline-capable pharmacy POS, inventory, M-Pesa & PPB compliance for Kenyan pharmacies.",
    categories: ["business", "medical", "productivity"],
    lang: "en",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#16a34a",
    icons: [
      // "any" for the launcher/favicon; "maskable" so Android can clip it to
      // the device's icon shape without white corners.
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/maskable.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  }
}
