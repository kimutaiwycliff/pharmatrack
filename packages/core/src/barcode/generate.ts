// Generates an internal barcode for products/pack-sizes with no manufacturer
// GTIN (common for repackaged or loose pharmacy stock) — assigned into the
// already-existing `product.barcode_raw` / `product_pack_size.barcode`
// columns so it round-trips through the exact same scan/lookup pipeline as a
// real GTIN, with no schema change. Dependency-free (no crypto/uuid import)
// so it runs unmodified under Node (API routes) and Hermes (mobile); the real
// uniqueness guarantee is the caller's DB-backed conflict check
// (findBarcodeConflict), not this function's entropy.
const RANDOM_SUFFIX_LENGTH = 4
const RANDOM_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"

export function generateInternalBarcode(): string {
  const timePart = Date.now().toString(36).toUpperCase()
  let randomPart = ""
  for (let i = 0; i < RANDOM_SUFFIX_LENGTH; i++) {
    randomPart += RANDOM_ALPHABET[Math.floor(Math.random() * RANDOM_ALPHABET.length)]
  }
  return `PT${timePart}${randomPart}`
}
