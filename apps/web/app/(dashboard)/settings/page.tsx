"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Building2, GitBranch, User } from "lucide-react"
import { OrgSettingsForm } from "@/components/settings/OrgSettingsForm"
import { BranchList } from "@/components/settings/BranchList"
import { ProfileSettingsForm } from "@/components/settings/ProfileSettingsForm"
import { useSessionStore } from "@/lib/store/sessionStore"
import type { Organization, Branch, Profile } from "@pharmatrack/types"

interface SettingsData {
  org: Organization
  profile: Profile
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

type Tab = "org" | "branches" | "profile"

const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
  { key: "org",      label: "Organization", icon: Building2 },
  { key: "branches", label: "Branches",     icon: GitBranch },
  { key: "profile",  label: "My Profile",   icon: User },
]

export default function SettingsPage() {
  const profile = useSessionStore((s) => s.profile)
  const [tab, setTab] = useState<Tab>("org")
  const { data, isLoading } = useSettings()

  const isOwner = profile?.role === "owner"

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
      {isLoading ? (
        <div className="max-w-xl space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />
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
            <ProfileSettingsForm profile={data.profile} />
          )}
        </>
      ) : (
        <p className="text-sm text-[var(--pt-text-tertiary)]">Failed to load settings</p>
      )}
    </div>
  )
}
