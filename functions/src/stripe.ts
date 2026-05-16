import Stripe from 'stripe';
import { defineSecret } from 'firebase-functions/params';

// Secret params are resolved from Firebase Functions secrets at runtime.
// Set via:   firebase functions:secrets:set STRIPE_SECRET_KEY
//            firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
export const stripeSecretKey = defineSecret('STRIPE_SECRET_KEY');
export const stripeWebhookSecret = defineSecret('STRIPE_WEBHOOK_SECRET');

// One-time unlock price (cents). Charging anything different would require
// either changing this constant + redeploying, or moving pricing to a
// Stripe Price object lookup — for a single SKU the constant is fine.
export const UNLOCK_PRICE_CENTS = 500;

export function stripeClient(): Stripe {
  // No apiVersion specified — the SDK uses the version it was built against,
  // which is pinned by the npm package. Upgrading the SDK is the explicit
  // signal to also test against a newer API version.
  return new Stripe(stripeSecretKey.value());
}
