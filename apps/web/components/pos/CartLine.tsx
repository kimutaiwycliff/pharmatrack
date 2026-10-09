"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Minus, Plus, Trash2, ChevronDown, Coins, Check, Info } from "lucide-react"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Input } from "@/components/ui/input"
import { useCartStore, formatKES, sellQty, sellPrice } from "@/lib/store/cartStore"
import { useOnline } from "@/lib/offline/useOnline"
import type { CartItem, CartSellUnit } from "@pharmatrack/types"

interface PackSize {
  id: string
  pack_label: string
  units_per_pack: number
  selling_price: number
  is_active: boolean
}

const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"}`

/** Unit picker: the base unit plus any active pack sizes (e.g. strip of 10). */
function UnitPicker({ item }: { item: CartItem }) {
  const setSellUnit = useCartStore((s) => s.setSellUnit)
  const online = useOnline()
  const [open, setOpen] = useState(false)
  const { data: packs = [], isLoading } = useQuery<PackSize[]>({
    queryKey: ["pack-sizes", item.product_id],
    enabled: open && online,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const res = await fetch(`/api/products/${item.product_id}/pack-sizes`)
      if (!res.ok) return []
      const json = (await res.json()) as { packSizes: PackSize[] }
      return json.packSizes
    },
  })
  const options = packs.filter((p) => p.is_active && p.units_per_pack > 1)
  const current = item.sell_unit?.label ?? item.base_unit

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        className="h-7 max-w-28 px-2 rounded-md border border-[var(--pt-border)] flex items-center gap-1 text-xs font-medium text-[var(--pt-text-secondary)] hover:bg-[var(--pt-muted)] transition-colors"
        title="Sell by unit or pack"
      >
        <span className="truncate">{current}</span>
        <ChevronDown size={12} className="shrink-0" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-48">
        <DropdownMenuItem onClick={() => setSellUnit(item.product_id, null)} className="gap-2">
          <span className="flex-1">
            {item.base_unit} <span className="text-[var(--pt-text-tertiary)]">· {formatKES(item.unit_price)}</span>
          </span>
          {!item.sell_unit && <Check size={13} />}
        </DropdownMenuItem>
        {options.map((p) => {
          const unit: CartSellUnit = { pack_size_id: p.id, label: p.pack_label, unit_count: p.units_per_pack, price: p.selling_price }
          return (
            <DropdownMenuItem key={p.id} onClick={() => setSellUnit(item.product_id, unit)} className="gap-2">
              <span className="flex-1">
                {p.pack_label}{" "}
                <span className="text-[var(--pt-text-tertiary)]">· {p.units_per_pack} {item.base_unit}s · {formatKES(p.selling_price)}</span>
              </span>
              {item.sell_unit?.pack_size_id === p.id && <Check size={13} />}
            </DropdownMenuItem>
          )
        })}
        {!online && <p className="px-2 py-1.5 text-[11px] text-[var(--pt-text-tertiary)]">Pack sizes need a connection.</p>}
        {online && !isLoading && options.length === 0 && (
          <p className="px-2 py-1.5 text-[11px] text-[var(--pt-text-tertiary)]">No pack sizes set up for this product.</p>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * "Customer wants KES 20 worth": converts an amount to whole base units at the
 * base-unit price. When the amount doesn't divide evenly it offers the nearest
 * quantities either side instead of recording a fractional (untrue) sale.
 */
function SellByAmount({ item }: { item: CartItem }) {
  const setSellUnit = useCartStore((s) => s.setSellUnit)
  const setQty = useCartStore((s) => s.setQty)
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState("")
  const price = item.unit_price
  const value = Number(amount)
  const valid = amount.trim() !== "" && value > 0 && price > 0
  const exact = valid ? value / price : 0
  const lower = Math.floor(exact + 1e-9)
  const upper = Math.ceil(exact - 1e-9)
  const options = !valid ? [] : lower === upper ? [lower] : [lower, upper].filter((n) => n > 0)
  const tooSmall = valid && value < price

  function choose(units: number) {
    setSellUnit(item.product_id, null)
    setQty(item.product_id, units)
    setOpen(false)
    setAmount("")
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className="h-7 px-2 rounded-md border border-[var(--pt-border)] flex items-center gap-1 text-xs font-medium text-[var(--pt-text-secondary)] hover:bg-[var(--pt-muted)] transition-colors"
        title="Sell by amount"
      >
        <Coins size={12} /> KES
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-3 bg-[var(--pt-surface)]">
        <p className="text-xs font-semibold text-[var(--pt-text-secondary)] uppercase tracking-wide">Sell by amount</p>
        <p className="text-xs text-[var(--pt-text-tertiary)] -mt-1">
          {formatKES(price)} per {item.base_unit}
        </p>
        <Input
          type="number"
          inputMode="decimal"
          min={0}
          autoFocus
          placeholder="Customer wants KES…"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && options.length === 1 && options[0]! > 0) choose(options[0]!) }}
          className="h-9"
        />
        {tooSmall ? (
          <div className="flex gap-2 rounded-lg bg-amber-50 dark:bg-amber-500/10 text-amber-800 dark:text-amber-200 p-2.5 text-xs">
            <Info size={14} className="shrink-0 mt-0.5" />
            <span>
              The smallest unit ({item.base_unit}) costs {formatKES(price)}. To sell less than that, split this product into
              smaller units: Products → Edit → <span className="font-semibold">Sell in smaller units</span>.
            </span>
          </div>
        ) : (
          options.length > 0 && (
            <div className="space-y-1.5">
              {lower !== upper && <p className="text-[11px] text-[var(--pt-text-tertiary)]">KES {value} isn&apos;t a whole number of {item.base_unit}s — pick the closest:</p>}
              {options.map((n) => (
                <button
                  key={n}
                  onClick={() => choose(n)}
                  className="w-full flex items-center justify-between rounded-lg border border-[var(--pt-border)] hover:border-[var(--pt-green)] hover:bg-[var(--pt-green-50)] px-3 py-2 text-sm transition-colors"
                >
                  <span className="font-semibold">{plural(n, item.base_unit)}</span>
                  <span className="tabular-nums text-[var(--pt-text-secondary)]">{formatKES(n * price)}</span>
                </button>
              ))}
            </div>
          )
        )}
      </PopoverContent>
    </Popover>
  )
}

/** Quantity box: −/+ in sell units, or type an exact number. */
function QtyBox({ item }: { item: CartItem }) {
  const updateQty = useCartStore((s) => s.updateQty)
  const setQty = useCartStore((s) => s.setQty)
  const qty = sellQty(item)
  const [draft, setDraft] = useState<string | null>(null)

  function commit() {
    if (draft === null) return
    const n = parseInt(draft, 10)
    if (!isNaN(n) && n > 0 && n !== qty) setQty(item.product_id, n)
    setDraft(null)
  }

  const btn = "w-7 h-7 rounded-md border border-[var(--pt-border)] flex items-center justify-center hover:bg-[var(--pt-muted)] text-[var(--pt-text-secondary)] transition-colors"
  return (
    <div className="flex items-center gap-1">
      <button onClick={() => updateQty(item.product_id, -1)} className={btn} aria-label="Decrease quantity"><Minus size={13} /></button>
      <input
        value={draft ?? String(qty)}
        onChange={(e) => setDraft(e.target.value.replace(/[^\d]/g, ""))}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur() }}
        inputMode="numeric"
        aria-label="Quantity"
        className="w-10 h-7 rounded-md border border-[var(--pt-border)] bg-[var(--pt-surface)] text-center font-semibold text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-[var(--pt-green)]"
      />
      <button onClick={() => updateQty(item.product_id, 1)} className={btn} aria-label="Increase quantity"><Plus size={13} /></button>
    </div>
  )
}

export function CartLine({ item }: { item: CartItem }) {
  const removeItem = useCartStore((s) => s.removeItem)
  const unitLabel = item.sell_unit?.label ?? item.base_unit
  return (
    <div className="px-3 sm:px-5 py-3 border-b border-[var(--pt-border)] last:border-b-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-tight truncate">{item.product_name}</p>
          <p className="text-xs text-[var(--pt-text-secondary)] mt-0.5 truncate">
            {formatKES(sellPrice(item))}/{unitLabel}
            {item.sell_unit ? ` (${item.sell_unit.unit_count} ${item.base_unit}s)` : ""}
            {item.product_strength ? ` · ${item.product_strength}` : ""}
            {item.is_controlled && (
              <span className="ml-1.5 text-[10px] font-bold text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-500/15 px-1.5 py-0.5 rounded">
                CONTROLLED
              </span>
            )}
          </p>
        </div>
        <p className="text-right text-sm font-semibold tabular-nums shrink-0">{formatKES(item.line_total)}</p>
      </div>
      <div className="mt-2 flex items-center gap-1.5 flex-wrap">
        <QtyBox item={item} />
        <UnitPicker item={item} />
        <SellByAmount item={item} />
        <button
          onClick={() => removeItem(item.product_id)}
          className="ml-auto w-7 h-7 rounded-md flex items-center justify-center hover:bg-[var(--pt-red-50)] hover:text-[var(--pt-red)] text-[var(--pt-text-tertiary)] transition-colors"
          title="Remove"
          aria-label="Remove item"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  )
}
