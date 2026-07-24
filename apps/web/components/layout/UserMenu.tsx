"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Settings, LogOut } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { signOut } from "@/app/(auth)/login/actions"

function initials(name: string) {
  return name.split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase()
}

interface Props {
  fullName: string | undefined
  role: string | undefined
}

// Avatar trigger next to the notification bell -> Settings + Sign out.
// Sign out mirrors LogoutButton's own confirm-dialog UX (kept local here
// rather than nesting LogoutButton's own <button> trigger inside a menu
// item, which would nest two interactive elements).
export function UserMenu({ fullName, role }: Props) {
  const router = useRouter()
  const [confirmOpen, setConfirmOpen] = useState(false)

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger className="flex items-center gap-2 rounded-lg p-1 pr-2 hover:bg-[var(--pt-muted)] transition-colors outline-none">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
            style={{ background: "var(--pt-green-50)", color: "var(--pt-green-600)" }}
          >
            {initials(fullName ?? "?")}
          </div>
          <div className="hidden sm:block leading-none text-left">
            <p className="text-[13px] font-semibold">{fullName}</p>
            <p className="text-[11px] text-[var(--pt-text-secondary)] capitalize">{role}</p>
          </div>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-44">
          {role === "owner" && (
            <DropdownMenuItem className="gap-2" onClick={() => router.push("/settings")}>
              <Settings size={15} /> Settings
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" className="gap-2" onClick={() => setConfirmOpen(true)}>
            <LogOut size={15} /> Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-sm p-6">
          <div className="flex items-center gap-2 mb-1">
            <LogOut size={17} className="text-[var(--pt-text-secondary)]" />
            <h2 className="text-lg font-bold">Sign out?</h2>
          </div>
          <p className="text-sm text-[var(--pt-text-secondary)] mb-5">
            You&apos;ll need to sign in again to get back into PharmaTrack.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <form action={signOut} className="flex-1">
              <Button type="submit" className="w-full bg-[var(--pt-red)] hover:opacity-90 text-white">
                <LogOut size={15} className="mr-1.5" /> Sign out
              </Button>
            </form>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
