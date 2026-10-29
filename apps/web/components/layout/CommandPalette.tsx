"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { Pill, Receipt, Search } from "lucide-react"
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { NAV_GROUPS, navItemAllowed } from "@/components/layout/Sidebar"
import { useSessionStore } from "@/lib/store/sessionStore"
import { useBranchScope } from "@/lib/hooks/useBranchScope"
import { useDebounce } from "@/lib/hooks/useDebounce"
import { formatKES } from "@/lib/store/cartStore"

// Quick search (Ctrl/⌘ K, or the search button in the top bar): jump to a
// page, a product (opens Inventory filtered to it) or a receipt (opens Sales
// filtered to it) from anywhere in the back office.

const OPEN_EVENT = "pt:open-search"

export function openQuickSearch() {
  window.dispatchEvent(new Event(OPEN_EVENT))
}

interface ProductHit { product_id: string; name: string; strength: string | null; stock_on_hand: number | null; selling_price: number | null }
interface SaleHit { id: string; receipt_number: string; total_amount: number; created_at: string }

export function CommandPalette() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState("")
  const q = useDebounce(text.trim(), 250)
  const permissions = useSessionStore((s) => s.permissions)
  const planCode = useSessionStore((s) => s.planCode)
  const branches = useSessionStore((s) => s.branches)
  const { branchId } = useBranchScope()
  // Product search needs one branch; with "All branches" use the first.
  const searchBranch = branchId ?? branches[0]?.id ?? null

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    const onOpen = () => setOpen(true)
    window.addEventListener("keydown", onKey)
    window.addEventListener(OPEN_EVENT, onOpen)
    return () => {
      window.removeEventListener("keydown", onKey)
      window.removeEventListener(OPEN_EVENT, onOpen)
    }
  }, [])

  const pages = NAV_GROUPS.flatMap((g) => g.items)
    .filter((item) => navItemAllowed(item, permissions, planCode))
    .filter((item) => !q || item.label.toLowerCase().includes(q.toLowerCase()))

  const { data: products = [], isFetching: productsLoading } = useQuery<ProductHit[]>({
    queryKey: ["quick-search-products", q, searchBranch],
    enabled: open && q.length >= 2 && !!searchBranch && permissions.includes("products.view"),
    queryFn: async () => {
      const res = await fetch(`/api/products/search?q=${encodeURIComponent(q)}&branch_id=${searchBranch}`)
      if (!res.ok) return []
      return ((await res.json()) as { products: ProductHit[] }).products.slice(0, 6)
    },
    staleTime: 30_000,
  })

  // Receipt numbers carry digits (RCP-261027-000011); only look when there are some.
  const looksLikeReceipt = /\d{3,}/.test(q)
  const { data: sales = [] } = useQuery<SaleHit[]>({
    queryKey: ["quick-search-sales", q, branchId],
    enabled: open && looksLikeReceipt,
    queryFn: async () => {
      const params = new URLSearchParams({ q, limit: "5", ...(branchId ? { branch_id: branchId } : {}) })
      const res = await fetch(`/api/sales?${params}`)
      if (!res.ok) return []
      return ((await res.json()) as { sales: SaleHit[] }).sales
    },
    staleTime: 30_000,
  })

  // With our own filtering, cmdk doesn't move the highlight when the results
  // change — Enter then picked nothing. Keep it on the first result.
  const first = pages[0] ? `page:${pages[0].href}` : products[0] ? `product:${products[0].product_id}` : sales[0] ? `sale:${sales[0].id}` : ""
  const [selected, setSelected] = useState("")
  useEffect(() => {
    setSelected(first) // eslint-disable-line react-hooks/set-state-in-effect -- follow the new results
  }, [first])

  function go(href: string) {
    setOpen(false)
    setText("")
    router.push(href)
  }

  return (
    <CommandDialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setText("") }} title="Quick search" description="Find a page, product or receipt">
      {/* Results come from the server — cmdk's own filtering would hide them. */}
      <Command shouldFilter={false} value={selected} onValueChange={setSelected}>
        <CommandInput placeholder="Search pages, products, receipt numbers…" value={text} onValueChange={setText} />
        <CommandList>
          <CommandEmpty>{productsLoading ? "Searching…" : "Nothing found."}</CommandEmpty>
          {pages.length > 0 && (
            <CommandGroup heading="Go to">
              {pages.map((item) => (
                <CommandItem key={item.href} value={`page:${item.href}`} onSelect={() => go(item.href)}>
                  <item.icon size={16} />
                  {item.label}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {products.length > 0 && (
            <CommandGroup heading="Products">
              {products.map((p) => (
                <CommandItem key={p.product_id} value={`product:${p.product_id}`} onSelect={() => go(`/inventory?q=${encodeURIComponent(p.name)}`)}>
                  <Pill size={16} />
                  <span className="flex-1 truncate">{p.name}{p.strength ? ` ${p.strength}` : ""}</span>
                  <span className="text-xs text-[var(--pt-text-tertiary)] tabular-nums">
                    {p.stock_on_hand ?? 0} in stock{p.selling_price ? ` · ${formatKES(p.selling_price)}` : ""}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {sales.length > 0 && (
            <CommandGroup heading="Receipts">
              {sales.map((s) => (
                <CommandItem key={s.id} value={`sale:${s.id}`} onSelect={() => go(`/sales?q=${encodeURIComponent(s.receipt_number)}`)}>
                  <Receipt size={16} />
                  <span className="flex-1 font-mono text-[13px]">{s.receipt_number}</span>
                  <span className="text-xs text-[var(--pt-text-tertiary)] tabular-nums">{formatKES(s.total_amount)}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  )
}

/** The top bar's way in — "Search… Ctrl K" on wide screens, an icon on phones. */
export function QuickSearchButton() {
  const [mac, setMac] = useState(false)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- platform is only known in the browser
    setMac(/Mac|iPhone|iPad/.test(navigator.platform))
  }, [])
  return (
    <button
      type="button"
      onClick={openQuickSearch}
      aria-label="Quick search"
      aria-keyshortcuts="Control+K Meta+K"
      className="inline-flex items-center gap-2 h-10 md:h-9 w-10 md:w-56 justify-center md:justify-start md:px-3 rounded-lg md:border border-[var(--pt-border)] bg-transparent md:bg-[var(--pt-muted)] text-sm text-[var(--pt-text-tertiary)] hover:bg-[var(--pt-muted-strong)] transition-colors"
    >
      <Search size={16} className="shrink-0" />
      <span className="hidden md:inline flex-1 text-left">Search…</span>
      <kbd className="hidden md:inline text-[11px] font-semibold border border-[var(--pt-border)] rounded px-1.5 py-0.5 bg-[var(--pt-surface)]">{mac ? "⌘" : "Ctrl"} K</kbd>
    </button>
  )
}
