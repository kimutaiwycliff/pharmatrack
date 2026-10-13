import { describe, expect, it } from "vitest"
import {
  allowanceRows, localStock, SQL_ALLOWANCES_INSERT, SQL_STOCK_SET, SQL_STOCK_ZERO_REST, sqlDeleteIds, sqlDeleteMissing,
  sqlStaleIds, stockRows,
} from "../pull-sql"

// The statements run against Node's built-in SQLite (same 3.50 line as the
// one expo-sqlite 57 bundles). Loaded via getBuiltinModule so neither Vite nor
// the RN type environment has to know about `node:sqlite`.
interface Stmt {
  run(...params: unknown[]): { changes: number | bigint }
  all(...params: unknown[]): Record<string, unknown>[]
}
interface Db {
  exec(sql: string): void
  prepare(sql: string): Stmt
}
const proc = (globalThis as { process?: { getBuiltinModule?: (id: string) => unknown } }).process
const nodeSqlite = proc?.getBuiltinModule?.("node:sqlite") as { DatabaseSync: new (path: string) => Db } | undefined

function freshDb(): Db {
  const db = new nodeSqlite!.DatabaseSync(":memory:")
  db.exec(`
    CREATE TABLE products (product_id TEXT PRIMARY KEY NOT NULL, stock_on_hand INTEGER NOT NULL, earliest_expiry TEXT);
    CREATE TABLE allowances (product_id TEXT PRIMARY KEY NOT NULL, quantity INTEGER NOT NULL DEFAULT 0, reserved_until TEXT, updated_at INTEGER NOT NULL);
    INSERT INTO products VALUES ('a', 5, '2027-01-01'), ('b', 3, NULL), ('c', 0, NULL), ('d', 9, '2026-12-01');
  `)
  return db
}

const stock = (db: Db) =>
  Object.fromEntries(
    db.prepare("SELECT product_id, stock_on_hand, earliest_expiry FROM products ORDER BY product_id").all().map((r) => [
      r.product_id, [r.stock_on_hand, r.earliest_expiry],
    ]),
  )

describe("pull row builders", () => {
  it("subtracts unsynced sales and never goes below zero", () => {
    expect(localStock(10, 3)).toBe(7)
    expect(localStock(2, 5)).toBe(0)
    expect(localStock(undefined, undefined)).toBe(0)
    const rows = stockRows(new Map([["a", { qty: 10, expiry: "x" }], ["b", { qty: 1, expiry: null }]]), new Map([["a", 4], ["b", 2]]))
    expect(rows).toEqual([["a", 6, "x"], ["b", 0, null]])
  })

  it("takes pending sales off the allocation", () => {
    expect(allowanceRows([{ product_id: "a", quantity: 8 }, { product_id: "b", quantity: 1 }], new Map([["b", 3]]))).toEqual([
      ["a", 8],
      ["b", 0],
    ])
  })
})

describe.skipIf(!nodeSqlite)("pull SQL (real SQLite)", () => {
  it("replaces the whole stock picture like zero-then-set did", () => {
    const db = freshDb()
    const json = JSON.stringify(stockRows(new Map([["a", { qty: 7, expiry: "2027-02-01" }], ["c", { qty: 2, expiry: null }]]), new Map([["a", 1]])))
    db.prepare(SQL_STOCK_ZERO_REST).run(json)
    db.prepare(SQL_STOCK_SET).run(json)
    expect(stock(db)).toEqual({ a: [6, "2027-02-01"], b: [0, null], c: [2, null], d: [0, null] })
  })

  it("only rewrites rows that changed", () => {
    const db = freshDb()
    const json = JSON.stringify([["a", 5, "2027-01-01"], ["b", 4, null]])
    expect(Number(db.prepare(SQL_STOCK_SET).run(json).changes)).toBe(1)
    expect(Number(db.prepare(SQL_STOCK_ZERO_REST).run(json).changes)).toBe(1) // d; c is already 0
  })

  it("an empty stock list zeroes everything", () => {
    const db = freshDb()
    db.prepare(SQL_STOCK_ZERO_REST).run("[]")
    db.prepare(SQL_STOCK_SET).run("[]")
    expect(Object.values(stock(db))).toEqual([[0, null], [0, null], [0, null], [0, null]])
  })

  it("inserts allowances from JSON", () => {
    const db = freshDb()
    db.prepare(SQL_ALLOWANCES_INSERT).run(JSON.stringify([["a", 4], ["b", 0]]), "2026-10-14T00:00:00Z", 123)
    expect(db.prepare("SELECT * FROM allowances ORDER BY product_id").all().map((r) => ({ ...r }))).toEqual([
      { product_id: "a", quantity: 4, reserved_until: "2026-10-14T00:00:00Z", updated_at: 123 },
      { product_id: "b", quantity: 0, reserved_until: "2026-10-14T00:00:00Z", updated_at: 123 },
    ])
  })

  it("finds and deletes rows a full download didn't send", () => {
    const db = freshDb()
    const seen = JSON.stringify(["a", "c"])
    expect(db.prepare(sqlStaleIds("products", "product_id")).all(seen).map((r) => r.id).sort()).toEqual(["b", "d"])
    db.prepare(sqlDeleteIds("products", "product_id")).run(JSON.stringify(["d"]))
    db.prepare(sqlDeleteMissing("products", "product_id")).run(JSON.stringify(["a", "c"]))
    expect(Object.keys(stock(db))).toEqual(["a", "c"])
  })
})
