import { RELEASES_BASE_URL } from "@/lib/releases"

interface UpdaterManifest {
  version: string
  // `downloads` is a PharmaTrack-specific addition (alongside the standard
  // Tauri `platforms` field, which the updater itself reads) pointing at the
  // nicer direct-install files - the macOS updater artifact is a .app.tar.gz,
  // not the .dmg a human should actually download. See ci.yml's
  // desktop-publish-manifest job for how this gets written.
  downloads?: { windows?: string; mac?: string }
}

export interface DesktopRelease {
  version: string
  windowsUrl: string | null
  macUrl: string | null
}

/**
 * Reads the latest.json manifest CI publishes on every desktop release (see
 * .github/workflows/ci.yml `desktop-publish-manifest`) — served publicly from
 * Cloudflare R2's custom domain, no credentials needed to read it. Returns
 * null before the first release exists yet, or if the fetch/object is
 * missing/malformed - callers should hide the download UI entirely rather
 * than error, since "no desktop release yet" is an expected state, not a
 * failure.
 */
export async function getLatestDesktopRelease(): Promise<DesktopRelease | null> {
  try {
    const res = await fetch(`${RELEASES_BASE_URL}/desktop/latest.json`, { next: { revalidate: 60 } })
    if (!res.ok) return null
    const manifest = (await res.json()) as UpdaterManifest
    if (!manifest.version) return null
    return {
      version: manifest.version,
      windowsUrl: manifest.downloads?.windows ?? null,
      macUrl: manifest.downloads?.mac ?? null,
    }
  } catch {
    return null
  }
}
