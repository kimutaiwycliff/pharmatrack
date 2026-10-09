"use client"

import { useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Lock, RotateCcw, Search, ShieldCheck, Loader2 } from "lucide-react"
import {
  CAPABILITIES, CAPABILITY_KEYS, CONFIGURABLE_ROLES, PERMISSION_GROUPS, defaultAllows, toggleCapability,
  type Capability, type StaffRole,
} from "@pharmatrack/core"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useConfirm } from "@/components/ui/confirm-dialog"

type Matrix = Record<StaffRole, Capability[]>

const ROLE_LABEL: Record<StaffRole, string> = {
  owner: "Owner", manager: "Manager", pharmacist: "Pharmacist", cashier: "Cashier",
}

const ALL_ROLES: StaffRole[] = ["owner", ...CONFIGURABLE_ROLES]
const MATRIX_KEY = ["settings", "permissions"]

type Change = { role: StaffRole; capability: Capability; allowed: boolean } | { reset: StaffRole | "all" }

function describeChange(role: StaffRole, before: Capability[], after: Capability[]) {
  const granted = after.filter((c) => !before.includes(c))
  const revoked = before.filter((c) => !after.includes(c))
  const names = (cs: Capability[]) => cs.map((c) => `“${CAPABILITIES[c].label}”`).join(", ")
  if (granted.length > 0) {
    return {
      title: `${ROLE_LABEL[role]}s: “${CAPABILITIES[granted[0]!].label}” turned on`,
      description: granted.length > 1 ? `Also turned on (it needs them): ${names(granted.slice(1))}` : undefined,
    }
  }
  if (revoked.length > 0) {
    return {
      title: `${ROLE_LABEL[role]}s: “${CAPABILITIES[revoked[0]!].label}” turned off`,
      description: revoked.length > 1 ? `Also turned off (they depend on it): ${names(revoked.slice(1))}` : undefined,
    }
  }
  return null
}

export function RolePermissionsPanel() {
  const queryClient = useQueryClient()
  const confirm = useConfirm()
  const [query, setQuery] = useState("")
  // Narrow screens show one role at a time; wide screens show the full matrix.
  const [mobileRole, setMobileRole] = useState<StaffRole>("manager")

  const { data, isLoading, isError } = useQuery<{ matrix: Matrix }>({
    queryKey: MATRIX_KEY,
    queryFn: async () => {
      const res = await fetch("/api/settings/permissions")
      if (!res.ok) throw new Error("Failed to load permissions")
      return res.json() as Promise<{ matrix: Matrix }>
    },
  })

  const mutation = useMutation({
    mutationFn: async (change: Change) => {
      const res = await fetch("/api/settings/permissions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(change),
      })
      const json = (await res.json()) as { matrix?: Matrix; error?: string }
      if (!res.ok || !json.matrix) throw new Error(json.error ?? "Failed to save")
      return { matrix: json.matrix }
    },
    // Optimistic: flip the cell (with its dependency cascade) immediately.
    onMutate: async (change) => {
      await queryClient.cancelQueries({ queryKey: MATRIX_KEY })
      const previous = queryClient.getQueryData<{ matrix: Matrix }>(MATRIX_KEY)
      if (previous && !("reset" in change)) {
        const before = previous.matrix[change.role]
        const after = toggleCapability(before, change.capability, change.allowed)
        queryClient.setQueryData(MATRIX_KEY, { matrix: { ...previous.matrix, [change.role]: after } })
        const msg = describeChange(change.role, before, after)
        if (msg) toast.success(msg.title, { description: msg.description })
      }
      return { previous }
    },
    onError: (err, _change, context) => {
      if (context?.previous) queryClient.setQueryData(MATRIX_KEY, context.previous)
      toast.error(err instanceof Error ? err.message : "Failed to save")
    },
    onSuccess: (json, change) => {
      queryClient.setQueryData(MATRIX_KEY, json)
      if ("reset" in change) {
        toast.success(change.reset === "all" ? "All roles reset to defaults" : `${ROLE_LABEL[change.reset]} reset to defaults`)
      }
    },
  })

  const q = query.trim().toLowerCase()
  const groups = useMemo(() => PERMISSION_GROUPS.map((group) => ({
    group,
    caps: CAPABILITY_KEYS.filter((c) => {
      const def = CAPABILITIES[c]
      return def.group === group && (!q || def.label.toLowerCase().includes(q) || def.description.toLowerCase().includes(q))
    }),
  })).filter((g) => g.caps.length > 0), [q])

  const customisedCount = (role: StaffRole) =>
    data ? CAPABILITY_KEYS.filter((c) => defaultAllows(role, c) !== data.matrix[role].includes(c)).length : 0

  async function reset(role: StaffRole | "all") {
    const ok = await confirm(
      role === "all"
        ? "Every role goes back to PharmaTrack's default permissions. Signed-in staff pick it up within a minute."
        : `${ROLE_LABEL[role]}s go back to PharmaTrack's default permissions.`,
      { title: "Reset to defaults?", confirmLabel: "Reset" },
    )
    if (ok) mutation.mutate({ reset: role })
  }

  function cell(matrix: Matrix, role: StaffRole, cap: Capability) {
    if (role === "owner") {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--pt-text-tertiary)]" title="The owner always has every permission">
          <Lock size={12} /> Always
        </span>
      )
    }
    const on = matrix[role].includes(cap)
    const changed = defaultAllows(role, cap) !== on
    return (
      <span className="inline-flex items-center gap-1.5">
        <Switch
          checked={on}
          onCheckedChange={(checked) => mutation.mutate({ role, capability: cap, allowed: checked })}
          aria-label={`${CAPABILITIES[cap].label} for ${ROLE_LABEL[role]}`}
        />
        <span
          className={`w-1.5 h-1.5 rounded-full ${changed ? "bg-amber-500" : "bg-transparent"}`}
          title={changed ? "Changed from the default" : undefined}
        />
      </span>
    )
  }

  if (isLoading) {
    return (
      <div className="max-w-4xl space-y-3">
        {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-12 bg-[var(--pt-muted-strong)] rounded-xl animate-pulse" />)}
      </div>
    )
  }
  if (isError || !data) return <p className="text-sm text-[var(--pt-text-tertiary)]">Failed to load permissions.</p>
  const { matrix } = data

  return (
    <div className="max-w-5xl">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-base font-bold flex items-center gap-2">
            <ShieldCheck size={17} className="text-[var(--pt-green)]" /> Roles & permissions
          </h2>
          <p className="text-sm text-[var(--pt-text-secondary)] mt-0.5 max-w-2xl">
            Choose exactly what each role can do. Changes save instantly and reach staff who are already signed in
            within a minute. Owners always have full access.{" "}
            <span className="inline-flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> marks a change from the default.
            </span>
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={() => reset("all")} disabled={mutation.isPending}>
          <RotateCcw size={13} /> Reset all
        </Button>
      </div>

      <div className="relative mb-4 max-w-sm">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--pt-text-tertiary)]" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search permissions…" className="pl-8 h-9" />
      </div>

      {/* Role picker — narrow screens only */}
      <div className="md:hidden flex gap-1 p-1 mb-3 rounded-lg bg-[var(--pt-muted)]">
        {CONFIGURABLE_ROLES.map((r) => (
          <button
            key={r}
            onClick={() => setMobileRole(r)}
            className={`flex-1 py-1.5 rounded-md text-xs font-semibold transition-colors ${
              mobileRole === r ? "bg-[var(--pt-surface)] shadow-sm text-[var(--pt-text)]" : "text-[var(--pt-text-secondary)]"
            }`}
          >
            {ROLE_LABEL[r]}
            {customisedCount(r) > 0 && <span className="ml-1 text-amber-600">•</span>}
          </button>
        ))}
      </div>
      {customisedCount(mobileRole) > 0 && (
        <button onClick={() => reset(mobileRole)} className="md:hidden mb-3 text-xs text-[var(--pt-green-600)] font-semibold">
          Reset {ROLE_LABEL[mobileRole]} to defaults
        </button>
      )}

      <div className="bg-[var(--pt-surface)] rounded-xl border border-[var(--pt-border)] overflow-hidden">
        {/* Header row — wide screens */}
        <div className="hidden md:grid grid-cols-[1fr_repeat(4,7.5rem)] items-end gap-2 px-5 py-3 border-b border-[var(--pt-border)] bg-[var(--pt-muted)]">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--pt-text-secondary)]">Permission</span>
          {ALL_ROLES.map((r) => (
            <div key={r} className="text-center">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--pt-text-secondary)]">{ROLE_LABEL[r]}</p>
              {r !== "owner" && customisedCount(r) > 0 && (
                <button onClick={() => reset(r)} className="text-[10px] text-[var(--pt-green-600)] hover:underline">
                  Reset ({customisedCount(r)})
                </button>
              )}
            </div>
          ))}
        </div>

        {groups.map(({ group, caps }) => (
          <section key={group}>
            <h3 className="px-5 pt-4 pb-2 text-xs font-bold uppercase tracking-wide text-[var(--pt-text-secondary)] border-b border-[var(--pt-border)]">
              {group}
            </h3>
            {caps.map((cap) => (
              <div
                key={cap}
                className="grid grid-cols-[1fr_auto] md:grid-cols-[1fr_repeat(4,7.5rem)] items-center gap-3 px-5 py-3 border-b border-[var(--pt-border)] last:border-b-0"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">{CAPABILITIES[cap].label}</p>
                  <p className="text-xs text-[var(--pt-text-secondary)] mt-0.5">{CAPABILITIES[cap].description}</p>
                </div>
                <div className="md:hidden">{cell(matrix, mobileRole, cap)}</div>
                {ALL_ROLES.map((r) => (
                  <div key={r} className="hidden md:flex justify-center">{cell(matrix, r, cap)}</div>
                ))}
              </div>
            ))}
          </section>
        ))}
        {groups.length === 0 && (
          <p className="px-5 py-8 text-sm text-center text-[var(--pt-text-tertiary)]">No permissions match “{query}”.</p>
        )}
      </div>

      {mutation.isPending && (
        <p className="mt-3 text-xs text-[var(--pt-text-tertiary)] flex items-center gap-1.5">
          <Loader2 size={12} className="animate-spin" /> Saving…
        </p>
      )}
    </div>
  )
}
