import { useState } from 'react';
import { X, Sparkles, AlertTriangle } from 'lucide-react';
import { startUpgradeCheckout, FREE_SALE_LIMIT } from '../data/billing.js';

// Shown when the user tries to create the 11th transaction on a free event,
// or when they tap the "Unlock" upgrade prompt anywhere. Redirects to a
// hosted Stripe Checkout page on confirm.
export default function UpgradeModal({ eventId, open, onClose }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!open) return null;

  const startCheckout = async () => {
    setBusy(true);
    setError('');
    try {
      const url = await startUpgradeCheckout(eventId);
      // Full redirect — Stripe Checkout takes over the tab.
      window.location.href = url;
    } catch (err) {
      setError(err?.message || 'Could not start checkout.');
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4">
      <div className="card w-full max-w-md p-5 flex flex-col gap-4 relative">
        <button
          onClick={onClose}
          disabled={busy}
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

        <p className="text-[14px] text-muted leading-relaxed">
          You've reached the free limit of {FREE_SALE_LIMIT} transactions on this event.
          Pay <span className="font-semibold text-ink">$5 once</span> to record unlimited
          transactions for the rest of this event.
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

        {error && (
          <div className="flex items-start gap-2 text-red-700 bg-red-50 rounded-xl p-3 text-[12px]">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <button
          onClick={startCheckout}
          disabled={busy}
          className="btn-primary disabled:opacity-50"
        >
          {busy ? 'Opening checkout…' : 'Unlock for $5'}
        </button>

        <button
          onClick={onClose}
          disabled={busy}
          className="text-[13px] text-muted active:opacity-60"
        >
          Not now
        </button>
      </div>
    </div>
  );
}
