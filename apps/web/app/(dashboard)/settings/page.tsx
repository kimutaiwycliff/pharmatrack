"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Building2, GitBranch, User, Palette, Syringe, CreditCard, Smartphone, ShieldCheck } from "lucide-react"
import { hasFeature, type Feature, type Capability } from "@pharmatrack/core"
import { OrgSettingsForm } from "@/components/settings/OrgSettingsForm"
import { BranchList } from "@/components/settings/BranchList"
import { ProfileSettingsForm } from "@/components/settings/ProfileSettingsForm"
import { AppointmentServiceList, SERVICES_MANAGE_KEY } from "@/components/settings/AppointmentServiceList"
import { BillingPanel } from "@/components/settings/BillingPanel"
import { MpesaSettings } from "@/components/settings/MpesaSettings"
import { RolePermissionsPanel } from "@/components/settings/RolePermissionsPanel"
import { ThemeSegmented } from "@/components/theme/ThemeToggle"
import { useSessionStore } from "@/lib/store/sessionStore"
import type { Organization, Branch, Profile, AppointmentService } from "@pharmatrack/types"

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

type Tab = "org" | "branches" | "services" | "payments" | "billing" | "permissions" | "profile" | "appearance"

// `anyOf`: shown when the user holds any of these permissions (omit = everyone).
// `ownerOnly`: the permissions matrix itself is never delegable.
const TABS: { key: Tab; label: string; icon: React.ElementType; anyOf?: Capability[]; ownerOnly?: boolean; requiresFeature?: Feature }[] = [
  { key: "org",        label: "Organization", icon: Building2, anyOf: ["settings.organization", "branches.manage"] },
  { key: "branches",   label: "Branches",     icon: GitBranch, anyOf: ["settings.organization", "branches.manage"] },
  { key: "services",   label: "Services",     icon: Syringe, anyOf: ["appointment_services.manage", "appointments.manage"] },
  { key: "payments",   label: "Payments",     icon: Smartphone, anyOf: ["settings.organization"], requiresFeature: "mpesa_stk" },
  { key: "billing",    label: "Billing",      icon: CreditCard, anyOf: ["billing.manage"] },
  { key: "permissions", label: "Roles & permissions", icon: ShieldCheck, ownerOnly: true },
  { key: "profile",    label: "My Profile",   icon: User },
  { key: "appearance", label: "Appearance",   icon: Palette },
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
  const [chosenTab, setTab] = useState<Tab | null>(null)
  const tab: Tab = chosenTab && visibleTabs.some((t) => t.key === chosenTab) ? chosenTab : (visibleTabs[0]?.key ?? "profile")
  const { data, isLoading } = useSettings()

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

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-[var(--pt-border)] overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
        {visibleTabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px shrink-0 whitespace-nowrap transition-colors ${
              tab === key
                ? "border-[var(--pt-green)] text-[var(--pt-green-600)]"
                : "border-transparent text-[var(--pt-text-secondary)] hover:text-[var(--pt-text)]"
            }`}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
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
      ) : tab === "permissions" ? (
        <RolePermissionsPanel />
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
          {tab === "branches" && (
            <BranchList branches={data.branches} isOwner={canEditOrg} />
          )}
          {tab === "profile" && (
            <ProfileSettingsForm profile={data.profile} hasPin={data.has_pin} />
          )}
        </>
      ) : (
        <p className="text-sm text-[var(--pt-text-tertiary)]">Failed to load settings</p>
      )}
    </div>
  )
}
