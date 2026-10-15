import { apiJson } from "../../lib/api"
import { UserFacingError } from "../../lib/errors"
import { env } from "../../lib/env"
import { getCurrentStaffId } from "../../lib/local-auth"
import { getLocalSettings, updateLocalOrg, updateLocalPin, updateLocalProfile } from "../../repo/settings"
import { useIsOnline } from "../../components/NeedsInternet"
import { useQuery } from "../../hooks/useQuery"
import type { OrgPayload } from "./logic/forms"

// One loader + savers for every Settings sub-screen. Online it's the single
// endpoint web's Settings page uses — GET /api/settings returns profile + org
// + branches; PATCH ?target=profile|org|pin updates each
// (apps/web/app/api/settings/route.ts). The Offline Edition reads/writes the
// local repo (src/repo/settings.ts), which returns the same shape.

export interface SettingsBranch {
  id: string
  name: string
  address?: string | null
  phone?: string | null
  is_active?: boolean
}

export interface SettingsData {
  profile: { id?: string; full_name: string; phone: string | null; role: string }
  has_pin: boolean
  org: { name: string; registration_number?: string; phone?: string; email?: string; address?: string } | null
  /** Offline Edition: the branch row the Organisation form edits. */
  org_branch_id?: string | null
  branches?: SettingsBranch[]
  /** Offline Edition: the signed-in local staff id (the profile's id). */
  staffId?: string | null
}

const OFFLINE = env.EXPO_PUBLIC_OFFLINE_MODE

async function loadSettings(): Promise<SettingsData> {
  if (OFFLINE) {
    const id = await getCurrentStaffId()
    if (!id) throw new UserFacingError("You're not signed in. Sign in again to continue.")
    const local = await getLocalSettings(id)
    return { ...local, profile: { ...local.profile, id }, staffId: id }
  }
  return apiJson<SettingsData>("/api/settings")
}

/**
 * Settings for the signed-in person. `needsInternet` is true in the online
 * build without a connection — screens show <NeedsInternet/> then.
 */
export function useSettingsData() {
  const online = useIsOnline()
  const needsInternet = !OFFLINE && !online
  const query = useQuery<SettingsData>(OFFLINE ? "local:settings" : online ? "/api/settings" : null, loadSettings)
  return { ...query, needsInternet }
}

function requireStaff(data: SettingsData): string {
  if (!data.staffId) throw new UserFacingError("You're not signed in. Sign in again to continue.")
  return data.staffId
}

export async function saveProfile(data: SettingsData, body: { full_name: string; phone: string }): Promise<void> {
  if (OFFLINE) {
    await updateLocalProfile(requireStaff(data), body)
    return
  }
  await apiJson("/api/settings?target=profile", { method: "PATCH", body })
}

/** `password` is ignored offline — the Offline Edition has no account password. */
export async function savePin(data: SettingsData, pin: string, currentPin?: string): Promise<void> {
  if (OFFLINE) {
    await updateLocalPin(requireStaff(data), pin)
    return
  }
  await apiJson("/api/settings?target=pin", { method: "PATCH", body: { pin, ...(currentPin ? { current_pin: currentPin } : {}) } })
}

export async function saveOrg(data: SettingsData, body: OrgPayload): Promise<void> {
  if (OFFLINE) {
    const branchId = data.org_branch_id
    if (!branchId) throw new UserFacingError("No branch found on this phone. Restart the app and try again.")
    await updateLocalOrg(branchId, body)
    return
  }
  await apiJson("/api/settings?target=org", { method: "PATCH", body })
}
