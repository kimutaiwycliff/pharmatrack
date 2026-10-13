import { describe, expect, it, vi } from "vitest"
import {
  GENERIC_ERROR, httpMessage, isNetworkProblem, LOCAL_ERROR, NETWORK_ERROR, NO_PERMISSION, SERVER_ERROR, SESSION_EXPIRED,
  TIMEOUT_ERROR, TimeoutError, UserFacingError, userMessage, withTimeout,
} from "../errors"

class FakeApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

class FakeNetworkError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "NetworkError"
  }
}

describe("httpMessage", () => {
  it("keeps the server's sentence for client errors", () => {
    expect(httpMessage(409, "Only 3 left in stock")).toBe("Only 3 left in stock")
    expect(httpMessage(400, "Phone number is invalid")).toBe("Phone number is invalid")
    expect(httpMessage(401, "Wrong PIN")).toBe("Wrong PIN")
  })

  it("replaces bare status words and codes", () => {
    expect(httpMessage(401, "Unauthorized")).toBe(SESSION_EXPIRED)
    expect(httpMessage(401)).toBe(SESSION_EXPIRED)
    expect(httpMessage(403, "Forbidden")).toBe(NO_PERMISSION)
    expect(httpMessage(422, "HTTP 422")).toBe(GENERIC_ERROR)
    expect(httpMessage(400, '{"issues":[]}')).toBe(GENERIC_ERROR)
  })

  it("never shows server internals for 5xx", () => {
    expect(httpMessage(500, 'relation "sale" does not exist')).toBe(SERVER_ERROR)
    expect(httpMessage(502)).toBe(SERVER_ERROR)
    expect(httpMessage(504)).toBe(TIMEOUT_ERROR)
  })
})

describe("userMessage", () => {
  it("passes readable API messages through", () => {
    expect(userMessage(new FakeApiError(409, "This receipt was already recorded"))).toBe("This receipt was already recorded")
  })

  it("maps status 0 and raw network text to the connection message", () => {
    expect(userMessage(new FakeApiError(0, "Network request failed"))).toBe(NETWORK_ERROR)
    expect(userMessage(new TypeError("Network request failed"))).toBe(NETWORK_ERROR)
    expect(userMessage(new FakeNetworkError(NETWORK_ERROR))).toBe(NETWORK_ERROR)
    expect(userMessage(new FakeNetworkError(TIMEOUT_ERROR))).toBe(TIMEOUT_ERROR)
    expect(userMessage(new TimeoutError())).toBe(TIMEOUT_ERROR)
  })

  it("hides database and programming errors", () => {
    expect(userMessage(new Error("UNIQUE constraint failed: sales.id"))).toBe(LOCAL_ERROR)
    expect(userMessage(new TypeError("Cannot read property 'id' of undefined"))).toBe(GENERIC_ERROR)
    expect(userMessage(null)).toBe(GENERIC_ERROR)
    expect(userMessage(undefined, "Could not save the product.")).toBe("Could not save the product.")
  })

  it("trusts errors written for people", () => {
    expect(userMessage(new UserFacingError("Open a shift before selling."))).toBe("Open a shift before selling.")
  })
})

describe("isNetworkProblem", () => {
  it("recognises connectivity failures only", () => {
    expect(isNetworkProblem(new FakeApiError(0, NETWORK_ERROR))).toBe(true)
    expect(isNetworkProblem(new TimeoutError())).toBe(true)
    expect(isNetworkProblem(new FakeNetworkError("x"))).toBe(true)
    expect(isNetworkProblem(new FakeApiError(409, "Conflict"))).toBe(false)
    expect(isNetworkProblem(new Error("boom"))).toBe(false)
  })
})

describe("withTimeout", () => {
  it("rejects with a TimeoutError when the promise is too slow", async () => {
    vi.useFakeTimers()
    const onTimeout = vi.fn()
    const p = withTimeout(new Promise(() => {}), 1000, onTimeout)
    vi.advanceTimersByTime(1000)
    await expect(p).rejects.toBeInstanceOf(TimeoutError)
    expect(onTimeout).toHaveBeenCalledOnce()
    vi.useRealTimers()
  })

  it("resolves normally when in time", async () => {
    await expect(withTimeout(Promise.resolve(5), 1000)).resolves.toBe(5)
  })
})
