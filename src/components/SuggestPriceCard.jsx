import { useState } from 'react';
import { Camera, X, AlertTriangle, Sparkles } from 'lucide-react';
import { formatMoney } from '../utils/money.js';

// One card that renders the loading / error / result states of the
// photo-to-price flow. The parent owns `state`; this component is
// presentation only.
//
// state shapes:
//   { kind: 'loading' }
//   { kind: 'error',  message }
//   { kind: 'result', data }
//     data: SuggestPriceResponse — see functions/src/types.ts
//
// Callbacks:
//   onRetake()  — user wants to price another item (or retry after error)
//   onDismiss() — user is done / cancelled

export default function SuggestPriceCard({ state, onRetake, onDismiss }) {
  if (!state) return null;

  if (state.kind === 'loading') {
    return (
      <section className="card p-5 flex flex-col items-center gap-3">
        <div className="w-6 h-6 rounded-full border-2 border-hairline border-t-accent animate-spin" />
        <div className="text-[14px] text-muted">Identifying item and finding comps…</div>
        <button
          type="button"
          onClick={onDismiss}
          className="text-[13px] text-muted underline underline-offset-2 mt-1"
        >
          Cancel
        </button>
      </section>
    );
  }

  if (state.kind === 'error') {
    return (
      <section className="card p-5 flex flex-col gap-3">
        <div className="flex items-start gap-2 text-[14px]">
          <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold text-ink">Couldn't suggest a price.</div>
            <div className="text-muted">{state.message}</div>
          </div>
        </div>
        <div className="flex gap-2 mt-1">
          <button
            type="button"
            onClick={onRetake}
            className="btn-secondary flex-1 flex items-center justify-center gap-2 py-2.5"
          >
            <Camera size={18} /> Try again
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-2xl px-5 py-2.5 text-[14px] text-muted"
          >
            Cancel
          </button>
        </div>
      </section>
    );
  }

  return <ResultView data={state.data} onRetake={onRetake} onDismiss={onDismiss} />;
}

function ResultView({ data, onRetake, onDismiss }) {
  const { identified, comps, priceSuggestion } = data;
  const [compsOpen, setCompsOpen] = useState(false);
  const priceCents = (priceSuggestion?.suggestedPrice ?? 0) * 100;
  const hasRange =
    priceSuggestion.priceLow !== priceSuggestion.suggestedPrice ||
    priceSuggestion.priceHigh !== priceSuggestion.suggestedPrice;

  const usedSet = new Set(priceSuggestion.usedCompIds || []);
  const sortedComps = [...comps].sort((a, b) => {
    const ua = usedSet.has(a.id) ? 1 : 0;
    const ub = usedSet.has(b.id) ? 1 : 0;
    if (ua !== ub) return ub - ua;
    return (b.similarity || 0) - (a.similarity || 0);
  });
  const topComps = sortedComps.slice(0, 3);
  const moreComps = sortedComps.slice(3);

  return (
    <section className="card p-5 flex flex-col gap-4">
      {/* header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2 min-w-0">
          <Sparkles size={18} className="text-accent shrink-0 mt-0.5" />
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-wide text-muted">Suggested price</div>
            <div className="text-ink font-semibold text-[15px] truncate">{identified.name || 'Unknown item'}</div>
          </div>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="text-muted shrink-0 -mt-1 -mr-1 p-1"
          aria-label="Dismiss"
        >
          <X size={18} />
        </button>
      </div>

      {/* price */}
      <div className="flex items-baseline justify-between gap-3">
        <div className="text-[40px] font-bold tabular-nums leading-none">{formatMoney(priceCents)}</div>
        {hasRange && (
          <div className="text-[12px] text-muted tabular-nums">
            range ${priceSuggestion.priceLow}–${priceSuggestion.priceHigh}
          </div>
        )}
      </div>

      {/* confidence + identified description */}
      <div className="flex flex-col gap-2 text-[13px]">
        <div className="flex items-center gap-2 flex-wrap">
          <ConfidencePill level={priceSuggestion.confidence} />
          <span className="text-muted">{identified.condition} · {identified.attributes?.category || 'uncategorized'}</span>
        </div>
        {identified.description && (
          <div className="text-muted leading-snug">{identified.description}</div>
        )}
      </div>

      {/* reasoning */}
      {priceSuggestion.reasoning && (
        <div className="bg-accent-soft/60 rounded-xl px-3 py-2 text-[13px] text-ink leading-snug">
          {priceSuggestion.reasoning}
        </div>
      )}

      {/* comps */}
      {comps.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <div className="text-[11px] uppercase tracking-wide text-muted px-1">
            Comparable listings · {comps.length}
          </div>
          {topComps.map((c) => (
            <CompRow key={c.id} comp={c} used={usedSet.has(c.id)} />
          ))}
          {moreComps.length > 0 && (
            <>
              {compsOpen && moreComps.map((c) => (
                <CompRow key={c.id} comp={c} used={usedSet.has(c.id)} />
              ))}
              <button
                type="button"
                onClick={() => setCompsOpen((v) => !v)}
                className="text-[12px] text-muted underline underline-offset-2 self-start mt-1"
              >
                {compsOpen ? 'Show fewer' : `Show ${moreComps.length} more`}
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="text-[12px] text-muted italic px-1">
          No comparable listings found — price is based on the item description alone.
        </div>
      )}

      {/* actions */}
      <div className="pt-1">
        <button
          type="button"
          onClick={onRetake}
          className="btn-primary w-full flex items-center justify-center gap-2"
        >
          <Camera size={18} /> Price another item
        </button>
      </div>
    </section>
  );
}

function ConfidencePill({ level }) {
  const styles = {
    high: 'bg-accent-soft text-accent-deep',
    medium: 'bg-amber-100 text-amber-800',
    low: 'bg-rose-100 text-rose-800'
  }[level] || 'bg-hairline text-muted';
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${styles}`}>
      {level} confidence
    </span>
  );
}

function CompRow({ comp, used }) {
  const dollars = formatMoney(comp.priceCents);
  return (
    <div className={`rounded-xl px-3 py-2 flex items-center gap-3 text-[13px] ${used ? 'bg-accent-soft/40' : 'bg-canvas'}`}>
      <span className="font-semibold tabular-nums shrink-0">{dollars}</span>
      <span className="text-muted truncate flex-1 min-w-0">{comp.title}</span>
      <span className="text-[11px] text-muted shrink-0">
        {comp.priceType === 'asking' ? 'asking' : 'sold'}
      </span>
    </div>
  );
}
