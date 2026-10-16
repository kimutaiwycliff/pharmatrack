import { eq } from "drizzle-orm"
import { dbAdmin, org_settings } from "@pharmatrack/db"
import { smsConfigured } from "./sms"
import { whatsappConfigured } from "./whatsapp"

// Paid messaging add-ons, per pharmacy. SMS / WhatsApp reminders only go out —
// and the app only mentions them — when BOTH:
//  1. the platform's Africa's Talking keys are set (smsConfigured / whatsappConfigured), and
//  2. the operator has switched the add-on on for this pharmacy after it paid
//     (org_settings.settings.sms_enabled / whatsapp_enabled, set only from the
//     operator console: PATCH /api/platform/tenants/[orgId]/messaging).
// Tenants can't set these keys themselves (not in /api/settings' allow-list).

export interface OrgMessaging {
  sms: boolean
  whatsapp: boolean
}

export const NO_MESSAGING: OrgMessaging = { sms: false, whatsapp: false }

export function messagingFor(settings: unknown): OrgMessaging {
  const s = (settings ?? {}) as { sms_enabled?: unknown; whatsapp_enabled?: unknown }
  return {
    sms: smsConfigured() && s.sms_enabled === true,
    whatsapp: whatsappConfigured() && s.whatsapp_enabled === true,
  }
}

export async function orgMessaging(organizationId: string): Promise<OrgMessaging> {
  const [row] = await dbAdmin()
    .select({ settings: org_settings.settings })
    .from(org_settings)
    .where(eq(org_settings.organization_id, organizationId))
    .limit(1)
  return messagingFor(row?.settings)
}
