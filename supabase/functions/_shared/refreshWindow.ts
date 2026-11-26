// refresh-all-tokens: how many days ahead of expiry a token is refreshed.
//
// The default is deliberately much wider than the publisher's 7 days: at one run per day it gives ~3 weeks of
// retries before a token actually expires. A caller (a manual check with the cron secret) may pass its own
// window in the body, but never past MAX_WITHIN_DAYS: a huge window refreshed every token on every call
// (security review #48). Pinterest access tokens last 30 days.

export const DEFAULT_WITHIN_DAYS = 20;
export const MAX_WITHIN_DAYS = 30;

export function clampWithinDays(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_WITHIN_DAYS;
  return Math.min(MAX_WITHIN_DAYS, Math.max(1, Math.floor(value)));
}
