"use client"

import { useQuery } from "@tanstack/react-query"
import { Building2, GitBranch, User, Palette, Syringe, CreditCard, Smartphone, ShieldCheck, TabletSmartphone, Printer, ReceiptText } from "lucide-react"
import { hasFeature, type Feature, type Capability } from "@pharmatrack/core"
import { OrgSettingsForm } from "@/components/settings/OrgSettingsForm"
import { BranchList } from "@/components/settings/BranchList"
import { ProfileSettingsForm } from "@/components/settings/ProfileSettingsForm"
import { AppointmentServiceList, SERVICES_MANAGE_KEY } from "@/components/settings/AppointmentServiceList"
import { BillingPanel } from "@/components/settings/BillingPanel"
import { MpesaSettings } from "@/components/settings/MpesaSettings"
import { RolePermissionsPanel } from "@/components/settings/RolePermissionsPanel"
import { DevicesPanel } from "@/components/settings/DevicesPanel"
import { HardwarePanel } from "@/components/settings/HardwarePanel"
import { ReceiptSettingsPanel } from "@/components/settings/ReceiptSettingsPanel"
import { ThemeSegmented } from "@/components/theme/ThemeToggle"
import { useSessionStore } from "@/lib/store/sessionStore"
import { useUrlParams } from "@/lib/hooks/useUrlParams"
import type { Organization, Branch, Profile, AppointmentService } from "@pharmatrack/types"
import { LoadError } from "@/components/LoadError"

interface SettingsData {
  org: Organization
  profile: Profile
  has_pin: boolean
  branches: Branch[]
}

function useSettings() {
  return useQuery<SettingsData>({
    queryKey: ["settings"],
    queryFn: async () => {
      const res = await fetch("/api/settings")
      if (!res.ok) throw new Error("Failed to load settings")
      return res.json() as Promise<SettingsData>
    },
    staleTime: 60_000,
  })
}

type Tab = "org" | "receipt" | "branches" | "devices" | "hardware" | "services" | "payments" | "billing" | "permissions" | "profile" | "appearance"

// `anyOf`: shown when the user holds any of these permissions (omit = everyone).
// `ownerOnly`: the permissions matrix itself is never delegable.
const TABS: { key: Tab; label: string; icon: React.ElementType; group: string; anyOf?: Capability[]; ownerOnly?: boolean; requiresFeature?: Feature }[] = [
  { key: "org",        group: "Pharmacy", label: "Organization", icon: Building2, anyOf: ["settings.organization", "branches.manage"] },
  // How every receipt is branded (header, footer, logo, QR) — owner by default.
  { key: "receipt",    group: "Pharmacy", label: "Receipt",      icon: ReceiptText, anyOf: ["settings.organization"] },
  { key: "branches",   group: "Pharmacy", label: "Branches",     icon: GitBranch, anyOf: ["settings.organization", "branches.manage"] },
  { key: "devices",    group: "Devices", label: "Devices",      icon: TabletSmartphone, anyOf: ["devices.manage"] },
  // This till's own printer + scanner (saved on the device) — anyone at the till.
  { key: "hardware",   group: "Devices", label: "Printer & scanner", icon: Printer },
  { key: "services",   group: "Pharmacy", label: "Services",     icon: Syringe, anyOf: ["appointment_services.manage", "appointments.manage"] },
  { key: "payments",   group: "Pharmacy", label: "Payments",     icon: Smartphone, anyOf: ["settings.organization"], requiresFeature: "mpesa_stk" },
  { key: "billing",    group: "Billing", label: "Billing",      icon: CreditCard, anyOf: ["billing.manage"] },
  { key: "permissions", group: "Team", label: "Roles & permissions", icon: ShieldCheck, ownerOnly: true },
  { key: "profile",    group: "Account", label: "My Profile",   icon: User },
  { key: "appearance", group: "Account", label: "Appearance",   icon: Palette },
]

export default function SettingsPage() {
  const profile = useSessionStore((s) => s.profile)
  const planCode = useSessionStore((s) => s.planCode)
  const permissions = useSessionStore((s) => s.permissions)
  const isOwner = profile?.role === "owner"
  const visibleTabs = TABS.filter((t) =>
    (!t.ownerOnly || isOwner) &&
    (!t.anyOf || t.anyOf.some((c) => permissions.includes(c))) &&
    (!t.requiresFeature || hasFeature(planCode, t.requiresFeature)),
  )
  // The open tab is in the URL (/settings?tab=hardware — the POS header's
  // device badges link there): Back steps between tabs, refresh keeps it.
  const [params, setParams] = useUrlParams({ tab: "" })
  const setTab = (t: Tab) => setParams({ tab: t }, { push: true })
  const tab: Tab = visibleTabs.some((t) => t.key === params.tab) ? (params.tab as Tab) : (visibleTabs[0]?.key ?? "profile")
  // Grouped (11 tabs in one strip ran off the screen on phones).
  const GROUP_ORDER = ["Pharmacy", "Devices", "Team", "Billing", "Account"]
  const groups = GROUP_ORDER
    .map((g) => ({ label: g, tabs: visibleTabs.filter((t) => t.group === g) }))
    .filter((g) => g.tabs.length > 0)
  const { data, isLoading, isLoadingError, refetch } = useSettings()

  const canEditOrg = permissions.includes("settings.organization")
  const canManageServices = permissions.includes("appointment_services.manage")

  const { data: services = [], isLoading: servicesLoading } = useQuery<AppointmentService[]>({
    queryKey: SERVICES_MANAGE_KEY,
    queryFn: async () => {
      const res = await fetch("/api/appointment-services?includeInactive=true")
      if (!res.ok) throw new Error("Failed to load services")
      const json = (await res.json()) as { services: AppointmentService[] }
      return json.services
    },
    staleTime: 60_000,
    enabled: tab === "services",
  })

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-[var(--pt-text-secondary)] mt-0.5">
          Manage your organization, branches, and account
        </p>
      </div>

      <div className="lg:grid lg:grid-cols-[210px_minmax(0,1fr)] lg:gap-8">
      {/* Phones: one menu instead of a strip of tabs off the screen */}
      <div className="lg:hidden mb-6">
        <label htmlFor="settings-section" className="block text-xs font-semibold text-[var(--pt-text-secondary)] uppercase tracking-wide mb-1.5">Section</label>
        <select
          id="settings-section"
          value={tab}
          onChange={(e) => setTab(e.target.value as Tab)}
          className="w-full h-11 px-3 rounded-lg border border-[var(--pt-border)] bg-[var(--pt-surface)] text-sm font-semibold"
        >
          {groups.map((g) => (
            <optgroup key={g.label} label={g.label}>
              {g.tabs.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </optgroup>
          ))}
        </select>
      </div>

      {/* Desktop: grouped list down the side */}
      <nav aria-label="Settings sections" className="hidden lg:block">
        {groups.map((g) => (
          <div key={g.label} className="mb-4">
            <p className="px-3 mb-1 text-[10.5px] font-bold uppercase tracking-wider text-[var(--pt-text-tertiary)]">{g.label}</p>
            {g.tabs.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                aria-current={tab === key ? "page" : undefined}
                className={`w-full flex items-center gap-2.5 px-3 h-9 rounded-lg text-sm font-medium text-left transition-colors ${
                  tab === key
                    ? "bg-[var(--pt-green-50)] text-[var(--pt-green-600)] font-semibold"
                    : "text-[var(--pt-text-secondary)] hover:bg-[var(--pt-muted)] hover:text-[var(--pt-text)]"
                }`}
              >
                <Icon size={15} className="shrink-0" />
                {label}
              </button>
            ))}
          </div>
        ))}
      </nav>

      {/* Content */}
      <div className="min-w-0">
      {tab === "appearance" ? (
        <div className="max-w-xl">
          <p className="text-sm font-semibold mb-1">Theme</p>
          <p className="text-xs text-[var(--pt-text-secondary)] mb-3">
            Choose how PharmaTrack looks. <span className="font-medium">System</span> follows your device setting.
          </p>
          <ThemeSegmented />
        </div>
      ) : tab === "services" ? (
        servicesLoading ? (
          <div className="max-w-2xl bg-[var(--pt-surface)] rounded-xl border border-[var(--pt-border)] overflow-hidden">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="px-5 py-4 border-b border-[var(--pt-border)] last:border-b-0 animate-pulse">
                <div className="h-3.5 bg-[var(--pt-muted-strong)] rounded w-48 mb-2" />
                <div className="h-2.5 bg-[var(--pt-muted-strong)] rounded w-28" />
              </div>
            ))}
          </div>
        ) : (
          <AppointmentServiceList services={services} canManage={canManageServices} />
        )
      ) : tab === "payments" ? (
        <MpesaSettings />
      ) : tab === "billing" ? (
        <BillingPanel />
      ) : tab === "devices" ? (
        <DevicesPanel />
      ) : tab === "hardware" ? (
        <HardwarePanel orgName={data?.org.name ?? null} orgPaper={data?.org.receipt_paper_width ?? null} />
      ) : tab === "permissions" ? (
        <RolePermissionsPanel />
      ) : isLoadingError ? (
        <LoadError what="your settings" onRetry={refetch} className="max-w-xl" />
      ) : isLoading ? (
        <div className="max-w-xl space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-14 bg-[var(--pt-muted-strong)] rounded-xl animate-pulse" />
          ))}
        </div>
      ) : data ? (
        <>
          {tab === "org" && (
            <OrgSettingsForm org={data.org} readonly={!canEditOrg} />
          )}
          {tab === "receipt" && (
            <ReceiptSettingsPanel org={data.org} branches={data.branches} readonly={!canEditOrg} />
          )}
          {tab === "branches" && (
            <BranchList branches={data.branches} isOwner={canEditOrg} />
          )}
          {tab === "profile" && (
            <ProfileSettingsForm profile={data.profile} hasPin={data.has_pin} />
          )}
        </>
      ) : (
        <LoadError what="your settings" onRetry={refetch} className="max-w-xl" />
      )}
      </div>
      </div>
    </div>
  )
}
