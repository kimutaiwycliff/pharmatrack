"use client"

import { useEffect, useState } from "react"
import { Loader2, CheckCircle2, AlertTriangle, Smartphone, ChevronDown } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

interface Cfg {
  environment: "sandbox" | "production"
  shortcode: string | null
  shortcode_type: "buygoods" | "paybill"
  consumer_key: string | null
  active: boolean
  verified_at: string | null
  has_secret: boolean
  has_passkey: boolean
}

const selectCls = "h-10 w-full rounded-lg border border-[var(--pt-border)] px-3 bg-[var(--pt-surface)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pt-green)]"
const labelCls = "block text-xs font-semibold text-[var(--pt-text-secondary)] uppercase tracking-wide mb-1.5"

export function MpesaSettings() {
  const [loading, setLoading] = useState(true)
  const [planAllowed, setPlanAllowed] = useState(false)
  const [configured, setConfigured] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [showGuide, setShowGuide] = useState(false)

  const [environment, setEnvironment] = useState<"sandbox" | "production">("sandbox")
  const [shortcode, setShortcode] = useState("")
  const [shortcodeType, setShortcodeType] = useState<"buygoods" | "paybill">("buygoods")
  const [consumerKey, setConsumerKey] = useState("")
  const [consumerSecret, setConsumerSecret] = useState("")
  const [passkey, setPasskey] = useState("")
  const [active, setActive] = useState(false)
  const [hasSecret, setHasSecret] = useState(false)
  const [hasPasskey, setHasPasskey] = useState(false)
  const [verifiedAt, setVerifiedAt] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      const res = await fetch("/api/settings/mpesa")
      const json = (await res.json()) as { config: Cfg | null; planAllowed: boolean; configured: boolean }
      setPlanAllowed(json.planAllowed)
      setConfigured(json.configured)
      const c = json.config
      if (c) {
        setEnvironment(c.environment); setShortcode(c.shortcode ?? ""); setShortcodeType(c.shortcode_type)
        setConsumerKey(c.consumer_key ?? ""); setActive(c.active); setHasSecret(c.has_secret)
        setHasPasskey(c.has_passkey); setVerifiedAt(c.verified_at)
      }
    } catch { toast.error("Failed to load M-Pesa settings") } finally { setLoading(false) }
  }
  // Load the saved config once on mount (canonical data-fetch effect).
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load() }, [])

  async function save() {
    setSaving(true)
    try {
      const res = await fetch("/api/settings/mpesa", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          environment, shortcode, shortcode_type: shortcodeType, consumer_key: consumerKey,
          ...(consumerSecret ? { consumer_secret: consumerSecret } : {}),
          ...(passkey ? { passkey } : {}),
          active,
        }),
      })
      const json = (await res.json()) as { error?: string; configured?: boolean }
      if (!res.ok) throw new Error(json.error ?? "Save failed")
      setConsumerSecret(""); setPasskey("")
      toast.success("M-Pesa settings saved")
      await load()
    } catch (e) { toast.error(e instanceof Error ? e.message : "Error") } finally { setSaving(false) }
  }

  async function test(withStk: boolean) {
    let stkPhone: string | undefined
    if (withStk) {
      const p = window.prompt("Send a KES 1 test prompt to which phone? (e.g. 07XXXXXXXX)")
      if (!p) return
      stkPhone = p
    }
    setTesting(true)
    try {
      const res = await fetch("/api/settings/mpesa/test", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(stkPhone ? { stkPhone } : {}),
      })
      const json = (await res.json()) as { ok: boolean; error?: string; stk?: { message: string } }
      if (json.ok) { toast.success(json.stk?.message ?? "Connection verified ✓"); await load() }
      else toast.error(json.stk?.message ?? json.error ?? "Test failed")
    } catch (e) { toast.error(e instanceof Error ? e.message : "Error") } finally { setTesting(false) }
  }

  if (loading) return <div className="flex items-center gap-2 text-[var(--pt-text-secondary)] text-sm"><Loader2 size={16} className="animate-spin" /> Loading…</div>

  return (
    <div className="max-w-xl space-y-5">
      {!planAllowed && (
        <div className="flex gap-2.5 rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-500/10 p-3.5 text-sm">
          <AlertTriangle size={16} className="text-amber-600 mt-0.5 shrink-0" />
          <p className="text-amber-800 dark:text-amber-200">
            <strong>STK push (auto-prompt) is a Growth-plan feature.</strong> You can still save your till here and take
            M-Pesa via manual confirm; upgrade to Growth to auto-prompt customers’ phones.
          </p>
        </div>
      )}

      {/* Status */}
      <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
        {configured
          ? <span className="inline-flex items-center gap-1 text-[var(--pt-green-600)]"><CheckCircle2 size={14} /> Configured</span>
          : <span className="inline-flex items-center gap-1 text-[var(--pt-text-tertiary)]"><AlertTriangle size={14} /> Not configured</span>}
        {verifiedAt && <span className="inline-flex items-center gap-1 text-[var(--pt-green-600)]">· Verified</span>}
        {active && configured && planAllowed && <span className="text-[var(--pt-green-600)]">· STK live at the till</span>}
      </div>

      {/* Guide */}
      <button onClick={() => setShowGuide((v) => !v)} className="flex items-center gap-1.5 text-xs font-semibold text-[var(--pt-green-600)]">
        <ChevronDown size={14} className={showGuide ? "rotate-180 transition-transform" : "transition-transform"} /> Where do I get these?
      </button>
      {showGuide && (
        <ol className="text-xs text-[var(--pt-text-secondary)] leading-relaxed list-decimal ml-4 space-y-1 bg-[var(--pt-muted)] rounded-xl p-3.5">
          <li>Sign in at <strong>developer.safaricom.co.ke</strong> → <em>My Apps</em> → Create an app and enable <em>Lipa na M-Pesa Online</em>.</li>
          <li>Copy the app’s <strong>Consumer Key</strong> and <strong>Consumer Secret</strong>.</li>
          <li>Under <em>Lipa na M-Pesa Online</em>, add your <strong>Till (Buy Goods)</strong> or <strong>Paybill</strong> number as the shortcode and copy its <strong>Passkey</strong>.</li>
          <li>Save below, click <strong>Test connection</strong>, then <strong>Send test STK</strong> to confirm — money lands directly in your till.</li>
        </ol>
      )}

      {/* Form */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Environment</label>
          <select className={selectCls} value={environment} onChange={(e) => setEnvironment(e.target.value as "sandbox" | "production")}>
            <option value="sandbox">Sandbox (testing)</option>
            <option value="production">Production (live)</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>Shortcode type</label>
          <select className={selectCls} value={shortcodeType} onChange={(e) => setShortcodeType(e.target.value as "buygoods" | "paybill")}>
            <option value="buygoods">Buy Goods (Till)</option>
            <option value="paybill">Pay Bill</option>
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls}>Shortcode (till / paybill number)</label>
          <Input value={shortcode} onChange={(e) => setShortcode(e.target.value)} placeholder="e.g. 174379" className="h-10" />
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls}>Consumer key</label>
          <Input value={consumerKey} onChange={(e) => setConsumerKey(e.target.value)} placeholder="From your Daraja app" className="h-10" />
        </div>
        <div>
          <label className={labelCls}>Consumer secret</label>
          <Input type="password" value={consumerSecret} onChange={(e) => setConsumerSecret(e.target.value)} placeholder={hasSecret ? "•••••• (unchanged)" : "Consumer secret"} className="h-10" />
        </div>
        <div>
          <label className={labelCls}>Passkey</label>
          <Input type="password" value={passkey} onChange={(e) => setPasskey(e.target.value)} placeholder={hasPasskey ? "•••••• (unchanged)" : "Lipa na M-Pesa passkey"} className="h-10" />
        </div>
      </div>

      <label className="flex items-center gap-2.5 text-sm">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="w-4 h-4 accent-[var(--pt-green)]" />
        <span>Enable M-Pesa STK push at the till {planAllowed ? "" : "(requires Growth plan)"}</span>
      </label>

      <div className="flex flex-wrap gap-2 pt-1">
        <Button onClick={save} disabled={saving} className="gap-1.5 bg-[var(--pt-green)] hover:bg-[var(--pt-green-600)] text-white">
          {saving && <Loader2 size={14} className="animate-spin" />} Save
        </Button>
        <Button variant="outline" onClick={() => test(false)} disabled={testing || !configured} className="gap-1.5">
          {testing && <Loader2 size={14} className="animate-spin" />} Test connection
        </Button>
        <Button variant="outline" onClick={() => test(true)} disabled={testing || !configured} className="gap-1.5">
          <Smartphone size={14} /> Send test STK
        </Button>
      </div>
      <p className="text-xs text-[var(--pt-text-tertiary)]">Secrets are encrypted at rest and never shown again — leave the secret/passkey blank to keep the saved values.</p>
    </div>
  )
}
