import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"

// ADR-004 — self-hosted MinIO (S3-compatible) for product images + backups.
// Uploads go via a presigned PUT issued server-side; the object key is stored on
// the product and served from the public bucket URL.

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

/** Public URL for an object in the products bucket (bucket is public-read). */
export function productImageUrl(key: string): string {
  const base = process.env.NEXT_PUBLIC_MINIO_URL // e.g. https://cdn.yourdomain.com
    ?? `http://${process.env.MINIO_ENDPOINT}:${process.env.MINIO_PORT ?? "9000"}`
  return `${base}/${PRODUCTS_BUCKET()}/${key}`
}

/** Issue a presigned PUT so the browser can upload an image directly. */
export async function presignProductUpload(
  key: string,
  contentType: string,
  expiresIn = 60,
): Promise<{ url: string; publicUrl: string }> {
  const cmd = new PutObjectCommand({
    Bucket: PRODUCTS_BUCKET(),
    Key: key,
    ContentType: contentType,
  })
  const url = await getSignedUrl(client(), cmd, { expiresIn })
  return { url, publicUrl: productImageUrl(key) }
}

export async function deleteProductImage(key: string): Promise<void> {
  await client().send(new DeleteObjectCommand({ Bucket: PRODUCTS_BUCKET(), Key: key }))
}
