import { Database } from "@nozbe/watermelondb"
import SQLiteAdapter from "@nozbe/watermelondb/adapters/sqlite"
import { schema } from "./schema"
import Product from "./models/Product"
import QueuedSale from "./models/QueuedSale"

const adapter = new SQLiteAdapter({
  schema,
  dbName: "pharmatrack",
  jsi: true,
})

export const database = new Database({
  adapter,
  modelClasses: [Product, QueuedSale],
})
