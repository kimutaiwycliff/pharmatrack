"use client"

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Eye, ImagePlus, Loader2, RotateCcw, Trash2 } from "lucide-react"
import {
  PAPER_COLUMNS, RECEIPT_LIMITS, applyReceiptProfile, normalizeReceiptSettings,
  type PaperWidth, type ReceiptDoc, type ReceiptSettings,
} from "@pharmatrack/core"
import type { Branch, Organization } from "@pharmatrack/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { ReceiptPaper } from "@/components/pos/ReceiptPaper"
import { RECEIPT_PROFILE_KEY, useReceiptProfile } from "@/lib/printing/useReceiptProfile"
import { nairobiDateTime } from "@/lib/printing/printer"
import { processLogo, rasterPreview } from "@/lib/receipt/logo"

// Settings → Receipt: what every receipt says above and below the sale — on
// the thermal printer, the PDF, Android's printout and WhatsApp text. The
// preview renders the real shared receipt, so it can't drift from the till.

const FOOTER_IDEAS = [
  "Thank you - get well soon",
  "Please check your medicines before leaving",
  "Keep this receipt for returns and warranty",
  "Open Mon-Sat 8am-9pm, Sun 10am-4pm",
]

/** A believable sale for the preview (cents). */
function sampleDoc(orgName: string, branch: Branch | undefined): ReceiptDoc {
  return {
    shopName: orgName,
    branchName: branch?.name ?? "Main branch",
    address: branch?.address ?? null,
    phone: branch?.phone ?? null,
    receiptNumber: "RCP-000123",
    dateText: nairobiDateTime(new Date()),
    cashier: "Jane W.",
    customer: "Peter K.",
    lines: [
      { name: "Augmentin 625mg Tablets", qtyLabel: "14 tablets", unitPriceCents: 13000, totalCents: 182000 },
      { name: "Panadol Extra", qtyLabel: "2 x Strip of 10", unitPriceCents: 12000, totalCents: 21600, discountCents: 2400 },
    ],
    subtotalCents: 206000,
    discountCents: 2400,
    totalCents: 203600,
    paymentLabel: "M-Pesa",
    paidCents: 203600,
    changeCents: 0,
    mpesaReference: "SJK4H7Q2XP",
  }
}

const sameSettings = (a: ReceiptSettings, b: ReceiptSettings) => JSON.stringify(a) === JSON.stringify(b)

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="bg-[var(--pt-surface)] border border-[var(--pt-border)] rounded-xl p-5 space-y-4">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        {hint && <p className="text-xs text-[var(--pt-text-secondary)] mt-0.5">{hint}</p>}
      </div>
      {children}
    </section>
  )
}

function Toggle({ label, detail, checked, onChange, disabled }: {
  label: string; detail?: ReactNode; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean
}) {
  return (
    <label className={`flex items-center justify-between gap-4 py-1 ${disabled ? "opacity-60" : "cursor-pointer"}`}>
      <span className="min-w-0">
        <span className="block text-sm">{label}</span>
        {detail && <span className="block text-xs text-[var(--pt-text-tertiary)] truncate">{detail}</span>}
      </span>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} aria-label={label} />
    </label>
  )
}

/** A line input with a counter that warns when it will wrap on the paper in use. */
function LineInput({ value, onChange, placeholder, cols, disabled, label }: {
  value: string; onChange: (v: string) => void; placeholder?: string; cols: number; disabled?: boolean; label: string
}) {
  const n = value.length
  const wraps = n > cols
  return (
    <div>
      <div className="relative">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value.slice(0, RECEIPT_LIMITS.lineChars))}
          placeholder={placeholder}
          disabled={disabled}
          aria-label={label}
          className="pr-16"
        />
        <span
          className={`absolute right-3 top-1/2 -translate-y-1/2 text-[11px] tabular-nums ${wraps ? "text-amber-600" : "text-[var(--pt-text-tertiary)]"}`}
          aria-hidden
        >
          {n}/{cols}
        </span>
      </div>
      {wraps && <p className="text-[11px] text-amber-700 mt-1">Longer than one printed line — it will wrap onto two.</p>}
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-[var(--pt-text-secondary)] mb-1.5 uppercase tracking-wide">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-[var(--pt-text-tertiary)] mt-1">{hint}</p>}
    </div>
  )
}

/** Fixed-length editable list (header: 2 lines, footer: 3). */
function padLines(lines: string[], n: number) {
  return Array.from({ length: n }, (_, i) => lines[i] ?? "")
}

export function ReceiptSettingsPanel({ org, branches, readonly }: { org: Organization; branches: Branch[]; readonly: boolean }) {
  const queryClient = useQueryClient()
  const { data: profile, isLoading, refetch } = useReceiptProfile()
  // Unsaved edits on top of the saved settings (null = nothing changed yet).
  const [edits, setEdits] = useState<ReceiptSettings | null>(null)
  const [paper, setPaper] = useState<PaperWidth>(org.receipt_paper_width === "58mm" ? "58mm" : "80mm")
  const [saving, setSaving] = useState(false)
  const [logoBusy, setLogoBusy] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const saved = profile?.settings ?? null
  const draft = edits ?? saved
  const dirty = !!draft && !!saved && !sameSettings(normalizeReceiptSettings(draft), saved)
  const cols = PAPER_COLUMNS[paper]
  const branch = branches.find((b) => b.is_active) ?? branches[0]

  const doc = useMemo(() => {
    if (!draft) return null
    const info = {
      name: org.name,
      registration_number: org.registration_number ?? null,
      phone: org.phone ?? null,
      email: org.email ?? null,
      address: org.address ?? null,
    }
    return applyReceiptProfile(sampleDoc(org.name, branch), { org: info, settings: normalizeReceiptSettings(draft) }, branch)
  }, [draft, org, branch])

  const logoRaster = draft?.logo?.raster ?? null
  const printedLogo = useMemo(() => (logoRaster ? rasterPreview(logoRaster) : null), [logoRaster])

  // Leaving with unsaved changes: the browser's own "leave site?" prompt.
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [dirty])

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-6 max-w-5xl">
        <div className="space-y-4">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-40 rounded-xl bg-[var(--pt-muted-strong)] animate-pulse" />)}</div>
        <div className="hidden lg:block h-[520px] rounded-xl bg-[var(--pt-muted-strong)] animate-pulse" />
      </div>
    )
  }
  if (!draft || !doc) {
    return (
      <div className="max-w-xl rounded-xl border border-[var(--pt-border)] p-5">
        <p className="text-sm font-semibold">Couldn&apos;t load your receipt settings</p>
        <p className="text-xs text-[var(--pt-text-secondary)] mt-1">Check your connection and try again.</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={() => void refetch()}>Try again</Button>
      </div>
    )
  }

  // Narrowed for the handlers below (closures don't keep the guard's narrowing).
  const current: ReceiptSettings = draft
  const set = <K extends keyof ReceiptSettings>(k: K, v: ReceiptSettings[K]) => setEdits((e) => ({ ...(e ?? current), [k]: v }))
  const setLine = (k: "header_lines" | "footer_lines", n: number, i: number, v: string) => {
    const next = padLines(current[k], n)
    next[i] = v
    set(k, next)
  }

  async function onLogoFile(file: File | undefined) {
    if (!file) return
    setLogoBusy(true)
    try {
      set("logo", await processLogo(file))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't use that image")
    } finally {
      setLogoBusy(false)
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  function addFooterIdea(text: string) {
    const lines = padLines(current.footer_lines, RECEIPT_LIMITS.footerLines)
    if (lines.some((l) => l.trim() === text)) return
    const free = lines.findIndex((l) => !l.trim())
    if (free < 0) { toast.info("All three footer lines are in use — clear one first"); return }
    lines[free] = text
    set("footer_lines", lines)
  }

  async function save() {
    setSaving(true)
    try {
      const body: ReceiptSettings = {
        ...current,
        display_name: current.display_name?.trim() || null,
        kra_pin: current.kra_pin?.trim().toUpperCase() || null,
        header_lines: current.header_lines.map((l) => l.trim()).filter(Boolean),
        footer_lines: current.footer_lines.map((l) => l.trim()).filter(Boolean),
        qr_url: current.qr_url?.trim() || null,
        qr_caption: current.qr_url?.trim() ? current.qr_caption?.trim() || null : null,
      }
      const res = await fetch("/api/settings?target=receipt", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const json = (await res.json()) as { receipt?: ReceiptSettings; error?: string }
      if (!res.ok || !json.receipt) throw new Error(json.error ?? "Couldn't save")
      queryClient.setQueryData(RECEIPT_PROFILE_KEY, profile ? { ...profile, settings: json.receipt } : undefined)
      setEdits(null)
      toast.success("Receipt updated — new sales will print like the preview")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save")
    } finally {
      setSaving(false)
    }
  }

  const waLink = org.phone ? `https://wa.me/${org.phone.replace(/\D/g, "").replace(/^0/, "254")}` : null
  const missing = (v: string | null | undefined) => (v ? v : <span className="italic">Not set — add it under Organization</span>)

  const preview = (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--pt-text-secondary)]">Live preview</p>
        <div role="radiogroup" aria-label="Paper width" className="inline-flex rounded-lg border border-[var(--pt-border)] p-0.5 text-xs">
          {(["58mm", "80mm"] as const).map((p) => (
            <button
              key={p}
              role="radio"
              aria-checked={paper === p}
              onClick={() => setPaper(p)}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors ${paper === p ? "bg-[var(--pt-green)] text-white" : "text-[var(--pt-text-secondary)] hover:text-[var(--pt-text)]"}`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>
      <ReceiptPaper doc={doc} paper={paper} />
      <p className="text-[11px] text-[var(--pt-text-tertiary)] text-center">Sample sale. Printers, PDFs and WhatsApp receipts all use this layout.</p>
    </div>
  )

  return (
    <div className="max-w-5xl pb-24">
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-6 items-start">
        <div className="space-y-4 min-w-0">
          {readonly && (
            <p className="text-xs rounded-lg bg-[var(--pt-muted)] px-3 py-2 text-[var(--pt-text-secondary)]">
              Only the owner (or someone they allow) can change how receipts look.
            </p>
          )}

          <Section title="Logo" hint="Shown at the top of every receipt. Simple, high-contrast logos print best on receipt printers.">
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => void onLogoFile(e.target.files?.[0])} disabled={readonly} />
            {draft.logo ? (
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex gap-3">
                  <figure className="text-center">
                    {/* eslint-disable-next-line @next/next/no-img-element -- inline data URL */}
                    <img src={draft.logo.data_url} alt="Your logo" className="h-16 max-w-[140px] object-contain rounded border border-[var(--pt-border)] bg-white p-1" />
                    <figcaption className="text-[11px] text-[var(--pt-text-tertiary)] mt-1">On screen &amp; PDF</figcaption>
                  </figure>
                  {printedLogo && (
                    <figure className="text-center">
                      {/* eslint-disable-next-line @next/next/no-img-element -- inline data URL */}
                      <img src={printedLogo} alt="How the logo prints" className="h-16 max-w-[140px] object-contain rounded border border-[var(--pt-border)] bg-white p-1 [image-rendering:pixelated]" />
                      <figcaption className="text-[11px] text-[var(--pt-text-tertiary)] mt-1">On receipt printers</figcaption>
                    </figure>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={readonly || logoBusy}>
                    {logoBusy ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} />} Replace
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => set("logo", null)} disabled={readonly} className="text-[var(--pt-red,#dc2626)]">
                    <Trash2 size={14} /> Remove
                  </Button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); if (!readonly) void onLogoFile(e.dataTransfer.files[0]) }}
                disabled={readonly || logoBusy}
                className="w-full rounded-xl border-2 border-dashed border-[var(--pt-border-strong)] px-4 py-6 text-center hover:bg-[var(--pt-muted)] transition-colors disabled:opacity-60"
              >
                {logoBusy ? <Loader2 size={20} className="mx-auto animate-spin" /> : <ImagePlus size={20} className="mx-auto text-[var(--pt-text-secondary)]" />}
                <span className="block text-sm font-medium mt-2">Upload your logo</span>
                <span className="block text-xs text-[var(--pt-text-tertiary)]">PNG or JPG — drop it here or click to choose</span>
              </button>
            )}
            {draft.logo && (
              <Toggle
                label="Print the logo on receipt printers"
                detail="Turn off if your Bluetooth printer is slow with images"
                checked={draft.print_logo}
                onChange={(v) => set("print_logo", v)}
                disabled={readonly}
              />
            )}
          </Section>

          <Section title="Header" hint="Who the receipt is from. Address and phone come from the selling branch, falling back to the organization's.">
            <Field label="Name on receipt" hint={`Leave blank to use “${org.name}”. Use it for a trading name.`}>
              <Input
                value={draft.display_name ?? ""}
                onChange={(e) => set("display_name", e.target.value.slice(0, RECEIPT_LIMITS.displayName) || null)}
                placeholder={org.name}
                disabled={readonly}
              />
            </Field>
            <div className="divide-y divide-[var(--pt-border)]">
              <Toggle label="Branch name" detail={branch?.name} checked={draft.show_branch} onChange={(v) => set("show_branch", v)} disabled={readonly} />
              <Toggle label="Address" detail={missing(branch?.address || org.address)} checked={draft.show_address} onChange={(v) => set("show_address", v)} disabled={readonly} />
              <Toggle label="Phone number" detail={missing(branch?.phone || org.phone)} checked={draft.show_phone} onChange={(v) => set("show_phone", v)} disabled={readonly} />
              <Toggle label="Email" detail={missing(org.email)} checked={draft.show_email} onChange={(v) => set("show_email", v)} disabled={readonly} />
              <Toggle label="PPB licence number" detail={missing(org.registration_number)} checked={draft.show_licence} onChange={(v) => set("show_licence", v)} disabled={readonly} />
            </div>
            <Field label="KRA PIN" hint="Optional. Printed as “KRA PIN: …”.">
              <Input
                value={draft.kra_pin ?? ""}
                onChange={(e) => set("kra_pin", e.target.value.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, RECEIPT_LIMITS.kraPin) || null)}
                placeholder="P051234567X"
                disabled={readonly}
                className="font-mono uppercase"
              />
            </Field>
            <Field label="Extra header lines" hint="e.g. “Open 24 hours” or “Your neighbourhood chemist”.">
              <div className="space-y-2">
                {padLines(draft.header_lines, RECEIPT_LIMITS.headerLines).map((l, i) => (
                  <LineInput key={i} label={`Header line ${i + 1}`} value={l} cols={cols} onChange={(v) => setLine("header_lines", RECEIPT_LIMITS.headerLines, i, v)} disabled={readonly} />
                ))}
              </div>
            </Field>
          </Section>

          <Section title="Sale details" hint="What each sale shows between the header and the total.">
            <div className="divide-y divide-[var(--pt-border)]">
              <Toggle label="Served by (cashier's name)" checked={draft.show_cashier} onChange={(v) => set("show_cashier", v)} disabled={readonly} />
              <Toggle label="Customer name" detail="When one was entered at the till" checked={draft.show_customer} onChange={(v) => set("show_customer", v)} disabled={readonly} />
              <Toggle label="Unit price on each line" detail="“14 tablets @ 130.00”" checked={draft.show_unit_price} onChange={(v) => set("show_unit_price", v)} disabled={readonly} />
            </div>
          </Section>

          <Section title="Footer" hint="Up to three closing lines — a thank-you, your return policy or opening hours.">
            <div className="space-y-2">
              {padLines(draft.footer_lines, RECEIPT_LIMITS.footerLines).map((l, i) => (
                <LineInput key={i} label={`Footer line ${i + 1}`} value={l} cols={cols} onChange={(v) => setLine("footer_lines", RECEIPT_LIMITS.footerLines, i, v)} disabled={readonly} />
              ))}
            </div>
            {!readonly && (
              <div className="flex flex-wrap gap-1.5">
                {FOOTER_IDEAS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => addFooterIdea(t)}
                    className="text-xs rounded-full border border-[var(--pt-border)] px-2.5 py-1 hover:bg-[var(--pt-muted)] transition-colors"
                  >
                    + {t}
                  </button>
                ))}
              </div>
            )}
            <p className="text-[11px] text-[var(--pt-text-tertiary)]">
              Tip: avoid “goods once sold are not returnable” — under the Consumer Protection Act it doesn&apos;t remove a customer&apos;s right to return faulty goods.
            </p>
          </Section>

          <Section title="QR code" hint="Optional. Customers scan it to chat on WhatsApp, leave a review or visit your website.">
            <Field label="Link">
              <Input
                value={draft.qr_url ?? ""}
                onChange={(e) => set("qr_url", e.target.value.slice(0, RECEIPT_LIMITS.qrUrl) || null)}
                placeholder="https://wa.me/254712345678"
                inputMode="url"
                disabled={readonly}
              />
            </Field>
            {waLink && !readonly && !draft.qr_url && (
              <button type="button" onClick={() => { set("qr_url", waLink); if (!draft.qr_caption) set("qr_caption", "Scan to chat with us on WhatsApp") }} className="text-xs font-medium text-[var(--pt-green-600)] hover:underline">
                Use your WhatsApp ({org.phone})
              </button>
            )}
            {draft.qr_url && (
              <Field label="Caption under the code">
                <Input
                  value={draft.qr_caption ?? ""}
                  onChange={(e) => set("qr_caption", e.target.value.slice(0, RECEIPT_LIMITS.qrCaption) || null)}
                  placeholder="Scan to chat with us on WhatsApp"
                  disabled={readonly}
                />
              </Field>
            )}
          </Section>
        </div>

        <aside className="hidden lg:block lg:sticky lg:top-4">{preview}</aside>
      </div>

      {/* Save bar — sticky so it's reachable from any section; Preview opens a sheet on small screens. */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--pt-border)] bg-[var(--pt-surface)]/95 backdrop-blur px-4 py-3 lg:static lg:mt-6 lg:border-0 lg:bg-transparent lg:p-0">
        <div className="max-w-5xl flex items-center gap-2">
          <Button variant="outline" className="lg:hidden" onClick={() => setPreviewOpen(true)}>
            <Eye size={15} /> Preview
          </Button>
          <span className="hidden sm:block text-xs text-[var(--pt-text-secondary)] ml-auto lg:ml-0" aria-live="polite">
            {dirty ? "Unsaved changes" : "All changes saved"}
          </span>
          <div className="ml-auto flex gap-2">
            {dirty && (
              <Button variant="ghost" onClick={() => setEdits(null)} disabled={saving}>
                <RotateCcw size={14} /> Discard
              </Button>
            )}
            <Button
              onClick={() => void save()}
              disabled={readonly || !dirty || saving}
              className="bg-[var(--pt-green)] hover:bg-[var(--pt-green-600)] text-white"
            >
              {saving && <Loader2 size={14} className="animate-spin" />} Save changes
            </Button>
          </div>
        </div>
      </div>

      <Sheet open={previewOpen} onOpenChange={setPreviewOpen}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto p-4">
          <SheetHeader className="p-0">
            <SheetTitle>Receipt preview</SheetTitle>
          </SheetHeader>
          {preview}
        </SheetContent>
      </Sheet>
    </div>
  )
}
