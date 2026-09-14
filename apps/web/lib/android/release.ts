import { getAndroidReleaseObject } from "@/lib/storage/minio"

interface UpdaterManifest {
  version: string
  apkKey?: string // e.g. "v1.0.0/pharmatrack.apk" — relative to the android-releases bucket
}

export interface AndroidRelease {
  version: string
  apkUrl: string | null
}

/**
 * Reads the latest.json manifest an EAS build gets uploaded under (via
 * infra/upload-android-release.sh) after every Android release. Returns null
 * before the first release exists yet, or if the object is missing/malformed
 * - callers should hide the download UI entirely rather than error, since "no
 * Android release yet" is an expected state, not a failure.
 */
export async function getLatestAndroidRelease(): Promise<AndroidRelease | null> {
  const obj = await getAndroidReleaseObject("latest.json")
  if (!obj) return null

  try {
    const manifest = JSON.parse(new TextDecoder().decode(obj.body)) as UpdaterManifest
    if (!manifest.version) return null
    return {
      version: manifest.version,
      apkUrl: manifest.apkKey ? `/api/android/download/${manifest.apkKey}` : null,
    }
  } catch {
    return null
  }
}
