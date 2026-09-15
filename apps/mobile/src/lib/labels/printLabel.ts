import * as Print from "expo-print"
import * as Sharing from "expo-sharing"
import { barcodeSvgMarkup } from "@pharmatrack/core"

export interface LabelInput {
  code: string
  productName: string
  price?: number | null
  copies?: number
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

function buildLabelsHtml({ code, productName, price, copies = 1 }: LabelInput): string {
  const svg = barcodeSvgMarkup(code, { moduleWidth: 2, height: 50 })
  const cell = `
    <div style="display:inline-block; width:45mm; height:30mm; border:1px dashed #999; margin:2mm; padding:2mm; text-align:center; box-sizing:border-box;">
      <div style="font-size:9pt; font-weight:bold; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(productName)}</div>
      ${svg}
      <div style="font-size:8pt; font-family:monospace;">${escapeHtml(code)}</div>
      ${price != null ? `<div style="font-size:8pt;">KES ${price.toFixed(2)}</div>` : ""}
    </div>
  `
  return `<html><body style="margin:0;">${cell.repeat(Math.max(1, copies))}</body></html>`
}

/**
 * Hands the label off to the Android system print sheet (Print Framework),
 * which shows whatever printers/print-service apps are registered —
 * including many Bluetooth thermal/label printers. Note: per Expo's docs,
 * printAsync's promise resolves on Android as soon as the print sheet is
 * shown, whether or not a printer was actually available or the user
 * completed printing — so this can't reliably detect failure the way a
 * try/catch might suggest. Pair it with shareLabelPDF as an explicit second
 * option in the UI (mirrors the web LabelPrintDialog's two-button layout)
 * rather than silently falling back on a caught error.
 */
export async function printLabel(input: LabelInput): Promise<void> {
  await Print.printAsync({ html: buildLabelsHtml(input) })
}

/**
 * Renders the label(s) to a PDF and opens the share sheet — works
 * regardless of whether a print-service-compatible printer is set up,
 * identical in spirit to the CSV export flow in reports.tsx/inventory-import.tsx.
 */
export async function shareLabelPDF(input: LabelInput): Promise<void> {
  const { uri } = await Print.printToFileAsync({ html: buildLabelsHtml(input) })
  await Sharing.shareAsync(uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf" })
}
