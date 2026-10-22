// Settings → Receipt logo upload, done in the browser so the server needs no
// image library: one small PNG (screens, PDFs, Android's printed page) and one
// pre-dithered 1-bit copy for thermal printers, sized for a 58 mm roll so it
// prints on every till.
import { RECEIPT_LIMITS, base64ToBytes, logoToRaster, type ReceiptLogo, type LogoRaster } from "@pharmatrack/core"

const DISPLAY_MAX = { w: 360, h: 160 }
/** 58 mm printable width is 384 dots; a little margin keeps it off the edges. */
const PRINT_MAX = { w: 368, h: 144 }

async function loadImage(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    return img
  } finally {
    URL.revokeObjectURL(url)
  }
}

function fit(w: number, h: number, max: { w: number; h: number }) {
  const k = Math.min(1, max.w / w, max.h / h)
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) }
}

/** The image drawn on white (transparent logos would print black otherwise). */
function draw(img: HTMLImageElement, w: number, h: number) {
  const canvas = document.createElement("canvas")
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("This browser can't process images")
  ctx.fillStyle = "#fff"
  ctx.fillRect(0, 0, w, h)
  ctx.imageSmoothingQuality = "high"
  ctx.drawImage(img, 0, 0, w, h)
  return { canvas, ctx }
}

/** An uploaded image file → the receipt logo (throws a readable message when unusable). */
export async function processLogo(file: File): Promise<ReceiptLogo> {
  if (!/^image\/(png|jpeg|webp|gif|bmp|svg\+xml)$/.test(file.type)) throw new Error("Choose a PNG or JPG image")
  if (file.size > 5 * 1024 * 1024) throw new Error("That image is over 5 MB — choose a smaller one")
  const img = await loadImage(file).catch(() => {
    throw new Error("Couldn't read that image — try a PNG or JPG")
  })
  const iw = img.naturalWidth || img.width
  const ih = img.naturalHeight || img.height
  if (!iw || !ih) throw new Error("Couldn't read that image — try a PNG or JPG")

  // Screen copy: PNG keeps logos crisp; fall back to a smaller JPEG if it's too big.
  let size = fit(iw, ih, DISPLAY_MAX)
  let dataUrl = draw(img, size.w, size.h).canvas.toDataURL("image/png")
  for (const scale of [1, 0.75, 0.5]) {
    if (dataUrl.length <= RECEIPT_LIMITS.logoDataUrlChars) break
    size = fit(iw, ih, { w: DISPLAY_MAX.w * scale, h: DISPLAY_MAX.h * scale })
    dataUrl = draw(img, size.w, size.h).canvas.toDataURL("image/jpeg", 0.85)
  }
  if (dataUrl.length > RECEIPT_LIMITS.logoDataUrlChars) throw new Error("That logo is too detailed — try a simpler image")

  // Printer copy: luminance → solid black (flat logos) or dithered dots (photos).
  const p = fit(iw, ih, PRINT_MAX)
  const { ctx } = draw(img, p.w, p.h)
  const rgba = ctx.getImageData(0, 0, p.w, p.h).data
  const gray = new Uint8ClampedArray(p.w * p.h)
  for (let i = 0; i < gray.length; i++) {
    gray[i] = 0.299 * (rgba[i * 4] ?? 255) + 0.587 * (rgba[i * 4 + 1] ?? 255) + 0.114 * (rgba[i * 4 + 2] ?? 255)
  }
  return { data_url: dataUrl, raster: logoToRaster(gray, p.w, p.h) }
}

/** The printer raster drawn back to a data URL, so the owner sees how it prints. */
export function rasterPreview(r: LogoRaster): string {
  const canvas = document.createElement("canvas")
  canvas.width = r.width
  canvas.height = r.height
  const ctx = canvas.getContext("2d")
  if (!ctx) return ""
  const img = ctx.createImageData(r.width, r.height)
  const bytes = base64ToBytes(r.data)
  const rowBytes = r.width / 8
  for (let y = 0; y < r.height; y++) {
    for (let x = 0; x < r.width; x++) {
      const on = ((bytes[y * rowBytes + (x >> 3)] ?? 0) & (0x80 >> (x & 7))) !== 0
      const i = (y * r.width + x) * 4
      img.data[i] = img.data[i + 1] = img.data[i + 2] = on ? 0 : 255
      img.data[i + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  return canvas.toDataURL("image/png")
}
