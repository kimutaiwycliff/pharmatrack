import { describe, expect, it } from "vitest"
import { topSellers } from "../topSellers"

describe("topSellers", () => {
  it("ranks by number of sales, then units sold", () => {
    const sales = [
      { items: [{ product_id: "a", quantity: 1 }, { product_id: "b", quantity: 10 }] },
      { items: [{ product_id: "a", quantity: 2 }] },
      { items: [{ product_id: "c", quantity: 1 }, { product_id: "b", quantity: 1 }] },
      { items: [{ product_id: "d", quantity: 50 }] },
    ]
    expect(topSellers(sales, 3)).toEqual(["b", "a", "d"])
  })
  it("counts a product once per sale even if split over lines", () => {
    const sales = [{ items: [{ product_id: "a", quantity: 1 }, { product_id: "a", quantity: 1 }] }, { items: [{ product_id: "b", quantity: 1 }] }]
    expect(topSellers(sales, 5)).toEqual(["a", "b"])
  })
})
