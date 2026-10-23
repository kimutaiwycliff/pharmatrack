import { sql } from "drizzle-orm"
import { dbAdmin } from "@pharmatrack/db"

// Cross-tenant usage + money queries for the operator console (dbAdmin, so
// RLS is bypassed — operator-only callers). Money is KES; days are Nairobi
// calendar days ("YYYY-MM-DD"). Profit uses the same rule as Reports: line
// total minus cost (the sale line's cost snapshot, else the batch's, else the
// product's), on lines whose cost is known. Stock value matches Reports →
// Inventory: unexpired stock at cost / at selling price.

type Row = Record<string, unknown>
const n = (v: unknown) => (v == null ? 0 : Number(v))
const ms = (v: unknown) => (v == null ? null : new Date(v as string).getTime())
const NAIROBI_TODAY = sql`(now() AT TIME ZONE 'Africa/Nairobi')::date`

async function rows(q: ReturnType<typeof sql>): Promise<Row[]> {
  return (await dbAdmin().execute(q)) as unknown as Row[]
}

// ── Per-tenant rollups (list + digest) ──────────────────────────────────────

export interface TenantRollup {
  lastActiveAt: number | null
  lastLoginAt: number | null
  lastSaleAt: number | null
  firstSaleAt: number | null
  logins30: number
  activeDays30: number
  activeStaff30: number
  sales30: number
  revenue30: number
  revenuePrev30: number
  profit30: number
  stockCost: number
  stockRetail: number
  /** revenue per day for the last 30 days, oldest first */
  spark30: number[]
}

export async function tenantRollups(): Promise<Map<string, TenantRollup>> {
  const [activity, lastSeen, sales, profit, daily, stock, devices] = await Promise.all([
    rows(sql`
      SELECT organization_id AS org, sum(logins)::int AS logins, count(DISTINCT day)::int AS days, count(DISTINCT user_id)::int AS staff
      FROM user_activity_day WHERE day > ${NAIROBI_TODAY} - 30 GROUP BY 1`),
    rows(sql`
      SELECT organization_id AS org, max(last_seen_at) AS seen,
             max(last_seen_at) FILTER (WHERE logins > 0) AS login
      FROM user_activity_day GROUP BY 1`),
    rows(sql`
      SELECT organization_id AS org,
             count(*) FILTER (WHERE created_at >= now() - interval '30 days')::int AS n30,
             coalesce(sum(total_amount) FILTER (WHERE created_at >= now() - interval '30 days'), 0) AS rev30,
             coalesce(sum(total_amount) FILTER (WHERE created_at >= now() - interval '60 days' AND created_at < now() - interval '30 days'), 0) AS prev30,
             min(created_at) AS first_sale, max(created_at) AS last_sale
      FROM sale WHERE status = 'completed' GROUP BY 1`),
    rows(sql`
      SELECT s.organization_id AS org,
             coalesce(sum(si.line_total - si.quantity * coalesce(si.unit_cost, b.cost_price, p.cost_price))
               FILTER (WHERE coalesce(si.unit_cost, b.cost_price, p.cost_price) IS NOT NULL), 0) AS profit
      FROM sale s
      JOIN sale_item si ON si.sale_id = s.id
      LEFT JOIN product_batch b ON b.id = si.batch_id
      LEFT JOIN product p ON p.id = si.product_id
      WHERE s.status = 'completed' AND s.created_at >= now() - interval '30 days'
      GROUP BY 1`),
    rows(sql`
      SELECT organization_id AS org, (created_at AT TIME ZONE 'Africa/Nairobi')::date::text AS d, sum(total_amount) AS rev
      FROM sale WHERE status = 'completed' AND created_at >= now() - interval '31 days'
      GROUP BY 1, 2`),
    rows(sql`
      SELECT p.organization_id AS org,
             coalesce(sum(b.quantity_remaining * coalesce(b.cost_price, p.cost_price)) FILTER (WHERE coalesce(b.cost_price, p.cost_price) IS NOT NULL), 0) AS cost,
             coalesce(sum(b.quantity_remaining * p.selling_price), 0) AS retail
      FROM product_batch b JOIN product p ON p.id = b.product_id
      WHERE b.quantity_remaining > 0 AND b.expiry_date >= ${NAIROBI_TODAY}
      GROUP BY 1`),
    rows(sql`SELECT organization_id AS org, max(last_seen_at) AS seen FROM device WHERE revoked_at IS NULL GROUP BY 1`),
  ])

  const days = lastNDays(30)
  const out = new Map<string, TenantRollup>()
  const get = (org: string) => {
    let r = out.get(org)
    if (!r) {
      r = {
        lastActiveAt: null, lastLoginAt: null, lastSaleAt: null, firstSaleAt: null, logins30: 0, activeDays30: 0, activeStaff30: 0,
        sales30: 0, revenue30: 0, revenuePrev30: 0, profit30: 0, stockCost: 0, stockRetail: 0, spark30: days.map(() => 0),
      }
      out.set(org, r)
    }
    return r
  }
  const latest = (a: number | null, b: number | null) => (a == null ? b : b == null ? a : Math.max(a, b))

  for (const a of activity) Object.assign(get(String(a.org)), { logins30: n(a.logins), activeDays30: n(a.days), activeStaff30: n(a.staff) })
  for (const a of lastSeen) {
    const r = get(String(a.org))
    r.lastActiveAt = latest(r.lastActiveAt, ms(a.seen))
    r.lastLoginAt = ms(a.login)
  }
  for (const s of sales) {
    const r = get(String(s.org))
    Object.assign(r, { sales30: n(s.n30), revenue30: n(s.rev30), revenuePrev30: n(s.prev30), firstSaleAt: ms(s.first_sale), lastSaleAt: ms(s.last_sale) })
    r.lastActiveAt = latest(r.lastActiveAt, r.lastSaleAt)
  }
  for (const p of profit) get(String(p.org)).profit30 = round2(n(p.profit))
  const idx = new Map(days.map((d, i) => [d, i]))
  for (const d of daily) {
    const i = idx.get(String(d.d))
    if (i != null) get(String(d.org)).spark30[i] = n(d.rev)
  }
  for (const s of stock) Object.assign(get(String(s.org)), { stockCost: round2(n(s.cost)), stockRetail: round2(n(s.retail)) })
  for (const d of devices) {
    const r = get(String(d.org))
    r.lastActiveAt = latest(r.lastActiveAt, ms(d.seen))
  }
  return out
}

/** Platform-wide trend: sales value and how many pharmacies were active, per day. */
export async function platformDaily(daysBack = 30) {
  const [sales, active] = await Promise.all([
    rows(sql`
      SELECT (created_at AT TIME ZONE 'Africa/Nairobi')::date::text AS d, sum(total_amount) AS rev, count(DISTINCT organization_id)::int AS orgs
      FROM sale WHERE status = 'completed' AND created_at >= now() - make_interval(days => ${daysBack + 1}::int)
      GROUP BY 1`),
    rows(sql`
      SELECT day::text AS d, count(DISTINCT organization_id)::int AS orgs
      FROM user_activity_day WHERE day > ${NAIROBI_TODAY} - ${daysBack}::int GROUP BY 1`),
  ])
  const s = new Map(sales.map((r) => [String(r.d), r]))
  const a = new Map(active.map((r) => [String(r.d), n(r.orgs)]))
  return lastNDays(daysBack).map((d) => ({
    day: d,
    revenue: n(s.get(d)?.rev),
    activePharmacies: Math.max(a.get(d) ?? 0, n(s.get(d)?.orgs)),
  }))
}

/** Subscription money: what pharmacies pay PharmaTrack. */
export async function platformBilling() {
  const [mrr, paid] = await Promise.all([
    rows(sql`
      SELECT coalesce(sum(CASE WHEN p.interval IN ('annual', 'yearly') THEN p.price_kes / 12.0 ELSE p.price_kes END), 0) AS mrr
      FROM subscription s JOIN plan p ON p.id = s.plan_id
      WHERE s.status = 'active' AND (s.current_period_end IS NULL OR s.current_period_end > now())`),
    rows(sql`
      SELECT coalesce(sum(amount_kes) FILTER (WHERE coalesce(confirmed_at, created_at) >= now() - interval '30 days'), 0) AS paid30
      FROM subscription_payment WHERE status = 'confirmed'`),
  ])
  return { mrr: round2(n(mrr[0]?.mrr)), collected30: round2(n(paid[0]?.paid30)) }
}

// ── One pharmacy in depth ───────────────────────────────────────────────────

export async function tenantDetail(orgId: string, daysBack = 90) {
  const since = sql`now() - make_interval(days => ${daysBack}::int)`
  const [
    dailySales, dailyProfit, dailyActivity, heat, mix, top, branches, stock, staff, devices, adoption, milestones, sources, totals, prev,
  ] = await Promise.all([
    rows(sql`
      SELECT (created_at AT TIME ZONE 'Africa/Nairobi')::date::text AS d, count(*)::int AS n, sum(total_amount) AS rev
      FROM sale WHERE organization_id = ${orgId} AND status = 'completed' AND created_at >= ${since} GROUP BY 1`),
    rows(sql`
      SELECT (s.created_at AT TIME ZONE 'Africa/Nairobi')::date::text AS d,
             sum(si.line_total - si.quantity * coalesce(si.unit_cost, b.cost_price, p.cost_price))
               FILTER (WHERE coalesce(si.unit_cost, b.cost_price, p.cost_price) IS NOT NULL) AS profit
      FROM sale s JOIN sale_item si ON si.sale_id = s.id
      LEFT JOIN product_batch b ON b.id = si.batch_id LEFT JOIN product p ON p.id = si.product_id
      WHERE s.organization_id = ${orgId} AND s.status = 'completed' AND s.created_at >= ${since} GROUP BY 1`),
    rows(sql`
      SELECT day::text AS d, count(DISTINCT user_id)::int AS users, sum(logins)::int AS logins
      FROM user_activity_day WHERE organization_id = ${orgId} AND day > ${NAIROBI_TODAY} - ${daysBack}::int GROUP BY 1`),
    rows(sql`
      SELECT extract(isodow FROM created_at AT TIME ZONE 'Africa/Nairobi')::int AS dow,
             extract(hour FROM created_at AT TIME ZONE 'Africa/Nairobi')::int AS h, count(*)::int AS n
      FROM sale WHERE organization_id = ${orgId} AND status = 'completed' AND created_at >= ${since} GROUP BY 1, 2`),
    rows(sql`
      SELECT payment_method AS m, count(*)::int AS n, sum(total_amount) AS rev
      FROM sale WHERE organization_id = ${orgId} AND status = 'completed' AND created_at >= now() - interval '30 days' GROUP BY 1`),
    rows(sql`
      SELECT si.product_name AS name, sum(si.quantity)::int AS qty, sum(si.line_total) AS rev,
             sum(si.line_total - si.quantity * coalesce(si.unit_cost, b.cost_price, p.cost_price))
               FILTER (WHERE coalesce(si.unit_cost, b.cost_price, p.cost_price) IS NOT NULL) AS profit
      FROM sale s JOIN sale_item si ON si.sale_id = s.id
      LEFT JOIN product_batch b ON b.id = si.batch_id LEFT JOIN product p ON p.id = si.product_id
      WHERE s.organization_id = ${orgId} AND s.status = 'completed' AND s.created_at >= now() - interval '30 days'
      GROUP BY 1 ORDER BY rev DESC LIMIT 8`),
    rows(sql`
      SELECT br.id, br.name, br.is_active,
             (SELECT count(*)::int FROM sale s WHERE s.branch_id = br.id AND s.status = 'completed' AND s.created_at >= now() - interval '30 days') AS n30,
             (SELECT coalesce(sum(total_amount), 0) FROM sale s WHERE s.branch_id = br.id AND s.status = 'completed' AND s.created_at >= now() - interval '30 days') AS rev30,
             (SELECT coalesce(sum(b.quantity_remaining * coalesce(b.cost_price, p.cost_price)), 0) FROM product_batch b JOIN product p ON p.id = b.product_id
                WHERE b.branch_id = br.id AND b.quantity_remaining > 0 AND b.expiry_date >= ${NAIROBI_TODAY}) AS stock_cost
      FROM branch br WHERE br.organization_id = ${orgId} ORDER BY br.name`),
    rows(sql`
      SELECT
        coalesce(sum(b.quantity_remaining * coalesce(b.cost_price, p.cost_price)) FILTER (WHERE NOT x.expired AND coalesce(b.cost_price, p.cost_price) IS NOT NULL), 0) AS cost,
        coalesce(sum(b.quantity_remaining * p.selling_price) FILTER (WHERE NOT x.expired), 0) AS retail,
        coalesce(sum(b.quantity_remaining * p.selling_price) FILTER (WHERE NOT x.expired AND coalesce(b.cost_price, p.cost_price) IS NOT NULL), 0) AS retail_with_cost,
        coalesce(sum(b.quantity_remaining * coalesce(b.cost_price, p.cost_price, 0)) FILTER (WHERE x.expired), 0) AS expired_cost,
        count(DISTINCT b.product_id) FILTER (WHERE NOT x.expired)::int AS products,
        count(DISTINCT b.product_id) FILTER (WHERE NOT x.expired AND coalesce(b.cost_price, p.cost_price) IS NULL)::int AS missing_cost
      FROM product_batch b JOIN product p ON p.id = b.product_id
      CROSS JOIN LATERAL (SELECT b.expiry_date < ${NAIROBI_TODAY} AS expired) x
      WHERE p.organization_id = ${orgId} AND b.quantity_remaining > 0`),
    rows(sql`
      SELECT u.id, u.name, u.email, sp.role, sp.is_active, sp.branch_id,
             (SELECT max(last_seen_at) FROM user_activity_day a WHERE a.user_id = u.id AND a.organization_id = ${orgId}) AS last_seen,
             (SELECT coalesce(sum(logins), 0)::int FROM user_activity_day a WHERE a.user_id = u.id AND a.organization_id = ${orgId} AND a.day > ${NAIROBI_TODAY} - 30) AS logins30,
             (SELECT count(*)::int FROM user_activity_day a WHERE a.user_id = u.id AND a.organization_id = ${orgId} AND a.day > ${NAIROBI_TODAY} - 30) AS days30,
             (SELECT count(*)::int FROM sale s WHERE s.cashier_id = u.id AND s.organization_id = ${orgId} AND s.status = 'completed' AND s.created_at >= now() - interval '30 days') AS sales30,
             (SELECT coalesce(sum(total_amount), 0) FROM sale s WHERE s.cashier_id = u.id AND s.organization_id = ${orgId} AND s.status = 'completed' AND s.created_at >= now() - interval '30 days') AS rev30,
             (SELECT max(created_at) FROM sale s WHERE s.cashier_id = u.id AND s.organization_id = ${orgId}) AS last_sale
      FROM staff_profile sp JOIN "user" u ON u.id = sp.user_id
      WHERE sp.organization_id = ${orgId} ORDER BY sp.is_active DESC, u.name`),
    rows(sql`
      SELECT d.id, d.name, d.device_code AS code, d.platform, d.last_seen_at, d.last_sync_at, d.revoked_at, br.name AS branch
      FROM device d LEFT JOIN branch br ON br.id = d.branch_id WHERE d.organization_id = ${orgId} ORDER BY d.revoked_at NULLS FIRST, d.last_seen_at DESC NULLS LAST`),
    rows(sql`
      SELECT
        (SELECT count(*)::int FROM product WHERE organization_id = ${orgId} AND is_active) AS products,
        (SELECT count(*)::int FROM product WHERE organization_id = ${orgId} AND is_active AND selling_price > 0) AS priced,
        (SELECT count(*)::int FROM product_batch WHERE organization_id = ${orgId}) AS batches,
        (SELECT count(*)::int FROM shift WHERE organization_id = ${orgId} AND opened_at >= now() - interval '30 days') AS shifts30,
        (SELECT count(*)::int FROM purchase_order WHERE organization_id = ${orgId}) AS purchase_orders,
        (SELECT count(*)::int FROM customer WHERE organization_id = ${orgId}) AS customers,
        (SELECT count(*)::int FROM appointment WHERE organization_id = ${orgId} AND created_at >= now() - interval '30 days') AS appointments30,
        (SELECT count(*)::int FROM prescription WHERE organization_id = ${orgId} AND created_at >= now() - interval '30 days') AS prescriptions30,
        (SELECT count(*)::int FROM device WHERE organization_id = ${orgId} AND revoked_at IS NULL) AS devices,
        (SELECT count(*)::int FROM branch WHERE organization_id = ${orgId}) AS branches,
        (SELECT count(*)::int FROM staff_profile WHERE organization_id = ${orgId} AND is_active) AS staff,
        (SELECT coalesce(bool_or(active), false) FROM mpesa_config WHERE organization_id = ${orgId}) AS mpesa`),
    rows(sql`
      SELECT
        (SELECT "createdAt" FROM organization WHERE id = ${orgId}) AS signed_up,
        (SELECT min(created_at) FROM product WHERE organization_id = ${orgId}) AS first_product,
        (SELECT min(received_at) FROM product_batch WHERE organization_id = ${orgId}) AS first_stock,
        (SELECT min(created_at) FROM sale WHERE organization_id = ${orgId} AND status = 'completed') AS first_sale,
        (SELECT created_at FROM sale WHERE organization_id = ${orgId} AND status = 'completed' ORDER BY created_at OFFSET 9 LIMIT 1) AS tenth_sale,
        (SELECT min(coalesce(confirmed_at, created_at)) FROM subscription_payment WHERE organization_id = ${orgId} AND status = 'confirmed') AS first_payment`),
    rows(sql`
      SELECT src, sum(pings)::int AS pings FROM user_activity_day, unnest(sources) AS src
      WHERE organization_id = ${orgId} AND day > ${NAIROBI_TODAY} - 30 GROUP BY 1`),
    rows(sql`
      SELECT
        (SELECT coalesce(sum(total_amount), 0) FROM sale WHERE organization_id = ${orgId} AND status = 'completed') AS lifetime_revenue,
        (SELECT count(*)::int FROM sale WHERE organization_id = ${orgId} AND status = 'completed') AS lifetime_sales,
        (SELECT coalesce(sum(amount_kes), 0) FROM subscription_payment WHERE organization_id = ${orgId} AND status = 'confirmed') AS paid_to_us,
        (SELECT max(last_seen_at) FROM user_activity_day WHERE organization_id = ${orgId}) AS last_seen,
        (SELECT max(last_seen_at) FROM user_activity_day WHERE organization_id = ${orgId} AND logins > 0) AS last_login,
        (SELECT max(created_at) FROM sale WHERE organization_id = ${orgId} AND status = 'completed') AS last_sale,
        (SELECT max(last_seen_at) FROM device WHERE organization_id = ${orgId} AND revoked_at IS NULL) AS device_seen`),
    rows(sql`
      SELECT
        (SELECT count(*)::int FROM sale WHERE organization_id = ${orgId} AND status = 'completed'
           AND created_at >= now() - interval '60 days' AND created_at < now() - interval '30 days') AS n_prev,
        (SELECT coalesce(sum(total_amount), 0) FROM sale WHERE organization_id = ${orgId} AND status = 'completed'
           AND created_at >= now() - interval '60 days' AND created_at < now() - interval '30 days') AS rev_prev,
        (SELECT coalesce(sum(si.line_total - si.quantity * coalesce(si.unit_cost, b.cost_price, p.cost_price))
                 FILTER (WHERE coalesce(si.unit_cost, b.cost_price, p.cost_price) IS NOT NULL), 0)
           FROM sale s2 JOIN sale_item si ON si.sale_id = s2.id
           LEFT JOIN product_batch b ON b.id = si.batch_id LEFT JOIN product p ON p.id = si.product_id
           WHERE s2.organization_id = ${orgId} AND s2.status = 'completed'
             AND s2.created_at >= now() - interval '60 days' AND s2.created_at < now() - interval '30 days') AS profit_prev,
        (SELECT count(DISTINCT user_id)::int FROM user_activity_day WHERE organization_id = ${orgId} AND day <= ${NAIROBI_TODAY} - 30 AND day > ${NAIROBI_TODAY} - 60) AS staff_prev,
        (SELECT coalesce(sum(logins), 0)::int FROM user_activity_day WHERE organization_id = ${orgId} AND day <= ${NAIROBI_TODAY} - 30 AND day > ${NAIROBI_TODAY} - 60) AS logins_prev`),
  ])

  const daysList = lastNDays(daysBack)
  const sMap = new Map(dailySales.map((r) => [String(r.d), r]))
  const pMap = new Map(dailyProfit.map((r) => [String(r.d), n(r.profit)]))
  const aMap = new Map(dailyActivity.map((r) => [String(r.d), r]))
  const daily = daysList.map((d) => ({
    day: d,
    sales: n(sMap.get(d)?.n),
    revenue: n(sMap.get(d)?.rev),
    profit: round2(pMap.get(d) ?? 0),
    activeStaff: n(aMap.get(d)?.users),
    logins: n(aMap.get(d)?.logins),
  }))
  const last30 = daily.slice(-30)
  const sum = (k: "sales" | "revenue" | "profit" | "logins") => last30.reduce((s, r) => s + r[k], 0)
  const st = stock[0] ?? {}
  const t = totals[0] ?? {}
  const pr = prev[0] ?? {}
  const latest = (...xs: (number | null)[]) => xs.reduce<number | null>((a, b) => (a == null ? b : b == null ? a : Math.max(a, b)), null)

  const revenue30 = round2(sum("revenue"))
  const sales30 = sum("sales")
  return {
    summary: {
      lastActiveAt: latest(ms(t.last_seen), ms(t.last_sale), ms(t.device_seen)),
      lastLoginAt: ms(t.last_login),
      lastSaleAt: ms(t.last_sale),
      lifetimeRevenue: round2(n(t.lifetime_revenue)),
      lifetimeSales: n(t.lifetime_sales),
      paidToUs: round2(n(t.paid_to_us)),
      sales30, revenue30, profit30: round2(sum("profit")), logins30: sum("logins"),
      avgBasket30: sales30 > 0 ? round2(revenue30 / sales30) : 0,
      activeDays30: last30.filter((r) => r.activeStaff > 0 || r.sales > 0).length,
      activeStaff30: staff.filter((s) => n(s.days30) > 0).length,
      prev: {
        sales30: n(pr.n_prev), revenue30: round2(n(pr.rev_prev)), profit30: round2(n(pr.profit_prev)),
        activeStaff30: n(pr.staff_prev), logins30: n(pr.logins_prev),
      },
    },
    daily,
    heat: heat.map((h) => ({ dow: n(h.dow), hour: n(h.h), sales: n(h.n) })),
    paymentMix: mix.map((m) => ({ method: String(m.m), sales: n(m.n), revenue: round2(n(m.rev)) })),
    topProducts: top.map((p) => ({ name: String(p.name), qty: n(p.qty), revenue: round2(n(p.rev)), profit: p.profit == null ? null : round2(n(p.profit)) })),
    branches: branches.map((b) => ({ id: String(b.id), name: String(b.name), active: !!b.is_active, sales30: n(b.n30), revenue30: round2(n(b.rev30)), stockCost: round2(n(b.stock_cost)) })),
    stock: {
      cost: round2(n(st.cost)), retail: round2(n(st.retail)),
      potentialProfit: round2(n(st.retail_with_cost) - n(st.cost)),
      expiredCost: round2(n(st.expired_cost)), products: n(st.products), missingCost: n(st.missing_cost),
    },
    staff: staff.map((s) => ({
      id: String(s.id), name: String(s.name ?? s.email ?? "—"), email: s.email ? String(s.email) : null, role: String(s.role), active: !!s.is_active,
      lastSeenAt: latest(ms(s.last_seen), ms(s.last_sale)), logins30: n(s.logins30), activeDays30: n(s.days30), sales30: n(s.sales30), revenue30: round2(n(s.rev30)),
    })),
    devices: devices.map((d) => ({
      id: String(d.id), name: String(d.name), code: String(d.code), platform: d.platform ? String(d.platform) : null, branch: d.branch ? String(d.branch) : null,
      lastSeenAt: ms(d.last_seen_at), lastSyncAt: ms(d.last_sync_at), revoked: d.revoked_at != null,
    })),
    adoption: Object.fromEntries(Object.entries(adoption[0] ?? {}).map(([k, v]) => [k, typeof v === "boolean" ? v : n(v)])) as Record<string, number | boolean>,
    milestones: Object.fromEntries(Object.entries(milestones[0] ?? {}).map(([k, v]) => [k, ms(v)])) as Record<string, number | null>,
    apps: Object.fromEntries(sources.map((s) => [String(s.src), n(s.pings)])) as Record<string, number>,
  }
}

export type TenantDetailInsights = Awaited<ReturnType<typeof tenantDetail>>

// ── helpers ─────────────────────────────────────────────────────────────────

function round2(x: number) {
  return Math.round(x * 100) / 100
}

/** The last `count` Nairobi calendar days, oldest first, as YYYY-MM-DD. */
export function lastNDays(count: number, now = Date.now()): string[] {
  const out: string[] = []
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi" })
  for (let i = count - 1; i >= 0; i--) out.push(fmt.format(new Date(now - i * 86_400_000)))
  return out
}
