export function formatMoney(cents) {
  if (cents == null || isNaN(cents)) return '$0.00';
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}$${(abs / 100).toFixed(2)}`;
}

// Strip everything except digits and a single decimal point. Leaves the user's
// in-progress text alone (no auto-formatting) so they can keep typing.
export function sanitizeMoneyInput(input) {
  if (input == null) return '';
  let s = String(input).replace(/[^0-9.]/g, '');
  const dotIdx = s.indexOf('.');
  if (dotIdx >= 0) {
    s = s.slice(0, dotIdx + 1) + s.slice(dotIdx + 1).replace(/\./g, '');
  }
  return s;
}

export function parseMoney(input) {
  if (input == null) return null;
  const s = String(input).trim().replace(/[$,\s]/g, '');
  if (!s) return null;
  const n = Number(s);
  if (!isFinite(n)) return null;
  return Math.round(n * 100);
}

// US bill denominations a customer is likely to hand over.
const CASH_BILLS_CENTS = [100, 500, 1000, 2000, 5000, 10000];

// Suggest quick-fill cash amounts for an order total. Always returns the exact
// total first, then up to 2 standard bill denominations above it. The second
// bill is only included if it's within 4× the total — keeps a $10 order from
// suggesting $50, while still letting a $1 order suggest $5.
export function suggestCashAmounts(totalCents) {
  if (totalCents == null || totalCents <= 0) return [];
  const result = [totalCents];
  let added = 0;
  for (const cents of CASH_BILLS_CENTS) {
    if (cents <= totalCents) continue;
    if (added > 0 && cents > totalCents * 4) break;
    result.push(cents);
    added++;
    if (added >= 2) break;
  }
  return result;
}
