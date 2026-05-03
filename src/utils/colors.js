// Pleasant tailwind palette for hosts. Stable per host index. The first
// positions are deliberately distinct from PAYMENT_COLORS below (cash =
// emerald, Venmo = sky, split = amber) so a host pill never reads as a
// payment indicator at a glance.
const HOST_PALETTE = [
  { bg: 'bg-rose-100', text: 'text-rose-800', dot: 'bg-rose-500', border: 'border-rose-200' },
  { bg: 'bg-violet-100', text: 'text-violet-800', dot: 'bg-violet-500', border: 'border-violet-200' },
  { bg: 'bg-fuchsia-100', text: 'text-fuchsia-800', dot: 'bg-fuchsia-500', border: 'border-fuchsia-200' },
  { bg: 'bg-indigo-100', text: 'text-indigo-800', dot: 'bg-indigo-500', border: 'border-indigo-200' },
  { bg: 'bg-teal-100', text: 'text-teal-800', dot: 'bg-teal-500', border: 'border-teal-200' },
  { bg: 'bg-cyan-100', text: 'text-cyan-800', dot: 'bg-cyan-500', border: 'border-cyan-200' },
  { bg: 'bg-pink-100', text: 'text-pink-800', dot: 'bg-pink-500', border: 'border-pink-200' },
  { bg: 'bg-orange-100', text: 'text-orange-800', dot: 'bg-orange-500', border: 'border-orange-200' },
  { bg: 'bg-lime-100', text: 'text-lime-800', dot: 'bg-lime-500', border: 'border-lime-200' },
  { bg: 'bg-slate-100', text: 'text-slate-800', dot: 'bg-slate-500', border: 'border-slate-200' }
];

const FALLBACK = { bg: 'bg-slate-100', text: 'text-slate-700', dot: 'bg-slate-400', border: 'border-slate-200' };

export function hostColor(hostId, hosts) {
  const idx = hosts.findIndex((h) => h.id === hostId);
  if (idx < 0) return FALLBACK;
  return HOST_PALETTE[idx % HOST_PALETTE.length];
}

// Payment method colors. Used for sale-row indicator + chips.
// `activeBg`/`activeText`/`activeBorder` are for selected toggle states (the
// SalePage payment-method picker). `bg`/`text`/`icon` are for the lighter
// tinted swatch used in row indicators and the filter dropdown.
export const PAYMENT_COLORS = {
  cash: {
    bg: 'bg-emerald-100', text: 'text-emerald-700', icon: 'text-emerald-700', label: 'Cash',
    activeBg: 'bg-emerald-100', activeText: 'text-emerald-800', activeBorder: 'border-emerald-500'
  },
  digital: {
    bg: 'bg-sky-100', text: 'text-sky-700', icon: 'text-sky-700', label: 'Venmo',
    activeBg: 'bg-sky-100', activeText: 'text-sky-800', activeBorder: 'border-sky-500'
  },
  split: {
    bg: 'bg-amber-100', text: 'text-amber-700', icon: 'text-amber-700', label: 'Split',
    activeBg: 'bg-amber-100', activeText: 'text-amber-800', activeBorder: 'border-amber-500'
  }
};

export function paymentColor(method) {
  return PAYMENT_COLORS[method] || PAYMENT_COLORS.cash;
}
