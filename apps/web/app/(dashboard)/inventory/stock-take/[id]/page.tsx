"use client"

import { use } from "react"
import { CountSheet } from "@/components/stockTake/CountSheet"

// One stock-take session (ADR-020).
export default function StockTakeSessionPage({ params, searchParams }: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ focus?: string; q?: string }>
}) {
  const { id } = use(params)
  // ?focus=<item key>&q=<name> — from the drug search on the shelves page.
  const { focus, q } = use(searchParams)
  return <CountSheet id={id} focus={focus ? { key: focus, q: q ?? "" } : null} />
}
