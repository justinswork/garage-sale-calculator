// Pleasant tailwind palette for hosts. Stable per host index.
const HOST_PALETTE = [
  { bg: 'bg-emerald-100', text: 'text-emerald-800', dot: 'bg-emerald-500', border: 'border-emerald-200' },
  { bg: 'bg-sky-100', text: 'text-sky-800', dot: 'bg-sky-500', border: 'border-sky-200' },
  { bg: 'bg-violet-100', text: 'text-violet-800', dot: 'bg-violet-500', border: 'border-violet-200' },
  { bg: 'bg-amber-100', text: 'text-amber-800', dot: 'bg-amber-500', border: 'border-amber-200' },
  { bg: 'bg-rose-100', text: 'text-rose-800', dot: 'bg-rose-500', border: 'border-rose-200' },
  { bg: 'bg-cyan-100', text: 'text-cyan-800', dot: 'bg-cyan-500', border: 'border-cyan-200' },
  { bg: 'bg-indigo-100', text: 'text-indigo-800', dot: 'bg-indigo-500', border: 'border-indigo-200' },
  { bg: 'bg-fuchsia-100', text: 'text-fuchsia-800', dot: 'bg-fuchsia-500', border: 'border-fuchsia-200' },
  { bg: 'bg-teal-100', text: 'text-teal-800', dot: 'bg-teal-500', border: 'border-teal-200' },
  { bg: 'bg-orange-100', text: 'text-orange-800', dot: 'bg-orange-500', border: 'border-orange-200' }
];

const FALLBACK = { bg: 'bg-slate-100', text: 'text-slate-700', dot: 'bg-slate-400', border: 'border-slate-200' };

export function hostColor(hostId, hosts) {
  const idx = hosts.findIndex((h) => h.id === hostId);
  if (idx < 0) return FALLBACK;
  return HOST_PALETTE[idx % HOST_PALETTE.length];
}

// Payment method colors. Used for sale-row indicator + chips.
export const PAYMENT_COLORS = {
  cash: { bg: 'bg-emerald-100', text: 'text-emerald-700', icon: 'text-emerald-700', label: 'Cash' },
  digital: { bg: 'bg-sky-100', text: 'text-sky-700', icon: 'text-sky-700', label: 'Venmo' },
  split: { bg: 'bg-amber-100', text: 'text-amber-700', icon: 'text-amber-700', label: 'Split' }
};

export function paymentColor(method) {
  return PAYMENT_COLORS[method] || PAYMENT_COLORS.cash;
}
