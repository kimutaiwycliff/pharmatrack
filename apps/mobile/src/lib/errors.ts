// One place that turns a failure into a sentence a cashier can act on.
// Pure (no React Native imports) so it's unit-tested in lib/__tests__.
//
// Rules: the server's own `{ error }` text is written for people (Zod's first
// issue, or a sentence like "Not enough stock"), so it's shown for 4xx answers
// where it says what to fix. Everything else — HTTP codes, "Network request
// failed", SQLite constraint text, developer messages — becomes a plain
// message; the original is still logged by the caller / crash reporting.

export const NETWORK_ERROR = "Could not reach the server. Check your internet connection and try again."
export const TIMEOUT_ERROR = "The server is taking too long to answer. Check your connection and try again."
export const SESSION_EXPIRED = "Your session has expired. Please sign in again."
export const NO_PERMISSION = "You don't have permission to do this. Ask the owner or a manager."
export const SERVER_ERROR = "The server ran into a problem. Please try again in a moment."
export const GENERIC_ERROR = "Something went wrong. Please try again."
export const LOCAL_ERROR = "Something went wrong on this phone. Please try again — if it keeps happening, restart the app."

/** Message for a non-OK HTTP answer, preferring the server's own text where it's meant for people. */
export function httpMessage(status: number, serverText?: string | null): string {
  const text = typeof serverText === "string" ? serverText.trim() : ""
  const human = text !== "" && looksHuman(text) && !/^(unauthori[sz]ed|forbidden|not found|bad request|internal server error)\.?$/i.test(text)
  if (status === 401) return human ? text : SESSION_EXPIRED
  if (status === 403) return human ? text : NO_PERMISSION
  if (status === 404) return human ? text : "That item no longer exists. Go back and refresh."
  if (status === 408 || status === 504) return TIMEOUT_ERROR
  if (status === 429) return "Too many attempts. Wait a minute and try again."
  if (status >= 500) return SERVER_ERROR
  return human ? text : GENERIC_ERROR
}

/** Errors created by our own code with a message already written for people. */
export class UserFacingError extends Error {
  readonly userFacing = true
}

/** Thrown when a request runs past its time limit. */
export class TimeoutError extends Error {
  constructor(message = TIMEOUT_ERROR) {
    super(message)
    this.name = "TimeoutError"
  }
}

interface WithStatus {
  status: number
  message: string
}

function hasStatus(err: unknown): err is WithStatus {
  return typeof err === "object" && err !== null && typeof (err as { status?: unknown }).status === "number"
}

const NETWORKY = /network request failed|failed to fetch|aborted|network error|could not reach/i
const LOCAL = /sqlite|constraint failed|no such (table|column)|database is locked/i

/**
 * Message to show for anything thrown. Known error types (ApiError,
 * SyncHttpError, NetworkError, TimeoutError, UserFacingError) keep their
 * readable text; anything else — a bug, a SQLite error — gets a plain sentence.
 */
export function userMessage(err: unknown, fallback = GENERIC_ERROR): string {
  if (err instanceof UserFacingError) return err.message
  if (err instanceof Error && err.name === "TimeoutError") return TIMEOUT_ERROR
  if (err instanceof Error && err.name === "NetworkError") return err.message === TIMEOUT_ERROR ? TIMEOUT_ERROR : NETWORK_ERROR
  if (hasStatus(err)) {
    const msg = typeof err.message === "string" ? err.message.trim() : ""
    if (err.status === 0) return msg && looksHuman(msg) && !NETWORKY.test(msg) ? msg : NETWORK_ERROR
    return httpMessage(err.status, msg)
  }
  if (err instanceof Error && NETWORKY.test(err.message)) return NETWORK_ERROR
  if (err instanceof Error && LOCAL.test(err.message)) return LOCAL_ERROR
  if (typeof err === "string" && err.trim() && looksHuman(err.trim())) return err.trim()
  return fallback
}

/** True when `err` is a connectivity problem (worth "try again when online"). */
export function isNetworkProblem(err: unknown): boolean {
  if (err instanceof Error && (err.name === "NetworkError" || err.name === "TimeoutError")) return true
  if (hasStatus(err) && err.status === 0) return true
  return err instanceof Error && NETWORKY.test(err.message)
}

/** Rejects with a TimeoutError if `promise` hasn't settled within `ms`. */
export function withTimeout<T>(promise: Promise<T>, ms: number, onTimeout?: () => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      onTimeout?.()
      reject(new TimeoutError())
    }, ms)
    promise.then(
      (v) => {
        clearTimeout(timer)
        resolve(v)
      },
      (e: unknown) => {
        clearTimeout(timer)
        reject(e)
      },
    )
  })
}

// Developer-ish text: bare HTTP codes, JSON, exception names, API paths.
function looksHuman(text: string): boolean {
  if (text.length > 240) return false
  if (/^HTTP \d{3}$/i.test(text)) return false
  if (/^\W*[[{]/.test(text)) return false
  if (/\b(TypeError|ReferenceError|SyntaxError|undefined is not|null is not|Cannot read propert|SQLITE_|ECONN|ENOTFOUND)/i.test(text)) return false
  if (/apiFetch\(|\/api\//.test(text)) return false
  if (LOCAL.test(text)) return false
  return true
}
