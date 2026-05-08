"use client"

import { useState } from "react"
import { MoreHorizontal, UserCheck, UserX, Pencil, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { useQueryClient } from "@tanstack/react-query"
import type { Branch } from "@pharmatrack/types"

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

interface Props {
  staff: StaffMember[]
  branches: Branch[]
  isLoading?: boolean
  currentUserId: string
}

const ROLE_COLORS: Record<string, string> = {
  owner:       "bg-purple-50 text-purple-700 border-purple-100",
  manager:     "bg-blue-50 text-blue-700 border-blue-100",
  pharmacist:  "bg-[var(--pt-green-50)] text-[var(--pt-green-600)] border-[var(--pt-green-100)]",
  cashier:     "bg-gray-100 text-gray-700 border-gray-200",
}

function ActionMenu({
  member,
  branches,
  currentUserId,
}: {
  member: StaffMember
  branches: Branch[]
  currentUserId: string
}) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const queryClient = useQueryClient()

  if (member.id === currentUserId || member.role === "owner") return null

  async function patch(payload: Record<string, unknown>) {
    setLoading(true)
    setOpen(false)
    try {
      const res = await fetch(`/api/staff/${member.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const json = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(json.error ?? "Failed to update")
      toast.success("Updated")
      await queryClient.invalidateQueries({ queryKey: ["staff"] })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-7 h-7 rounded-md flex items-center justify-center text-[var(--pt-text-tertiary)] hover:bg-gray-100 transition-colors"
        disabled={loading}
      >
        {loading ? <Loader2 size={14} className="animate-spin" /> : <MoreHorizontal size={15} />}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-40 bg-white rounded-xl border border-[var(--pt-border)] shadow-lg py-1 min-w-[180px]">
            {(["manager", "pharmacist", "cashier"] as const)
              .filter((r) => r !== member.role)
              .map((r) => (
                <button
                  key={r}
                  onClick={() => patch({ role: r })}
                  className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 flex items-center gap-2"
                >
                  <Pencil size={13} className="text-[var(--pt-text-tertiary)]" />
                  Change to {r.charAt(0).toUpperCase() + r.slice(1)}
                </button>
              ))}
            <div className="border-t border-[var(--pt-border)] my-1" />
            <button
              onClick={() => patch({ is_active: !member.is_active })}
              className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 flex items-center gap-2"
            >
              {member.is_active ? (
                <>
                  <UserX size={13} className="text-[var(--pt-red)]" />
                  <span className="text-[var(--pt-red)]">Deactivate</span>
                </>
              ) : (
                <>
                  <UserCheck size={13} className="text-[var(--pt-green)]" />
                  <span className="text-[var(--pt-green)]">Reactivate</span>
                </>
              )}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

export function StaffTable({ staff, branches, isLoading, currentUserId }: Props) {
  if (isLoading) {
    return (
      <div className="bg-white rounded-xl border border-[var(--pt-border)] overflow-hidden">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex gap-4 px-5 py-4 border-b border-[var(--pt-border)] last:border-b-0 animate-pulse">
            <div className="w-9 h-9 rounded-full bg-gray-100 shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-3 bg-gray-100 rounded w-36" />
              <div className="h-2.5 bg-gray-100 rounded w-24" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (staff.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-[var(--pt-border)] flex items-center justify-center py-20 text-[var(--pt-text-tertiary)] text-sm">
        No staff found
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-[var(--pt-border)] overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--pt-border)] bg-gray-50">
            <th className="px-5 py-3 text-left text-[11px] font-bold text-[var(--pt-text-secondary)] uppercase tracking-wider">
              Name
            </th>
            <th className="px-4 py-3 text-left text-[11px] font-bold text-[var(--pt-text-secondary)] uppercase tracking-wider">
              Role
            </th>
            <th className="px-4 py-3 text-left text-[11px] font-bold text-[var(--pt-text-secondary)] uppercase tracking-wider hidden md:table-cell">
              Branch
            </th>
            <th className="px-4 py-3 text-left text-[11px] font-bold text-[var(--pt-text-secondary)] uppercase tracking-wider hidden lg:table-cell">
              Phone
            </th>
            <th className="px-4 py-3 text-left text-[11px] font-bold text-[var(--pt-text-secondary)] uppercase tracking-wider">
              Status
            </th>
            <th className="px-4 py-3 w-10" />
          </tr>
        </thead>
        <tbody>
          {staff.map((m) => {
            const initials = m.full_name.split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase()
            return (
              <tr
                key={m.id}
                className={`border-b border-[var(--pt-border)] last:border-b-0 transition-colors ${
                  m.is_active ? "hover:bg-gray-50/60" : "opacity-50"
                }`}
              >
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                      style={{ background: "var(--pt-green-50)", color: "var(--pt-green-600)" }}
                    >
                      {initials}
                    </div>
                    <div>
                      <p className="font-semibold text-[13px]">
                        {m.full_name}
                        {m.id === currentUserId && (
                          <span className="ml-2 text-[10px] text-[var(--pt-text-tertiary)] font-normal">(you)</span>
                        )}
                      </p>
                      <p className="text-[11px] text-[var(--pt-text-tertiary)] mt-0.5">
                        Joined {new Date(m.created_at).toLocaleDateString("en-KE", { month: "short", year: "numeric" })}
                      </p>
                    </div>
                  </div>
                </td>

                <td className="px-4 py-3.5">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border capitalize ${ROLE_COLORS[m.role] ?? "bg-gray-100 text-gray-700"}`}>
                    {m.role}
                  </span>
                </td>

                <td className="px-4 py-3.5 text-[var(--pt-text-secondary)] text-sm hidden md:table-cell">
                  {m.branches?.name ?? "All branches"}
                </td>

                <td className="px-4 py-3.5 text-[var(--pt-text-secondary)] text-sm hidden lg:table-cell">
                  {m.phone ?? "—"}
                </td>

                <td className="px-4 py-3.5">
                  <span className={`inline-flex items-center gap-1 text-[11px] font-semibold ${m.is_active ? "text-[var(--pt-green)]" : "text-[var(--pt-text-tertiary)]"}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${m.is_active ? "bg-[var(--pt-green)]" : "bg-gray-300"}`} />
                    {m.is_active ? "Active" : "Inactive"}
                  </span>
                </td>

                <td className="px-4 py-3.5">
                  <ActionMenu member={m} branches={branches} currentUserId={currentUserId} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
