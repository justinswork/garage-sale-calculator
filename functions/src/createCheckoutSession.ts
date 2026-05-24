import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import type Stripe from 'stripe';
import {
  stripeClient,
  stripeSecretKey,
  UNLOCK_PRICE_CENTS,
} from './stripe';

// Reads /config/promo. Returns the Stripe coupon ID to apply, or null if
// no promo is currently active. Same checks as the client's resolveActivePromo
// helper, but with the admin SDK and Timestamp type.
async function getActivePromoCouponId(
  db: FirebaseFirestore.Firestore
): Promise<string | null> {
  const snap = await db.collection('config').doc('promo').get();
  if (!snap.exists) return null;
  const data = snap.data() as {
    active?: boolean;
    couponId?: string;
    endsAt?: Timestamp;
  } | undefined;
  if (!data?.active) return null;
  if (typeof data.couponId !== 'string' || data.couponId.length === 0) return null;
  if (data.endsAt && data.endsAt.toMillis() < Date.now()) return null;
  return data.couponId;
}

// Callable function: client → returns a Stripe Checkout URL to redirect to.
//
// The client supplies the eventId they want to upgrade plus the success and
// cancel return URLs (taken from window.location.origin so the function
// works regardless of which domain the app is being served from). We verify
// the event exists and isn't already paid before creating the session.
export const createCheckoutSession = onCall(
  { secrets: [stripeSecretKey] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Sign in required.');
    }
    const { eventId, returnOrigin } = request.data as {
      eventId?: string;
      returnOrigin?: string;
    };
    if (!eventId || typeof eventId !== 'string') {
      throw new HttpsError('invalid-argument', 'eventId is required.');
    }
    if (!returnOrigin || typeof returnOrigin !== 'string') {
      throw new HttpsError('invalid-argument', 'returnOrigin is required.');
    }
    // Tight allow-list of return origins. Anything else is rejected so an
    // attacker can't trick the function into minting a Checkout session that
    // redirects to a phishing domain.
    const allowedOrigins = [
      'https://garagesalecalculator.com',
      'https://www.garagesalecalculator.com',
      'https://garage-sale-calculator.web.app',
      'https://garage-sale-calculator.firebaseapp.com',
      'http://localhost:5173',
    ];
    if (!allowedOrigins.includes(returnOrigin)) {
      throw new HttpsError('invalid-argument', 'Return origin not allowed.');
    }

    const db = getFirestore();
    const eventRef = db.collection('events').doc(eventId);
    const eventSnap = await eventRef.get();
    if (!eventSnap.exists) {
      throw new HttpsError('not-found', 'Event does not exist.');
    }
    const eventData = eventSnap.data() as { purchased?: boolean; name?: string };
    if (eventData.purchased) {
      throw new HttpsError('failed-precondition', 'Event is already unlocked.');
    }

    const promoCouponId = await getActivePromoCouponId(db);

    const params: Stripe.Checkout.SessionCreateParams = {
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount: UNLOCK_PRICE_CENTS,
            product_data: {
              name: 'Unlimited transactions',
              description: `Unlock unlimited transactions for "${eventData.name || 'your event'}".`,
            },
          },
          quantity: 1,
        },
      ],
      // The fulfillment side reads this on the webhook to know which event
      // doc to flip purchased=true on.
      metadata: {
        eventId,
        buyerUid: request.auth.uid,
      },
      // ?upgraded=1 is a hint to the client that the user just paid — used
      // to show a success toast on return. Source of truth is the
      // purchased flag flipped by the webhook, not this query param.
      success_url: `${returnOrigin}/e/${eventId}?upgraded=1`,
      cancel_url: `${returnOrigin}/e/${eventId}`,
    };
    // Stripe forbids `discounts` and `allow_promotion_codes` together — must
    // pick one. Sitewide promo wins: auto-apply the coupon and skip the
    // user-code entry link. When no promo is active, surface the link so
    // friends-and-family codes still work.
    if (promoCouponId) {
      params.discounts = [{ coupon: promoCouponId }];
    } else {
      params.allow_promotion_codes = true;
    }

    const stripe = stripeClient();
    const session = await stripe.checkout.sessions.create(params);

    if (!session.url) {
      throw new HttpsError('internal', 'Stripe did not return a checkout URL.');
    }
    return { url: session.url };
  }
);
