"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { CheckCircle2, Loader2, Printer, RefreshCw, ScanBarcode, Usb } from "lucide-react"
import { parseBarcode, receiptPreview, type DeviceHealth, type PaperWidth, type ReceiptDoc } from "@pharmatrack/core"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { usePrinterConfig, useDeviceStore, type DesktopTarget, type PrintMode } from "@/lib/printing/config"
import { chooseSerialPrinter, webSerialSupported } from "@/lib/printing/webSerial"
import { isDesktopApp, listDesktopPrinters, paperFor, printTestPage, type DesktopPrinters } from "@/lib/printing/printer"
import { useDeviceHealth } from "@/lib/printing/useDeviceHealth"

const BAUDS = [9600, 19200, 38400, 115200]

const SAMPLE: ReceiptDoc = {
  shopName: "Your Pharmacy", branchName: "Main Branch", receiptNumber: "R-000123", dateText: "15/10/2026 14:05", cashier: "Jane",
  lines: [
    { name: "Paracetamol 500mg", qtyLabel: "20 tablet @ 2.00", totalCents: 4000 },
    { name: "Amoxicillin 500mg Capsules", qtyLabel: "21 capsule @ 10.00", totalCents: 21000, discountCents: 1000 },
  ],
  subtotalCents: 25000, discountCents: 1000, totalCents: 24000, paymentLabel: "Cash", paidCents: 50000, changeCents: 26000,
}

const TONE_TEXT: Record<DeviceHealth["tone"], string> = {
  ok: "text-[var(--pt-green-700)]", warn: "text-amber-700 dark:text-amber-300", down: "text-[var(--pt-red)]", none: "text-[var(--pt-text-secondary)]",
}

type NetworkTarget = Extract<DesktopTarget, { kind: "network" }> & { label: string }
type SerialTarget = Extract<DesktopTarget, { kind: "serial" }> & { label: string }

function Health({ h }: { h: DeviceHealth }) {
  return (
    <p className={`text-sm font-semibold ${TONE_TEXT[h.tone]}`} aria-live="polite">
      {h.label}
      {h.detail ? <span className="block text-xs font-normal text-[var(--pt-text-secondary)]">{h.detail}</span> : null}
    </p>
  )
}

function Section({ icon: Icon, title, children }: { icon: React.ElementType; title: string; children: React.ReactNode }) {
  return (
    <section className="bg-[var(--pt-surface)] rounded-xl border border-[var(--pt-border)] p-5 space-y-4">
      <h2 className="text-base font-bold flex items-center gap-2"><Icon size={18} className="text-[var(--pt-green-600)]" /> {title}</h2>
      {children}
    </section>
  )
}

function Toggle({ label, hint, checked, disabled, onChange }: { label: string; hint?: string; checked: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className={`flex items-start justify-between gap-3 ${disabled ? "opacity-60" : "cursor-pointer"}`}>
      <span className="text-sm">
        {label}
        {hint ? <span className="block text-xs text-[var(--pt-text-secondary)]">{hint}</span> : null}
      </span>
      <input type="checkbox" className="mt-1 h-4 w-4 accent-[var(--pt-green)]" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
    </label>
  )
}

const selectCls = "h-10 w-full rounded-lg border border-[var(--pt-border)] bg-[var(--pt-surface)] px-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pt-green)]"

// Settings → Printer & scanner. Saved on this device (each till has its own
// hardware), so anyone working the till can set it up.
export function HardwarePanel({ orgName, orgPaper }: { orgName: string | null; orgPaper: string | null }) {
  const { config, setConfig } = usePrinterConfig()
  const { printer, scanner, recheck } = useDeviceHealth()
  const lastScanCode = useDeviceStore((s) => s.lastScanCode)
  const markScan = useDeviceStore((s) => s.markScan)
  const [busy, setBusy] = useState<string | null>(null)
  const [serialOk, setSerialOk] = useState(false)
  const [desktop, setDesktop] = useState(false)
  const [desktopList, setDesktopList] = useState<DesktopPrinters | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  const [scanTest, setScanTest] = useState("")
  const [scanResult, setScanResult] = useState<string | null>(null)
  const paper = paperFor(config, orgPaper)

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key)
    try { await fn() } catch (err) { toast.error(err instanceof Error ? err.message : String(err)) } finally { setBusy(null) }
  }

  // Feature detection after mount (no window on the server); the desktop
  // app's printer list loads straight away when it's the chosen mode.
  useEffect(() => {
    const t = setTimeout(() => {
      setSerialOk(webSerialSupported())
      const inApp = isDesktopApp()
      setDesktop(inApp)
      if (inApp && usePrinterConfig.getState().config.mode === "desktop") {
        listDesktopPrinters().then(setDesktopList).catch(() => undefined)
      }
    }, 0)
    return () => clearTimeout(t)
  }, [])

  const loadDesktopPrinters = () => run("list", async () => setDesktopList(await listDesktopPrinters()))

  function setMode(mode: PrintMode) {
    setConfig({ mode })
    if (mode === "desktop" && desktop && !desktopList) void loadDesktopPrinters()
    setTimeout(() => void recheck(), 0)
  }

  function setDesktopTarget(t: (DesktopTarget & { label: string }) | null) {
    setConfig({ desktop: t })
    setTimeout(() => void recheck(), 0)
  }

  const modes: Array<{ key: PrintMode; title: string; hint: string; disabled?: string }> = [
    { key: "browser", title: "Browser print dialog", hint: "Works with any printer installed on this computer or tablet. You confirm each print." },
    {
      key: "serial", title: "Direct to printer (USB or Bluetooth)",
      hint: "Prints instantly without a dialog, shows paper/offline status and can open the cash drawer. Chrome or Edge.",
      disabled: serialOk ? undefined : "Needs Chrome or Edge on a computer or Android.",
    },
    {
      key: "desktop", title: "PharmaTrack desktop app printer",
      hint: "USB, Bluetooth (COM port), network/LAN or any Windows printer, with status. Only inside the desktop app.",
      disabled: desktop ? undefined : "Open PharmaTrack in the desktop app to use this.",
    },
  ]

  const d = config.desktop
  const desktopValue = d ? (d.kind === "system" ? `system:${d.name}` : d.kind === "serial" ? `serial:${d.path}` : "network") : ""

  return (
    <div className="space-y-5 max-w-3xl">
      <p className="text-sm text-[var(--pt-text-secondary)]">
        These settings are saved on <span className="font-semibold">this device</span> — set them up on each till.
      </p>

      <Section icon={Printer} title="Receipt printer">
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium mb-1">How should receipts print?</legend>
          {modes.map((m) => (
            <label key={m.key} className={`flex items-start gap-3 rounded-lg border p-3 ${config.mode === m.key ? "border-[var(--pt-green)] bg-[var(--pt-green-50)]" : "border-[var(--pt-border)]"} ${m.disabled ? "opacity-60" : "cursor-pointer"}`}>
              <input type="radio" name="print-mode" className="mt-1 accent-[var(--pt-green)]" checked={config.mode === m.key} disabled={!!m.disabled} onChange={() => setMode(m.key)} />
              <span className="text-sm">
                <span className="font-semibold">{m.title}</span>
                <span className="block text-xs text-[var(--pt-text-secondary)]">{m.disabled ?? m.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>

        {config.mode === "serial" && (
          <div className="rounded-lg border border-[var(--pt-border)] p-3 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" disabled={busy === "choose"} onClick={() => run("choose", async () => {
                const c = await chooseSerialPrinter()
                setConfig({ serial: { ...c, baud: config.serial?.baud ?? 9600 } })
                toast.success(`${c.label} selected`)
                setTimeout(() => void recheck(), 0)
              })}>
                <Usb size={15} className="mr-1.5" /> {config.serial ? "Choose a different printer" : "Choose printer"}
              </Button>
              {config.serial
                ? <span className="text-sm font-medium">{config.serial.label}</span>
                : <span className="text-xs text-[var(--pt-text-secondary)]">Plug in the USB cable, or pair the Bluetooth printer in your computer’s or tablet’s Bluetooth settings first.</span>}
            </div>
            <div className="max-w-[220px]">
              <Label htmlFor="baud" className="text-xs">Speed (baud)</Label>
              <select id="baud" className={selectCls} value={config.serial?.baud ?? 9600} disabled={!config.serial}
                onChange={(e) => config.serial && setConfig({ serial: { ...config.serial, baud: Number(e.target.value) } })}>
                {BAUDS.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
              <p className="text-[11px] text-[var(--pt-text-tertiary)] mt-1">Usually 9600. If the test page prints garbage, try 115200.</p>
            </div>
          </div>
        )}

        {config.mode === "desktop" && desktop && (
          <div className="rounded-lg border border-[var(--pt-border)] p-3 space-y-3">
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Label htmlFor="desk-printer" className="text-xs">Printer</Label>
                <select id="desk-printer" className={selectCls} value={desktopValue} onChange={(e) => {
                  const v = e.target.value
                  if (v.startsWith("system:")) setDesktopTarget({ kind: "system", name: v.slice(7), label: v.slice(7) })
                  else if (v.startsWith("serial:")) {
                    const port = desktopList?.serial.find((p) => p.path === v.slice(7))
                    setDesktopTarget({ kind: "serial", path: v.slice(7), baud: 9600, label: port?.label ?? v.slice(7) })
                  } else if (v === "network") setDesktopTarget({ kind: "network", host: "192.168.1.100", port: 9100, label: "Network printer 192.168.1.100" })
                  else setDesktopTarget(null)
                }}>
                  <option value="">— choose —</option>
                  {desktopList?.system.length ? <optgroup label="Installed printers">{desktopList.system.map((n) => <option key={n} value={`system:${n}`}>{n}</option>)}</optgroup> : null}
                  {desktopList?.serial.length ? <optgroup label="USB / Bluetooth (COM ports)">{desktopList.serial.map((p) => <option key={p.path} value={`serial:${p.path}`}>{p.label}</option>)}</optgroup> : null}
                  <option value="network">Network / LAN printer (IP address)…</option>
                </select>
              </div>
              <Button variant="outline" size="icon" aria-label="Refresh printer list" onClick={() => void loadDesktopPrinters()} disabled={busy === "list"}>
                {busy === "list" ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
              </Button>
            </div>
            {d?.kind === "network" && (
              <div className="grid grid-cols-[1fr_110px] gap-2">
                <div>
                  <Label htmlFor="ip" className="text-xs">Printer IP address</Label>
                  <Input id="ip" value={d.host} placeholder="192.168.1.100"
                    onChange={(e) => setDesktopTarget({ ...(d as NetworkTarget), host: e.target.value.trim(), label: `Network printer ${e.target.value.trim()}` })} />
                </div>
                <div>
                  <Label htmlFor="port" className="text-xs">Port</Label>
                  <Input id="port" type="number" value={d.port} onChange={(e) => setDesktopTarget({ ...(d as NetworkTarget), port: Number(e.target.value) || 9100 })} />
                </div>
                <p className="col-span-2 text-[11px] text-[var(--pt-text-tertiary)]">Hold the printer’s FEED button while switching it on to print its IP address.</p>
              </div>
            )}
            {d?.kind === "serial" && (
              <div className="max-w-[220px]">
                <Label htmlFor="dbaud" className="text-xs">Speed (baud)</Label>
                <select id="dbaud" className={selectCls} value={d.baud} onChange={(e) => setDesktopTarget({ ...(d as SerialTarget), baud: Number(e.target.value) })}>
                  {BAUDS.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
            )}
          </div>
        )}

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="paper" className="text-xs">Paper width</Label>
            <select id="paper" className={selectCls} value={config.paper ?? ""} onChange={(e) => setConfig({ paper: (e.target.value || null) as PaperWidth | null })}>
              <option value="">Organisation default ({orgPaper === "58mm" ? "58 mm" : "80 mm"})</option>
              <option value="58mm">58 mm (small, 32 characters)</option>
              <option value="80mm">80 mm (standard, 48 characters)</option>
            </select>
          </div>
          <div>
            <Label htmlFor="copies" className="text-xs">Copies per sale</Label>
            <select id="copies" className={selectCls} value={config.copies} onChange={(e) => setConfig({ copies: Number(e.target.value) })} disabled={config.mode === "browser"}>
              {[1, 2, 3].map((n) => <option key={n} value={n}>{n === 1 ? "1 (customer)" : `${n} (customer + shop)`}</option>)}
            </select>
          </div>
        </div>

        <div className="space-y-3">
          <Toggle label="Print the receipt automatically after each sale" hint={config.mode === "browser" ? "Opens the print dialog straight away." : "Prints without asking."}
            checked={config.autoPrint} onChange={(v) => setConfig({ autoPrint: v })} />
          <Toggle label="Open the cash drawer for cash sales" hint="For a drawer plugged into the printer’s RJ11 port. Direct printing only."
            checked={config.openDrawer && config.mode !== "browser"} disabled={config.mode === "browser"} onChange={(v) => setConfig({ openDrawer: v })} />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-[var(--pt-muted)] p-3">
          <Health h={printer} />
          <div className="flex flex-wrap gap-2">
            {config.mode !== "browser" && (
              <Button variant="outline" size="sm" onClick={() => run("check", recheck)} disabled={!!busy}>
                {busy === "check" ? <Loader2 size={14} className="animate-spin mr-1" /> : <RefreshCw size={14} className="mr-1" />} Check now
              </Button>
            )}
            <Button size="sm" className="bg-[var(--pt-green)] hover:bg-[var(--pt-green-600)] text-white" disabled={!!busy || (config.mode !== "browser" && printer.tone === "none")}
              onClick={() => run("test", async () => {
                if (config.mode === "browser") { setShowPreview(true); setTimeout(() => window.print(), 50); return }
                await printTestPage(config, paper, orgName)
                toast.success("Test page sent to the printer")
                await recheck()
              })}>
              {busy === "test" ? <Loader2 size={14} className="animate-spin mr-1" /> : <Printer size={14} className="mr-1" />} Print test page
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setShowPreview((v) => !v)}>{showPreview ? "Hide" : "Preview"} sample receipt</Button>
          </div>
        </div>

        {showPreview && (
          <div className="flex justify-center">
            <pre id="receipt-printable" aria-label="Sample receipt"
              className="bg-white text-black border border-dashed border-[var(--pt-border-strong)] rounded-lg p-3 text-[11px] leading-4 font-mono overflow-x-auto">
              {receiptPreview({ ...SAMPLE, shopName: orgName ?? SAMPLE.shopName }, paper).join("\n")}
            </pre>
            <style>{`@media print { @page { size: ${paper} auto; margin: 0; } }`}</style>
          </div>
        )}
      </Section>

      <Section icon={ScanBarcode} title="Barcode scanner">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-[var(--pt-muted)] p-3">
          <Health h={scanner} />
          {lastScanCode ? <span className="text-xs font-mono text-[var(--pt-text-secondary)]">Last code: {lastScanCode}</span> : null}
        </div>
        <div>
          <Label htmlFor="scan-test" className="text-sm font-medium">Test your scanner</Label>
          <Input id="scan-test" value={scanTest} onChange={(e) => setScanTest(e.target.value)} placeholder="Click here, then scan any barcode" className="mt-1.5"
            onKeyDown={(e) => {
              if (e.key !== "Enter") return
              e.preventDefault()
              const code = scanTest.trim()
              if (!code) return
              markScan(code)
              const ev = parseBarcode(code)
              setScanResult(ev.gtin
                ? `Read ${ev.type} — GTIN ${ev.gtin}${ev.batchNumber ? `, batch ${ev.batchNumber}` : ""}${ev.expiryDate ? `, expiry ${ev.expiryDate.toISOString().slice(0, 10)}` : ""}`
                : `Read “${code}”`)
              setScanTest("")
            }} />
          {scanResult ? <p className="mt-1.5 text-sm text-[var(--pt-green-700)] flex items-center gap-1.5"><CheckCircle2 size={14} /> {scanResult} — the scanner works.</p> : null}
        </div>
        <ul className="text-xs text-[var(--pt-text-secondary)] space-y-1 list-disc pl-4">
          <li>Use the scanner in <span className="font-semibold">keyboard (HID) mode</span> with <span className="font-semibold">Enter after each scan</span> and US keyboard layout — most scanners ship like this; the manual has setup barcodes if not.</li>
          <li><span className="font-semibold">USB:</span> just plug it in. <span className="font-semibold">Bluetooth:</span> pair it in the computer’s or tablet’s Bluetooth settings (it appears as a keyboard).</li>
          <li>Medicine packs carry square 2D codes (GS1 DataMatrix) with batch and expiry — choose a <span className="font-semibold">2D</span> scanner to read them.</li>
          <li>Browsers can’t see whether a scanner is plugged in, so this page shows when it last scanned. The Android app shows connected / disconnected.</li>
        </ul>
      </Section>
    </div>
  )
}
