import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase.js';
import { UNLOCK_PRICE_CENTS } from './billing.js';

// Sitewide promo config. When `active` is true, every event upgrade
// automatically applies the named Stripe coupon to the Checkout session
// (no user-entered code required). Toggle promos on/off entirely from the
// Firebase Console — no redeploy needed.
//
// Doc path: /config/promo
//   active:     boolean      // master switch
//   couponId:   string       // Stripe coupon ID (cpn_xxx) — apply this
//   percentOff: number       // 0-100, display only ("50" → "50% off")
//   label:      string       // banner copy ("Holiday sale", "Black Friday")
//   endsAt:     Timestamp?   // optional cutoff; promo auto-expires past this
//
// IMPORTANT: percentOff is display-only. The actual discount comes from
// whatever the Stripe coupon is configured for. Keep them in sync when
// you create the coupon, or the displayed savings won't match the charge.

export function watchPromo(cb) {
  return onSnapshot(
    doc(db, 'config', 'promo'),
    (snap) => cb(snap.exists() ? resolveActivePromo(snap.data()) : null),
    () => cb(null)
  );
}

// Returns the promo info if it's active and within its window, otherwise
// null. Centralized so client + server logic stay in sync (the function
// performs the same checks independently with the admin SDK).
function resolveActivePromo(data) {
  if (!data?.active) return null;
  if (typeof data.couponId !== 'string' || data.couponId.length === 0) return null;
  const endsAtMs = data.endsAt?.toMillis?.();
  if (endsAtMs && endsAtMs < Date.now()) return null;
  return {
    couponId: data.couponId,
    percentOff: Number(data.percentOff) || 0,
    label: data.label || 'Sale',
    endsAt: data.endsAt || null
  };
}

// Discounted price in cents given an active promo. Falls back to the
// full sticker price when no promo is active.
export function effectiveUnlockPriceCents(promo) {
  if (!promo || !promo.percentOff) return UNLOCK_PRICE_CENTS;
  const off = Math.max(0, Math.min(100, promo.percentOff));
  return Math.round(UNLOCK_PRICE_CENTS * (1 - off / 100));
}
