import type { MetadataRoute } from "next"

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PharmaTrack",
    short_name: "PharmaTrack",
    description: "Pharmacy POS, inventory & appointments for Kenyan pharmacies",
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
