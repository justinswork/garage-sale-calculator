import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase.js';

// Free tier: an event allows up to FREE_SALE_LIMIT completed/in-progress
// sales (drafts and deleted sales don't count). Once an event is purchased,
// the limit no longer applies. Kept in code (not Firestore) so the value
// can be tuned without touching live data.
export const FREE_SALE_LIMIT = 10;

// Sticker price of the one-time unlock in cents. Must match the value used
// in functions/src/stripe.ts (UNLOCK_PRICE_CENTS) since Stripe creates the
// line item server-side; the client only uses this for display.
export const UNLOCK_PRICE_CENTS = 500;

// Events created before this timestamp predate billing and are exempt from
// the free-tier limit forever. Lets existing users who already have 30+
// transactions on their current sale keep working without hitting a fresh
// paywall mid-event. Adjust the cutoff to "just before deploy" so that any
// new event created after launch is subject to the limit.
const BILLING_LAUNCH_MS = Date.UTC(2026, 4, 17, 0, 0, 0); // 2026-05-17 00:00 UTC

// Sales that count toward the free-tier limit. Drafts and soft-deleted
// sales don't, so a host can freely abandon partial entries without burning
// their quota.
function countsTowardLimit(sale) {
  if (sale.deletedAt) return false;
  if (sale.status === 'draft') return false;
  return true;
}

export function countTowardLimit(sales) {
  return (sales || []).filter(countsTowardLimit).length;
}

// True iff this event was created before billing launched. Such events
// keep their unlimited-transaction behavior forever — no migration to
// Firestore was needed, the check is purely at read time.
export function isGrandfathered(event) {
  const createdMs = event?.createdAt?.toMillis?.() || 0;
  return createdMs > 0 && createdMs < BILLING_LAUNCH_MS;
}

// True iff a new transaction would be blocked on this event right now.
export function isAtFreeLimit({ event, sales }) {
  if (event?.purchased) return false;
  if (isGrandfathered(event)) return false;
  return countTowardLimit(sales) >= FREE_SALE_LIMIT;
}

// Calls the Cloud Function that mints a Stripe Checkout session and
// returns the redirect URL. The caller redirects via window.location.
export async function startUpgradeCheckout(eventId) {
  const call = httpsCallable(functions, 'createCheckoutSession');
  const result = await call({
    eventId,
    returnOrigin: window.location.origin
  });
  const { url } = result.data || {};
  if (!url) throw new Error('Checkout session did not include a URL.');
  return url;
}
