// Small visualisations for splitting a money figure into cash vs digital
// (Venmo) portions. Used on the event home page (overall + per day) and on
// the host activity page (per host).
//
// Colors match the rest of the app's payment-method palette: emerald-700 for
// cash and sky-700 for Venmo (same shades used for paymentColor(method).icon
// and the sale-row indicators, so the donut/bar read as "cash" and "Venmo"
// at a glance).

// emerald-700 / sky-700 in raw RGB so they can live inside a conic-gradient
// (Tailwind class-based colors can't be interpolated into inline styles).
const CASH_RGB = 'rgb(4 120 87)';
const DIGITAL_RGB = 'rgb(3 105 161)';

// Two-slice donut showing cash vs digital proportion. Hidden when there's
// no money at all (an empty ring is meaningless), but renders even in 100/0
// splits so the visual is consistent across events with different payment
// mixes — a fully-green or fully-blue ring still communicates "all of it
// was paid this way" at a glance.
export function CashVsDigitalPie({ cash, digital, size = 56 }) {
  const total = cash + digital;
  if (total <= 0) return null;
  const cashPct = Math.round((cash / total) * 1000) / 10;
  // Inner hole sized at ~58% of the outer diameter — enough whitespace to
  // read as a donut without making the slices too thin to compare.
  const holePct = 58;
  return (
    <div
      role="img"
      aria-label={`${Math.round(cashPct)}% cash, ${100 - Math.round(cashPct)}% Venmo`}
      className="shrink-0 relative"
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: `conic-gradient(${CASH_RGB} 0 ${cashPct}%, ${DIGITAL_RGB} ${cashPct}% 100%)`
      }}
    >
      <div
        className="absolute bg-white rounded-full"
        style={{
          top: `${(100 - holePct) / 2}%`,
          left: `${(100 - holePct) / 2}%`,
          width: `${holePct}%`,
          height: `${holePct}%`
        }}
      />
    </div>
  );
}

// Thin two-segment horizontal bar showing the cash/digital split. Hidden
// when one side is zero — the day's color legend already communicates that.
export function CashVsDigitalBar({ cash, digital, className = '' }) {
  const total = cash + digital;
  if (total <= 0 || cash === 0 || digital === 0) return null;
  const cashPct = (cash / total) * 100;
  return (
    <div className={`h-1 w-full rounded-full overflow-hidden flex bg-canvas ${className}`}>
      <div className="bg-emerald-700" style={{ width: `${cashPct}%` }} />
      <div className="bg-sky-700" style={{ width: `${100 - cashPct}%` }} />
    </div>
  );
}
