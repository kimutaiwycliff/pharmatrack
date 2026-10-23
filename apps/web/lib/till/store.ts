"use client"

import { create } from "zustand"
import type { LockState, OverrideRecord } from "@pharmatrack/core/sync"
import type { BranchInfo, DeviceInfo, TillShift, TillStaffSession } from "./db"

// Live state of the offline till (registered browser / desktop app), derived
// from IndexedDB by the engine and published here for the POS UI.

export type TillStatus = "idle" | "syncing" | "offline" | "error" | "revoked"

export interface SyncSummary {
  at: number
  pushed: number
  rejected: number
  productsUpdated: number
  deleted: number
}

export interface TillState {
  /** engine has read IndexedDB at least once */
  ready: boolean
  registered: boolean
  /** registered to a different pharmacy than the one signed in (till is off) */
  wrongOrg: boolean
  device: DeviceInfo | null
  branch: BranchInfo | null
  online: boolean
  status: TillStatus
  progress: { label: string; done: number; total: number } | null
  lastError: string | null
  lastSyncAt: number | null
  deadline: number | null
  override: OverrideRecord | null
  subscriptionInactive: boolean
  lock: LockState
  pendingCount: number
  pendingSales: number
  rejectedCount: number
  pendingShiftCloses: number
  lastSummary: SyncSummary | null
  /** who is selling */
  staff: TillStaffSession | null
  /** that person's open shift on this till */
  shift: TillShift | null
  /** bumps whenever local products/stock change (sale, pull) so lists re-read */
  dataVersion: number
}

const UNLOCKED: LockState = {
  locked: false, reason: null, underOverride: false, overrideAvailable: false, overrideUntil: null, warnDeadline: false, msToDeadline: null,
}

export const useTillStore = create<TillState>()(() => ({
  ready: false,
  registered: false,
  wrongOrg: false,
  device: null,
  branch: null,
  online: typeof navigator === "undefined" ? true : navigator.onLine,
  status: "idle",
  progress: null,
  lastError: null,
  lastSyncAt: null,
  deadline: null,
  override: null,
  subscriptionInactive: false,
  lock: UNLOCKED,
  pendingCount: 0,
  pendingSales: 0,
  rejectedCount: 0,
  pendingShiftCloses: 0,
  lastSummary: null,
  staff: null,
  shift: null,
  dataVersion: 0,
}))

/** True when this browser sells through the offline till engine. */
export const useTillActive = () => useTillStore((s) => s.ready && s.registered && !s.wrongOrg)

export const bumpTillData = () => useTillStore.setState((s) => ({ dataVersion: s.dataVersion + 1 }))
