import { and, desc, eq, inArray, ne, or, sql, type SQL } from "drizzle-orm"
import { dbAdmin, organization, subscription, trial_grant, user } from "@pharmatrack/db"
import { canonicalEmail, canonicalRegistrationNumber } from "./canonical"
import { effectiveSubscriptionStatus } from "@/lib/billing/subscription-status"

// One free trial per person. trial_grant (migration 030) records every trial
// decision keyed by canonical identity signals; it survives tenant purges.
//
// Policy (owner decision):
//  * A prior GRANTED trial matching the canonical email, the Google account, or
//    the PPB registration number (when given) means the new account is created
//    WITHOUT a trial (gated until they subscribe or the operator approves an
//    extension).
//  * The signup IP is recorded and shown to the operator as a signal only —
//    shared networks (cyber cafés, hospital Wi-Fi) must never block on their own.
//
// All access is via dbAdmin: trial_grant is operator-only under RLS.

export type TrialSource = "signup" | "google" | "operator" | "backfill"
export type MatchSignal = "email" | "google" | "registration_number" | "ip"

export interface IdentitySignals {
  email?: string | null
  googleAccountId?: string | null
  registrationNumber?: string | null
  /** Only used for operator signals (never blocks). */
  ip?: string | null
}

export interface PriorTrial {
  id: string
  organization_id: string | null
  /** Pharmacy name when the tenant still exists, null once purged. */
  org_name: string | null
  org_exists: boolean
  /** Effective subscription status of the still-existing tenant. */
  status: string | null
  source: TrialSource
  granted: boolean
  trial_days: number
  created_at: string
  /** When that trial ended / ends (subscription value if the tenant still exists). */
  trial_ended_at: string | null
  matched_on: MatchSignal[]
}

/** Client IP + user agent for the trial ledger. Cloudflare's header wins
 *  (prod sits behind Cloudflare → Caddy), then the proxy chain. */
export function requestSignals(req: Request): { ip: string | null; userAgent: string | null } {
  const h = req.headers
  const ip = h.get("cf-connecting-ip")?.trim()
    || h.get("x-forwarded-for")?.split(",")[0]?.trim()
    || h.get("x-real-ip")?.trim()
    || null
  const ua = h.get("user-agent")?.slice(0, 500) ?? null
  return { ip, userAgent: ua }
}

/** Google account id (`account.accountId` for providerId=google) for a user. */
export async function googleAccountIdFor(userId: string): Promise<string | null> {
  const rows = (await dbAdmin().execute(sql`
    SELECT "accountId" AS id FROM "account" WHERE "userId" = ${userId} AND "providerId" = 'google' LIMIT 1
  `)) as unknown as Array<{ id: string }>
  return rows[0]?.id ?? null
}

/** Does a login already exist for this email (exact, case-insensitive)? */
export async function userExistsWithEmail(email: string): Promise<boolean> {
  const [row] = await dbAdmin().select({ id: user.id }).from(user)
    .where(sql`lower(${user.email}) = ${email.trim().toLowerCase()}`).limit(1)
  return !!row
}

/**
 * Every trial_grant row matching any of the given signals (most recent first),
 * annotated with which signals matched and the tenant's current state if it
 * still exists. `excludeOrgId` drops the tenant's own rows (operator view).
 */
export async function findPriorTrial(signals: IdentitySignals, opts: { excludeOrgId?: string; includeIp?: boolean } = {}): Promise<PriorTrial[]> {
  const email = signals.email ? canonicalEmail(signals.email) : null
  const regno = canonicalRegistrationNumber(signals.registrationNumber)
  const google = signals.googleAccountId?.trim() || null
  const ip = opts.includeIp && signals.ip && signals.ip !== "unknown" ? signals.ip : null

  const conds: SQL[] = []
  if (email) conds.push(eq(trial_grant.email_canonical, email))
  if (google) conds.push(eq(trial_grant.google_account_id, google))
  if (regno) conds.push(eq(trial_grant.registration_number_canonical, regno))
  if (ip) conds.push(eq(trial_grant.signup_ip, ip))
  if (!conds.length) return []

  const where = opts.excludeOrgId
    ? and(or(...conds), or(ne(trial_grant.organization_id, opts.excludeOrgId), sql`${trial_grant.organization_id} IS NULL`))
    : or(...conds)

  const db = dbAdmin()
  const rows = await db.select().from(trial_grant).where(where).orderBy(desc(trial_grant.created_at)).limit(50)
  if (!rows.length) return []

  const orgIds = [...new Set(rows.map((r) => r.organization_id).filter((x): x is string => !!x))]
  const orgs = orgIds.length
    ? await db.select({ id: organization.id, name: organization.name, sub: subscription })
        .from(organization).leftJoin(subscription, eq(subscription.organization_id, organization.id))
        .where(inArray(organization.id, orgIds))
    : []
  const orgMap = new Map(orgs.map((o) => [o.id, o]))

  return rows.map((r) => {
    const matched: MatchSignal[] = []
    if (email && r.email_canonical === email) matched.push("email")
    if (google && r.google_account_id === google) matched.push("google")
    if (regno && r.registration_number_canonical === regno) matched.push("registration_number")
    if (ip && r.signup_ip === ip) matched.push("ip")
    const org = r.organization_id ? orgMap.get(r.organization_id) : undefined
    const computedEnd = r.granted && r.trial_days > 0 ? new Date(r.created_at.getTime() + r.trial_days * 86_400_000) : null
    const end = org?.sub?.trial_ends_at ?? computedEnd
    return {
      id: r.id,
      organization_id: r.organization_id,
      org_name: org?.name ?? null,
      org_exists: !!org,
      status: org?.sub ? effectiveSubscriptionStatus(org.sub) : null,
      source: r.source,
      granted: r.granted,
      trial_days: r.trial_days,
      created_at: r.created_at.toISOString(),
      trial_ended_at: end ? end.toISOString() : null,
      matched_on: matched,
    }
  })
}

/** The blocking subset: prior GRANTED trials matched on a hard signal (never IP alone). */
export function blockingTrials(prior: PriorTrial[]): PriorTrial[] {
  return prior.filter((p) => p.granted && p.matched_on.some((m) => m !== "ip"))
}

/** Friendly, privacy-light summary of the most relevant prior trial for the UI. */
export function priorTrialSummary(prior: PriorTrial[]): { pharmacy: string | null; trial_ended_at: string | null; matched_on: MatchSignal[] } | null {
  const p = blockingTrials(prior)[0]
  if (!p) return null
  return { pharmacy: p.org_name, trial_ended_at: p.trial_ended_at, matched_on: p.matched_on }
}

export interface TrialGrantInput {
  organizationId: string | null
  email: string
  googleAccountId?: string | null
  phone?: string | null
  registrationNumber?: string | null
  ip?: string | null
  userAgent?: string | null
  source: Exclude<TrialSource, "backfill">
  trialDays: number
  granted: boolean
}

/** Append a row to the trial ledger. */
export async function recordTrialGrant(input: TrialGrantInput, db: Pick<ReturnType<typeof dbAdmin>, "insert"> = dbAdmin()): Promise<void> {
  await db.insert(trial_grant).values({
    organization_id: input.organizationId,
    email_canonical: canonicalEmail(input.email),
    email_raw: input.email.trim(),
    google_account_id: input.googleAccountId ?? null,
    phone_e164: input.phone ?? null,
    registration_number_canonical: canonicalRegistrationNumber(input.registrationNumber),
    signup_ip: input.ip && input.ip !== "unknown" ? input.ip : null,
    user_agent: input.userAgent ?? null,
    source: input.source,
    trial_days: Math.max(0, input.granted ? input.trialDays : 0),
    granted: input.granted,
  })
}

/** Duplicate-identity signals for an existing tenant (operator console):
 *  other trial_grant rows sharing its email / Google account / reg. number / IP. */
export async function duplicateSignalsForOrg(orgId: string): Promise<PriorTrial[]> {
  const own = await dbAdmin().select().from(trial_grant).where(eq(trial_grant.organization_id, orgId))
  if (!own.length) return []
  const seen = new Map<string, PriorTrial>()
  for (const g of own) {
    const matches = await findPriorTrial(
      { email: g.email_canonical, googleAccountId: g.google_account_id, registrationNumber: g.registration_number_canonical, ip: g.signup_ip },
      { excludeOrgId: orgId, includeIp: true },
    )
    for (const m of matches) {
      const prev = seen.get(m.id)
      if (prev) prev.matched_on = [...new Set([...prev.matched_on, ...m.matched_on])]
      else seen.set(m.id, m)
    }
  }
  return [...seen.values()].sort((a, b) => b.created_at.localeCompare(a.created_at))
}

/** Bulk version for the tenant list: which orgs share a hard signal (email /
 *  Google / reg. no.) or only an IP with another trial_grant row. One query. */
export async function duplicateFlagsForOrgs(orgIds: string[]): Promise<Map<string, { repeat: boolean; ipOnly: boolean }>> {
  const out = new Map<string, { repeat: boolean; ipOnly: boolean }>()
  if (!orgIds.length) return out
  const rows = (await dbAdmin().execute(sql`
    SELECT a.organization_id AS org,
      bool_or(
        (b.email_canonical = a.email_canonical)
        OR (a.google_account_id IS NOT NULL AND b.google_account_id = a.google_account_id)
        OR (a.registration_number_canonical IS NOT NULL AND b.registration_number_canonical = a.registration_number_canonical)
      ) AS hard,
      bool_or(a.signup_ip IS NOT NULL AND b.signup_ip = a.signup_ip) AS ip
    FROM trial_grant a
    JOIN trial_grant b
      ON b.id <> a.id
     AND (b.organization_id IS DISTINCT FROM a.organization_id)
     AND (
          b.email_canonical = a.email_canonical
       OR (a.google_account_id IS NOT NULL AND b.google_account_id = a.google_account_id)
       OR (a.registration_number_canonical IS NOT NULL AND b.registration_number_canonical = a.registration_number_canonical)
       OR (a.signup_ip IS NOT NULL AND b.signup_ip = a.signup_ip)
     )
    WHERE a.organization_id IN (${sql.join(orgIds.map((id) => sql`${id}`), sql`, `)})
    GROUP BY a.organization_id
  `)) as unknown as Array<{ org: string; hard: boolean; ip: boolean }>
  for (const r of rows) out.set(r.org, { repeat: !!r.hard, ipOnly: !r.hard && !!r.ip })
  return out
}
