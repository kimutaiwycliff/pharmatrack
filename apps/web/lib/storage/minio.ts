import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3"

// ADR-004 — self-hosted MinIO (S3-compatible) for product images + backups.
// MinIO is NOT exposed to the internet (bound to localhost / the compose network),
// so the browser can't talk to it directly. Uploads go through the app server
// (which can reach minio:9000 internally) and images are served back through
// `/api/media/<key>` — works behind Cloudflare with no MinIO exposure.

let _client: S3Client | null = null
function client(): S3Client {
  if (_client) return _client
  const endpoint = process.env.MINIO_ENDPOINT
  if (!endpoint) throw new Error("MINIO_ENDPOINT not set")
  _client = new S3Client({
    endpoint: `http://${endpoint}:${process.env.MINIO_PORT ?? "9000"}`,
    region: "us-east-1",
    forcePathStyle: true, // required for MinIO
    credentials: {
      accessKeyId: process.env.MINIO_ACCESS_KEY!,
      secretAccessKey: process.env.MINIO_SECRET_KEY!,
    },
  })
  return _client
}

const PRODUCTS_BUCKET = () => process.env.MINIO_BUCKET_PRODUCTS ?? "pharmatrack-products"
const RELEASES_BUCKET = () => process.env.MINIO_BUCKET_DESKTOP_RELEASES ?? "pharmatrack-desktop-releases"
const ANDROID_RELEASES_BUCKET = () => process.env.MINIO_BUCKET_ANDROID_RELEASES ?? "pharmatrack-android-releases"

/** App-relative URL that serves the object via /api/media/<key> (browser-reachable). */
export function productImageUrl(key: string): string {
  return `/api/media/${key}`
}

/** Upload an image to the products bucket (server-side). Returns its public URL. */
export async function putProductImage(
  key: string,
  body: Buffer | Uint8Array,
  contentType: string,
): Promise<string> {
  await client().send(new PutObjectCommand({
    Bucket: PRODUCTS_BUCKET(),
    Key: key,
    Body: body,
    ContentType: contentType,
  }))
  return productImageUrl(key)
}

/** Fetch an object from the products bucket (server-side). Null if missing. */
export async function getProductObject(
  key: string,
): Promise<{ body: Uint8Array; contentType: string } | null> {
  try {
    const res = await client().send(new GetObjectCommand({ Bucket: PRODUCTS_BUCKET(), Key: key }))
    if (!res.Body) return null
    const body = await res.Body.transformToByteArray()
    return { body, contentType: res.ContentType ?? "application/octet-stream" }
  } catch {
    return null
  }
}

export async function deleteProductImage(key: string): Promise<void> {
  await client().send(new DeleteObjectCommand({ Bucket: PRODUCTS_BUCKET(), Key: key }))
}

// Desktop installers (Windows/macOS) + the updater manifest. Same "never expose
// MinIO directly" pattern as products — served through /api/desktop/download/<key>.
// CI uploads the actual release artifacts via `mc` over SSH (see infra/deploy.sh);
// putDesktopRelease exists mainly for local testing of the download route.

/** App-relative URL that serves the object via /api/desktop/download/<key>. */
export function desktopReleaseUrl(key: string): string {
  return `/api/desktop/download/${key}`
}

export async function putDesktopRelease(
  key: string,
  body: Buffer | Uint8Array,
  contentType: string,
): Promise<string> {
  await client().send(new PutObjectCommand({
    Bucket: RELEASES_BUCKET(),
    Key: key,
    Body: body,
    ContentType: contentType,
  }))
  return desktopReleaseUrl(key)
}

export async function getDesktopReleaseObject(
  key: string,
): Promise<{ body: Uint8Array; contentType: string } | null> {
  try {
    const res = await client().send(new GetObjectCommand({ Bucket: RELEASES_BUCKET(), Key: key }))
    if (!res.Body) return null
    const body = await res.Body.transformToByteArray()
    return { body, contentType: res.ContentType ?? "application/octet-stream" }
  } catch {
    return null
  }
}

// Android direct-install APK + updater manifest. Same pattern as desktop —
// served through /api/android/download/<key>, never exposed via MinIO directly.
// putAndroidRelease exists mainly for local testing of the download route; real
// uploads go through infra/upload-android-release.sh after an EAS build.

/** App-relative URL that serves the object via /api/android/download/<key>. */
export function androidReleaseUrl(key: string): string {
  return `/api/android/download/${key}`
}

export async function putAndroidRelease(
  key: string,
  body: Buffer | Uint8Array,
  contentType: string,
): Promise<string> {
  await client().send(new PutObjectCommand({
    Bucket: ANDROID_RELEASES_BUCKET(),
    Key: key,
    Body: body,
    ContentType: contentType,
  }))
  return androidReleaseUrl(key)
}

export async function getAndroidReleaseObject(
  key: string,
): Promise<{ body: Uint8Array; contentType: string } | null> {
  try {
    const res = await client().send(new GetObjectCommand({ Bucket: ANDROID_RELEASES_BUCKET(), Key: key }))
    if (!res.Body) return null
    const body = await res.Body.transformToByteArray()
    return { body, contentType: res.ContentType ?? "application/octet-stream" }
  } catch {
    return null
  }
}
