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
