"use client"

import { use } from "react"
import { CountSheet } from "@/components/stockTake/CountSheet"

// One stock-take session (ADR-020).
export default function StockTakeSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return <CountSheet id={id} />
}
