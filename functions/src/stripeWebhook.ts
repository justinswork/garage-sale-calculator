import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import type Stripe from 'stripe';
import {
  stripeClient,
  stripeSecretKey,
  stripeWebhookSecret,
} from './stripe';

// HTTP function that receives Stripe webhook deliveries. The fulfillment of
// the unlock — flipping purchased=true on the event — happens here, not in
// the client redirect. Stripe Checkout's success URL is just a UX hint; the
// money may or may not have actually settled by the time the user lands
// there. The webhook is the source of truth.
export const stripeWebhook = onRequest(
  {
    secrets: [stripeSecretKey, stripeWebhookSecret],
    // Stripe retries failures aggressively. Allow a couple seconds of
    // headroom before they time us out at their end (10s default).
    timeoutSeconds: 30,
  },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed');
      return;
    }
    const signature = req.headers['stripe-signature'];
    if (typeof signature !== 'string') {
      res.status(400).send('Missing stripe-signature header.');
      return;
    }

    const stripe = stripeClient();
    let event: Stripe.Event;
    try {
      // req.rawBody is the unparsed request body (Buffer). Stripe's
      // signature verification requires the bytes exactly as delivered —
      // any JSON re-serialization would break the HMAC.
      event = stripe.webhooks.constructEvent(
        req.rawBody,
        signature,
        stripeWebhookSecret.value()
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      logger.warn('Webhook signature verification failed', { message });
      res.status(400).send(`Webhook signature verification failed: ${message}`);
      return;
    }

    // Only one event type matters for v1. Acknowledge anything else with a
    // 200 so Stripe doesn't retry it.
    if (event.type !== 'checkout.session.completed') {
      logger.info('Ignoring Stripe event', { type: event.type });
      res.status(200).send();
      return;
    }

    const session = event.data.object as Stripe.Checkout.Session;
    const eventId = session.metadata?.eventId;
    const buyerUid = session.metadata?.buyerUid;
    if (!eventId) {
      logger.error('checkout.session.completed missing eventId metadata', {
        sessionId: session.id,
      });
      // 200 anyway — retrying won't make the metadata appear.
      res.status(200).send();
      return;
    }

    const db = getFirestore();
    const eventRef = db.collection('events').doc(eventId);
    const eventSnap = await eventRef.get();
    if (!eventSnap.exists) {
      logger.error('checkout.session.completed for unknown event', { eventId });
      res.status(200).send();
      return;
    }

    // Already purchased. Two cases to distinguish:
    //   a) Stripe is retrying the same webhook delivery (same session id we
    //      already processed). No new money was charged — just acknowledge.
    //   b) A second user paid concurrently (different session id, same
    //      event). They were charged $5 unnecessarily. Auto-refund so we
    //      never end up holding two payments for one unlock.
    if (eventSnap.data()?.purchased === true) {
      const priorSessionId = eventSnap.data()?.stripeCheckoutSessionId;
      const isSameSession = priorSessionId === session.id;
      if (isSameSession) {
        logger.info('Webhook retry for same session, no-op', {
          eventId,
          sessionId: session.id,
        });
        res.status(200).send();
        return;
      }
      // Different session, same event = concurrent purchase race. Refund.
      if (typeof session.payment_intent === 'string') {
        try {
          await stripe.refunds.create(
            {
              payment_intent: session.payment_intent,
              reason: 'duplicate',
            },
            // Idempotency key tied to the session so retries don't issue
            // multiple refunds for the same duplicate charge.
            { idempotencyKey: `dup-refund-${session.id}` }
          );
          logger.info('Refunded duplicate payment for already-purchased event', {
            eventId,
            duplicateSessionId: session.id,
            originalSessionId: priorSessionId,
          });
          // Audit entry so the host can see the duplicate refund happened.
          await db.collection('events').doc(eventId).collection('audit').add({
            type: 'event.upgrade.refunded',
            summary: 'Duplicate purchase refunded automatically',
            at: FieldValue.serverTimestamp(),
            byUid: session.metadata?.buyerUid || null,
            byHostId: null,
            meta: {
              duplicateSessionId: session.id,
              originalSessionId: priorSessionId,
              amountCents: session.amount_total ?? null,
            },
          });
        } catch (err) {
          logger.error('Auto-refund failed — manual review needed', {
            eventId,
            sessionId: session.id,
            err: err instanceof Error ? err.message : String(err),
          });
        }
      } else {
        logger.warn('Duplicate payment detected but no payment_intent to refund', {
          eventId,
          sessionId: session.id,
        });
      }
      res.status(200).send();
      return;
    }

    await eventRef.update({
      purchased: true,
      purchasedAt: FieldValue.serverTimestamp(),
      purchasedByUid: buyerUid || null,
      stripeCheckoutSessionId: session.id,
    });

    // Audit entry so the host can see when/why their event was unlocked.
    // Mirrors the shape of existing audit entries in src/data/audit.js.
    await db.collection('events').doc(eventId).collection('audit').add({
      type: 'event.upgraded',
      summary: 'Unlocked unlimited transactions',
      at: FieldValue.serverTimestamp(),
      byUid: buyerUid || null,
      byHostId: null,
      meta: {
        amountCents: session.amount_total ?? null,
        currency: session.currency ?? null,
        sessionId: session.id,
      },
    });

    logger.info('Event unlocked via Stripe payment', {
      eventId,
      sessionId: session.id,
      amount: session.amount_total,
    });
    res.status(200).send();
  }
);
