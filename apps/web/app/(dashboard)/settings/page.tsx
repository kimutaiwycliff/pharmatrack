"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Building2, GitBranch, User, Palette, Syringe, CreditCard } from "lucide-react"
import { OrgSettingsForm } from "@/components/settings/OrgSettingsForm"
import { BranchList } from "@/components/settings/BranchList"
import { ProfileSettingsForm } from "@/components/settings/ProfileSettingsForm"
import { AppointmentServiceList, SERVICES_MANAGE_KEY } from "@/components/settings/AppointmentServiceList"
import { BillingPanel } from "@/components/settings/BillingPanel"
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

type Tab = "org" | "branches" | "services" | "billing" | "profile" | "appearance"

const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
  { key: "org",        label: "Organization", icon: Building2 },
  { key: "branches",   label: "Branches",     icon: GitBranch },
  { key: "services",   label: "Services",     icon: Syringe },
  { key: "billing",    label: "Billing",      icon: CreditCard },
  { key: "profile",    label: "My Profile",   icon: User },
  { key: "appearance", label: "Appearance",   icon: Palette },
]

export default function SettingsPage() {
  const profile = useSessionStore((s) => s.profile)
  const [tab, setTab] = useState<Tab>("org")
  const { data, isLoading } = useSettings()

  const isOwner = profile?.role === "owner"
  const canManageServices = ["owner", "manager"].includes(profile?.role ?? "")

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
      <div className="flex gap-1 mb-6 border-b border-[var(--pt-border)]">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${
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
      ) : tab === "billing" ? (
        <BillingPanel />
      ) : isLoading ? (
        <div className="max-w-xl space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-14 bg-[var(--pt-muted-strong)] rounded-xl animate-pulse" />
          ))}
        </div>
      ) : data ? (
        <>
          {tab === "org" && (
            <OrgSettingsForm org={data.org} readonly={!isOwner} />
          )}
          {tab === "branches" && (
            <BranchList branches={data.branches} isOwner={isOwner} />
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
