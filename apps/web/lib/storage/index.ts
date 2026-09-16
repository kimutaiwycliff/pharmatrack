import { OFFLINE_MODE } from "@/lib/offline-mode"
import * as minio from "./minio"
import * as localFs from "./local-fs"

// ADR-014 — single switch between the two storage backends: MinIO for the
// hosted SaaS, local disk for Offline Edition installs. Callers import only
// from here, never from ./minio or ./local-fs directly.
const backend = OFFLINE_MODE ? localFs : minio

export const putProductImage = backend.putProductImage
export const getProductObject = backend.getProductObject
export const deleteProductImage = backend.deleteProductImage
export const productImageUrl = backend.productImageUrl
