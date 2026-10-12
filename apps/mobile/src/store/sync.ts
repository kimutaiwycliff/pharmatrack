import { create } from "zustand"
import type { DeviceInfo } from "../lib/sync/device"
import type { LockReason, LockState, OverrideRecord } from "../lib/sync/core/lock"

// App-wide sync state (R1 rule 8). Written only by lib/sync/engine.ts, which
// is mounted once from the root layout (SyncRunner); screens read it. Inert
// (ready, unregistered, idle) in the Offline Edition build.

export type SyncStatus = "idle" | "syncing" | "offline" | "error" | "revoked"

export interface SyncProgress {
  phase: "push" | "pull"
  label: string
  done: number
  total: number
}

export interface SyncSummary {
  at: number
  pushed: number
  rejected: number
  productsUpdated: number
  deleted: number
}

export interface SyncState {
  ready: boolean
  device: DeviceInfo | null
  online: boolean
  status: SyncStatus
  lastError: string | null
  subscriptionInactive: boolean
  lastSyncAt: number | null
  deadline: number | null
  pendingCount: number
  pendingSales: number
  rejectedCount: number
  /** shift_close items not yet uploaded (persistent "sync later" banner) */
  pendingShiftCloses: number
  override: OverrideRecord | null
  lock: LockState
  lockReason: LockReason | null
  progress: SyncProgress | null
  lastSummary: SyncSummary | null
}

export const useSyncStore = create<SyncState>(() => ({
  ready: false,
  device: null,
  online: true,
  status: "idle",
  lastError: null,
  subscriptionInactive: false,
  lastSyncAt: null,
  deadline: null,
  pendingCount: 0,
  pendingSales: 0,
  rejectedCount: 0,
  pendingShiftCloses: 0,
  override: null,
  lock: {
    locked: true,
    reason: "unregistered",
    underOverride: false,
    overrideAvailable: false,
    overrideUntil: null,
    warnDeadline: false,
    msToDeadline: null,
  },
  lockReason: "unregistered",
  progress: null,
  lastSummary: null,
}))
