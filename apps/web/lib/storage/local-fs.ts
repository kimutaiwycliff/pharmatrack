import { mkdir, readFile, writeFile, rm } from "node:fs/promises"
import { join, dirname, resolve, sep } from "node:path"

// ADR-014 — Offline Edition storage backend. An offline install has no MinIO
// (no internet, no docker-compose stack), so product images live on local
// disk instead. Mirrors lib/storage/minio.ts's exact exported signatures —
// selected by lib/storage/index.ts, callers never import this directly.
//
// The Tauri shell points LOCAL_STORAGE_DIR at its app-data directory; local
// dev/testing without it set falls back to a repo-relative .data folder.
const BASE_DIR = resolve(process.env.LOCAL_STORAGE_DIR || join(process.cwd(), ".data", "product-images"))

/** Resolve `key` under BASE_DIR, rejecting anything that would escape it
 *  (keys are always server-generated UUIDs — see api/uploads/product-image —
 *  but this is the layer that actually touches the filesystem, so it defends
 *  itself rather than trusting every caller). */
function pathFor(key: string): string {
  const filePath = resolve(BASE_DIR, key)
  if (filePath !== BASE_DIR && !filePath.startsWith(BASE_DIR + sep)) {
    throw new Error("Invalid storage key")
  }
  return filePath
}

function metaPathFor(key: string): string {
  return `${pathFor(key)}.meta.json`
}

/** App-relative URL that serves the object via /api/media/<key> (browser-reachable). */
export function productImageUrl(key: string): string {
  return `/api/media/${key}`
}

/** Write an image to local disk (server-side). Returns its public URL. */
export async function putProductImage(
  key: string,
  body: Buffer | Uint8Array,
  contentType: string,
): Promise<string> {
  const filePath = pathFor(key)
  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, body)
  await writeFile(metaPathFor(key), JSON.stringify({ contentType }))
  return productImageUrl(key)
}

/** Read an object from local disk (server-side). Null if missing. */
export async function getProductObject(
  key: string,
): Promise<{ body: Uint8Array; contentType: string } | null> {
  try {
    const body = await readFile(pathFor(key))
    const meta = JSON.parse(await readFile(metaPathFor(key), "utf-8")) as { contentType: string }
    return { body: new Uint8Array(body), contentType: meta.contentType }
  } catch {
    return null
  }
}

export async function deleteProductImage(key: string): Promise<void> {
  await rm(pathFor(key), { force: true })
  await rm(metaPathFor(key), { force: true })
}
