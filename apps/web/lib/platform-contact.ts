import "server-only"

// Platform-operator contact details, configurable at runtime via env (no rebuild):
//   PLATFORM_CONTACT_EMAIL     — support/billing email shown to tenants
//   PLATFORM_CONTACT_WHATSAPP  — WhatsApp number (Kenyan local or international)
// Falls back to the first PLATFORM_NOTIFY_EMAIL for the email if unset.

export interface PlatformContact {
  email: string | null
  whatsapp: string | null
  whatsappLink: string | null
  mailtoLink: string | null
}

/** Normalize a Kenyan number to wa.me international form: 0716522948 → 254716522948. */
function waLink(raw: string): string | null {
  let d = raw.replace(/\D/g, "")
  if (!d) return null
  if (d.startsWith("0")) d = "254" + d.slice(1)
  else if (d.startsWith("7") && d.length === 9) d = "254" + d
  else if (d.startsWith("254")) { /* already international */ }
  return `https://wa.me/${d}`
}

export function platformContact(): PlatformContact {
  const email =
    process.env.PLATFORM_CONTACT_EMAIL?.trim() ||
    process.env.PLATFORM_NOTIFY_EMAIL?.split(",")[0]?.trim() ||
    null
  const whatsapp = process.env.PLATFORM_CONTACT_WHATSAPP?.trim() || null
  return {
    email,
    whatsapp,
    whatsappLink: whatsapp ? waLink(whatsapp) : null,
    mailtoLink: email ? `mailto:${email}` : null,
  }
}
