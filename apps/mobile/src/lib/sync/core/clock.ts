// Clock-tamper guard (R1 rule 4). The daily deadline is only meaningful if the
// phone's clock can't simply be wound back to "yesterday evening". We keep:
//  - the server time + device time at the last successful sync (an anchor),
//  - a monotonic "last seen device time", bumped every minute while running
//    and persisted, so a change made while the app was closed is caught too.
// Device time going backwards by more than 5 minutes locks selling until the
// next successful sync re-anchors everything. Forward jumps only make the
// deadline arrive sooner, which is safe, so they are not flagged.

export const CLOCK_BACKWARD_TOLERANCE_MS = 5 * 60_000

export interface ClockAnchors {
  /** server_time (epoch ms) of the last successful pull */
  lastServerTime: number | null
  /** device time (epoch ms) when that server_time was received */
  lastDeviceTimeAtSync: number | null
  /** highest device time ever observed */
  lastSeenDeviceTime: number | null
  /** sticky until the next successful sync */
  tampered: boolean
}

export const EMPTY_ANCHORS: ClockAnchors = {
  lastServerTime: null,
  lastDeviceTimeAtSync: null,
  lastSeenDeviceTime: null,
  tampered: false,
}

/** Record a device-time observation; flags tamper on a backwards jump. */
export function observeClock(a: ClockAnchors, now: number): ClockAnchors {
  const last = a.lastSeenDeviceTime
  const wentBack = last != null && now < last - CLOCK_BACKWARD_TOLERANCE_MS
  return {
    ...a,
    tampered: a.tampered || wentBack,
    lastSeenDeviceTime: last == null ? now : Math.max(last, now),
  }
}

/** Fresh anchors after a successful sync — clears any tamper flag. */
export function anchorsAfterSync(serverTime: number, deviceNow: number): ClockAnchors {
  return {
    lastServerTime: serverTime,
    lastDeviceTimeAtSync: deviceNow,
    lastSeenDeviceTime: deviceNow,
    tampered: false,
  }
}

/**
 * Best estimate of server "now": the last server time plus device time
 * elapsed since. Immune to a phone that was simply set to the wrong time
 * before syncing (constant skew). Falls back to device time with no anchor.
 */
export function trustedNow(a: ClockAnchors, deviceNow: number): number {
  if (a.lastServerTime == null || a.lastDeviceTimeAtSync == null) return deviceNow
  return a.lastServerTime + (deviceNow - a.lastDeviceTimeAtSync)
}
