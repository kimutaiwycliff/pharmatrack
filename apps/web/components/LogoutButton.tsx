"use client"

import { useState } from "react"
import { LogOut } from "lucide-react"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { signOut } from "@/app/(auth)/login/actions"

// A sign-out trigger that asks for confirmation first. Render whatever trigger
// you like as children; on confirm it submits the signOut server action.
export function LogoutButton({
  className,
  title,
  children,
}: {
  className?: string
  title?: string
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" title={title} onClick={() => setOpen(true)} className={className}>
        {children}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm p-6">
          <div className="flex items-center gap-2 mb-1">
            <LogOut size={17} className="text-[var(--pt-text-secondary)]" />
            <h2 className="text-lg font-bold">Sign out?</h2>
          </div>
          <p className="text-sm text-[var(--pt-text-secondary)] mb-5">
            You&apos;ll need to sign in again to get back into PharmaTrack.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <form
              action={signOut}
              className="flex-1"
              onSubmit={() => {
                // Clear cached pages so a shared till device can't serve this
                // account's cached authenticated views to the next person who
                // logs in offline before the first online navigation.
                if (typeof caches !== "undefined") {
                  caches.keys().then((keys) => {
                    for (const key of keys) {
                      if (key.startsWith("pt-pages-")) caches.delete(key)
                    }
                  }).catch(() => {})
                }
              }}
            >
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
