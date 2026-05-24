import { useEffect, useState } from 'react';
import { X, Sparkles, AlertTriangle, WifiOff } from 'lucide-react';
import { startUpgradeCheckout, FREE_SALE_LIMIT, UNLOCK_PRICE_CENTS } from '../data/billing.js';
import { watchPromo, effectiveUnlockPriceCents } from '../data/promo.js';
import { formatMoney } from '../utils/money.js';

// Shown when the user tries to create the 11th transaction on a free event,
// or when they tap the "Unlock" upgrade prompt anywhere. Redirects to a
// hosted Stripe Checkout page on confirm.
export default function UpgradeModal({ eventId, open, onClose }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [promo, setPromo] = useState(null);
  // Best-effort detection. `navigator.onLine === true` doesn't *guarantee*
  // we can reach Stripe (could be on a captive portal, slow link, etc.),
  // but `false` is a reliable "definitely not gonna work" signal.
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine
  );

  // Live-listen to /config/promo so the price + banner update the instant
  // an admin flips the promo on or off from the Firebase Console.
  useEffect(() => watchPromo(setPromo), []);
  const effectivePrice = effectiveUnlockPriceCents(promo);

  // Track connectivity changes so the modal flips between "Connect to
  // upgrade" and the live unlock button without the user having to dismiss
  // and reopen.
  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  // When the user clicks "Unlock for $5" we redirect to Stripe Checkout
  // via window.location.href. Safari (and others) often restore the page
  // from the back/forward cache when the user hits cancel on Stripe and
  // navigates back — bringing busy=true along with it and leaving the
  // modal stuck on "Opening checkout…". Detect that case and clear state.
  useEffect(() => {
    const handler = (e) => {
      if (e.persisted) {
        setBusy(false);
        setError('');
      }
    };
    window.addEventListener('pageshow', handler);
    return () => window.removeEventListener('pageshow', handler);
  }, []);

  if (!open) return null;

  const startCheckout = async () => {
    setBusy(true);
    setError('');
    try {
      const url = await startUpgradeCheckout(eventId);
      // Full redirect — Stripe Checkout takes over the tab.
      window.location.href = url;
    } catch (err) {
      // If the device says it's offline, that's by far the most likely
      // reason a callable would fail. Surface a clearer message than the
      // SDK's "internal" / "unavailable". Otherwise show whatever the
      // underlying error says — could be a Stripe-side issue worth seeing.
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        setError('You appear to be offline. Connect to Wi-Fi or cellular and try again.');
      } else {
        setError(err?.message || 'Could not start checkout.');
      }
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4">
      <div className="card w-full max-w-md p-5 flex flex-col gap-4 relative">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-muted active:opacity-60 p-1"
          aria-label="Close"
        >
          <X size={18} />
        </button>

        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-accent/10 text-accent-deep flex items-center justify-center">
            <Sparkles size={18} />
          </div>
          <h2 className="text-[18px] font-bold">Unlock this event</h2>
        </div>

        {promo && (
          <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-xl p-3 text-[13px] flex items-center gap-2">
            <Sparkles size={14} className="text-amber-700 shrink-0" />
            <span>
              <span className="font-semibold">{promo.label}</span> — {promo.percentOff}% off!
            </span>
          </div>
        )}

        <p className="text-[14px] text-muted leading-relaxed">
          You've reached the free limit of {FREE_SALE_LIMIT} transactions on this event.
          Pay {promo ? (
            <>
              <span className="line-through text-muted/70">{formatMoney(UNLOCK_PRICE_CENTS)}</span>{' '}
              <span className="font-semibold text-ink">{formatMoney(effectivePrice)} once</span>
            </>
          ) : (
            <span className="font-semibold text-ink">{formatMoney(UNLOCK_PRICE_CENTS)} once</span>
          )} to record unlimited transactions for the rest of this event.
        </p>

        <ul className="flex flex-col gap-1.5 text-[13px] text-muted">
          <li className="flex items-start gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-accent mt-1.5 shrink-0" />
            <span>Unlimited transactions on this event</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-accent mt-1.5 shrink-0" />
            <span>One-time charge — no subscription</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-accent mt-1.5 shrink-0" />
            <span>All your existing transactions stay editable</span>
          </li>
        </ul>

        {!online && (
          <div className="flex items-start gap-2 text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3 text-[12px]">
            <WifiOff size={14} className="mt-0.5 shrink-0" />
            <span>You're offline. Connect to Wi-Fi or cellular to upgrade.</span>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 text-red-700 bg-red-50 rounded-xl p-3 text-[12px]">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <button
          onClick={startCheckout}
          disabled={busy || !online}
          className="btn-primary disabled:opacity-50"
        >
          {!online ? 'Connect to upgrade'
            : busy ? 'Opening checkout…'
            : `Unlock for ${formatMoney(effectivePrice)}`}
        </button>

        <button
          onClick={onClose}
          className="text-[13px] text-muted active:opacity-60"
        >
          Not now
        </button>
      </div>
    </div>
  );
}
