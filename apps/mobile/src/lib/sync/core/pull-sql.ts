// Set-based SQL + the pure row builders behind pull-apply.ts. Pure (no React
// Native imports) so the statements are tested against real SQLite in
// __tests__/pull-sql.test.ts.
//
// Why set-based: the pull runs ~seconds after every sale, inside one
// synchronous transaction on the JS thread (it must — a sale commit can't
// interleave with it, and a second connection would make that commit fail
// with "database is locked"). One un-prepared runSync per product froze the
// till for a second or more on a big branch; a single statement fed a JSON
// array does the same work inside SQLite in a few milliseconds, and only
// rewrites rows whose value actually changed.

export { localStock, stockRows, allowanceRows, type StockRow, type AllowanceRow } from "@pharmatrack/core/sync"

// ?1 = JSON array of StockRow. Only rows whose value differs are written.
export const SQL_STOCK_SET = `
  UPDATE products SET stock_on_hand = s.qty, earliest_expiry = s.expiry
  FROM (SELECT value ->> 0 AS id, value ->> 1 AS qty, value ->> 2 AS expiry FROM json_each(?1)) AS s
  WHERE products.product_id = s.id
    AND (products.stock_on_hand IS NOT s.qty OR products.earliest_expiry IS NOT s.expiry)`

// ?1 = the same JSON array: every product the server has no stock for is 0.
export const SQL_STOCK_ZERO_REST = `
  UPDATE products SET stock_on_hand = 0, earliest_expiry = NULL
  WHERE (stock_on_hand <> 0 OR earliest_expiry IS NOT NULL)
    AND product_id NOT IN (SELECT value ->> 0 FROM json_each(?1))`

// ?1 = JSON array of AllowanceRow, ?2 = reserved_until, ?3 = updated_at.
export const SQL_ALLOWANCES_INSERT = `
  INSERT INTO allowances (product_id, quantity, reserved_until, updated_at)
  SELECT value ->> 0, value ->> 1, ?2, ?3 FROM json_each(?1)`

// ?1 = JSON array of ids seen in a full download.
export const sqlStaleIds = (table: string, idCol: string) =>
  `SELECT ${idCol} AS id FROM ${table} WHERE ${idCol} NOT IN (SELECT value FROM json_each(?1))`
export const sqlDeleteMissing = (table: string, idCol: string) =>
  `DELETE FROM ${table} WHERE ${idCol} NOT IN (SELECT value FROM json_each(?1))`
// ?1 = JSON array of ids to delete.
export const sqlDeleteIds = (table: string, idCol: string) =>
  `DELETE FROM ${table} WHERE ${idCol} IN (SELECT value FROM json_each(?1))`
