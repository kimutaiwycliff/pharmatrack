import { Model } from "@nozbe/watermelondb"
import { field, text } from "@nozbe/watermelondb/decorators"

export type QueuedSaleStatus = "pending" | "synced" | "rejected"

export default class QueuedSale extends Model {
  static table = "queued_sales"

  @text("offline_reference") offlineReference!: string
  @text("branch_id") branchId!: string
  @text("payload") payload!: string
  @text("status") status!: QueuedSaleStatus
  @text("server_response") serverResponse!: string | null
  @text("error_message") errorMessage!: string | null
  @field("created_at") createdAt!: number
}
