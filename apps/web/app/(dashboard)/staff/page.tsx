"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { UserPlus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { StaffTable } from "@/components/staff/StaffTable"
import { InviteStaffDialog } from "@/components/staff/InviteStaffDialog"
import { useSessionStore } from "@/lib/store/sessionStore"

interface StaffMember {
  id: string
  full_name: string
  role: string
  branch_id: string | null
  phone: string | null
  is_active: boolean
  created_at: string
  branches: { name: string } | null
}

function useStaff() {
  return useQuery<StaffMember[]>({
    queryKey: ["staff"],
    queryFn: async () => {
      const res = await fetch("/api/staff")
      if (!res.ok) throw new Error("Failed to load staff")
      const json = (await res.json()) as { staff: StaffMember[] }
      return json.staff
    },
    staleTime: 60_000,
  })
}

export default function StaffPage() {
  const profile = useSessionStore((s) => s.profile)
  const branches = useSessionStore((s) => s.branches)
  const [showInvite, setShowInvite] = useState(false)

  const { data: staff = [], isLoading } = useStaff()

  const activeCount = staff.filter((s) => s.is_active).length

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Staff</h1>
          <p className="text-sm text-[var(--pt-text-secondary)] mt-0.5">
            {activeCount} active member{activeCount !== 1 ? "s" : ""}
          </p>
        </div>
        {["owner", "manager"].includes(profile?.role ?? "") && (
          <Button onClick={() => setShowInvite(true)} className="gap-2">
            <UserPlus size={16} />
            Invite Staff
          </Button>
        )}
      </div>

      <StaffTable
        staff={staff}
        branches={branches}
        isLoading={isLoading}
        currentUserId={profile?.id ?? ""}
      />

      {showInvite && (
        <InviteStaffDialog
          branches={branches}
          onClose={() => setShowInvite(false)}
        />
      )}
    </div>
  )
}
