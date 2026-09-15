import { RELEASES_BASE_URL } from "@/lib/releases"

interface UpdaterManifest {
  version: string
  apkKey?: string // e.g. "android/v1.0.0/pharmatrack.apk" — relative to the R2 bucket
}

export interface AndroidRelease {
  version: string
  apkUrl: string | null
}

/**
 * Reads the latest.json manifest CI uploads directly to Cloudflare R2 after
 * every `eas build` (see .github/workflows/ci.yml's mobile-android job) —
 * served publicly from R2's custom domain, no credentials needed to read it.
 * Returns null before the first release exists yet, or if the fetch/object is
 * missing/malformed - callers should hide the download UI entirely rather
 * than error, since "no Android release yet" is an expected state, not a
 * failure.
 */
export async function getLatestAndroidRelease(): Promise<AndroidRelease | null> {
  try {
    const res = await fetch(`${RELEASES_BASE_URL}/android/latest.json`, { next: { revalidate: 60 } })
    if (!res.ok) return null
    const manifest = (await res.json()) as UpdaterManifest
    if (!manifest.version) return null
    return {
      version: manifest.version,
      apkUrl: manifest.apkKey ? `${RELEASES_BASE_URL}/${manifest.apkKey}` : null,
    }
  } catch {
    return null
  }
}
