// Launch-window incentive: a longer free trial for signups before the offer
// ends, reverting to the standard trial length afterwards. One place to change
// so marketing copy (Pricing.tsx) and signup/onboarding stay in sync.

export const STANDARD_TRIAL_DAYS = 14
export const LAUNCH_TRIAL_DAYS = 30

// End of day, Africa/Nairobi (UTC+3).
export const LAUNCH_OFFER_ENDS_AT = new Date("2026-09-30T23:59:59+03:00")

export function launchOfferActive(): boolean {
  return Date.now() <= LAUNCH_OFFER_ENDS_AT.getTime()
}

export function trialDaysForSignup(): number {
  return launchOfferActive() ? LAUNCH_TRIAL_DAYS : STANDARD_TRIAL_DAYS
}
