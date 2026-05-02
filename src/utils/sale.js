// Pure helpers for sale math. All amounts in cents (integer).

// Build a saleId -> sequential number map. Stable: includes deleted sales so
// numbers don't shift when one is removed. Sorted by createdAt ascending.
export function buildSaleNumberMap(sales) {
  const sorted = [...sales].sort((a, b) => {
    const aT = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
    const bT = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
    return aT - bT;
  });
  const map = {};
  sorted.forEach((s, i) => { map[s.id] = i + 1; });
  return map;
}

export function lineSubtotal(item) {
  return Math.round((item.unitPrice || 0) * (item.qty || 0));
}

export function itemsSubtotal(items) {
  return (items || []).reduce((sum, it) => sum + lineSubtotal(it), 0);
}

export function perHostFromItems(items) {
  const map = {};
  for (const it of items || []) {
    if (!it.hostId) continue;
    map[it.hostId] = (map[it.hostId] || 0) + lineSubtotal(it);
  }
  return map;
}

// Allocate a discount (positive cents) across hosts proportional to their pre-discount share.
// Distributes rounding remainder to hosts in descending share order to keep totals exact.
export function proportionalAllocation(perHost, discountCents) {
  const entries = Object.entries(perHost);
  const total = entries.reduce((s, [, v]) => s + v, 0);
  if (total <= 0 || discountCents <= 0) {
    return Object.fromEntries(entries.map(([k, v]) => [k, v]));
  }
  const out = {};
  let allocated = 0;
  const raw = entries.map(([k, v]) => {
    const cut = Math.floor((v * discountCents) / total);
    out[k] = v - cut;
    allocated += cut;
    return [k, v, cut, (v * discountCents) / total - cut];
  });
  let remainder = discountCents - allocated;
  raw.sort((a, b) => b[3] - a[3]);
  for (let i = 0; i < raw.length && remainder > 0; i++) {
    out[raw[i][0]] -= 1;
    remainder--;
  }
  return out;
}

// Returns final per-host totals for a sale, given items, optional override total, and allocation strategy.
// allocation: null (no override applied yet — pending), 'proportional', or { hostId: amountCents } as final per-host totals.
export function resolvePerHost(items, overrideTotal, allocation) {
  const fromItems = perHostFromItems(items);
  if (overrideTotal == null) return fromItems;
  const subtotal = itemsSubtotal(items);
  const discount = subtotal - overrideTotal;
  if (discount === 0) return fromItems;
  if (discount < 0) {
    // override above subtotal — treat as a tip, distribute proportionally
    const tip = -discount;
    const total = Object.values(fromItems).reduce((s, v) => s + v, 0);
    if (total <= 0) return fromItems;
    const out = {};
    let added = 0;
    const raw = Object.entries(fromItems).map(([k, v]) => {
      const add = Math.floor((v * tip) / total);
      out[k] = v + add;
      added += add;
      return [k, (v * tip) / total - add];
    });
    let remainder = tip - added;
    raw.sort((a, b) => b[1] - a[1]);
    for (let i = 0; i < raw.length && remainder > 0; i++) {
      out[raw[i][0]] += 1;
      remainder--;
    }
    return out;
  }
  if (allocation === 'proportional') {
    return proportionalAllocation(fromItems, discount);
  }
  if (allocation && typeof allocation === 'object') {
    return { ...allocation };
  }
  return null; // pending
}

export function isPending(sale) {
  return sale.overrideTotal != null && sale.discountAllocation == null && sale.overrideTotal !== itemsSubtotal(sale.items);
}

export function effectiveTotal(sale) {
  if (sale.overrideTotal != null) return sale.overrideTotal;
  return itemsSubtotal(sale.items);
}

// How much of this sale's money went into the shared cash pot.
export function getCashAmount(sale) {
  if (sale.cashAmount != null) return sale.cashAmount;
  // legacy fallback for sales without the field
  if (sale.paymentMethod === 'digital') return 0;
  return effectiveTotal(sale);
}

// How much of this sale's money went via a digital payment (Venmo etc.).
export function getDigitalAmount(sale) {
  if (sale.digitalAmount != null) return sale.digitalAmount;
  // legacy fallback
  if (sale.paymentMethod === 'digital') return effectiveTotal(sale);
  return 0;
}

// Settle-up calculation. Pure function over a list of sales + hosts.
// Cash sales contribute to the cash pot which is assumed to be divided per
// earnings at end of day (no host-to-host transfer needed). Digital sales create
// imbalances when the recipient earned less than they received. Split sales
// contribute to both, attributing per-host earnings proportionally.
//
// Returns:
//   perHost: per-host aggregate (earned, cashEarned, digitalEarned, digitalReceived)
//   pairwiseDebts: [{ from, to, amount, sales: [{ saleId, share }] }] — what each
//                  digital recipient owes each other host, with contributing sales.
//   totalCash, totalDigital
export function computeSettleUp(sales, hosts) {
  const perHost = Object.fromEntries(hosts.map((h) => [h.id, {
    earned: 0, cashEarned: 0, digitalEarned: 0, digitalReceived: 0
  }]));
  // pairKey "fromHostId|toHostId" -> { from, to, amount, sales }
  const pairs = {};
  let totalCash = 0;
  let totalDigital = 0;

  for (const s of sales) {
    if (s.deletedAt) continue;
    if (s.status === 'draft') continue;
    if (isPending(s)) continue;
    const fromItems = perHostFromItems(s.items);
    const ov = s.overrideTotal;
    const sub = itemsSubtotal(s.items);
    let resolved = fromItems;
    if (ov != null && ov !== sub) {
      if (s.discountAllocation === 'proportional') {
        resolved = proportionalAllocation(fromItems, sub - ov);
      } else if (s.discountAllocation && typeof s.discountAllocation === 'object') {
        resolved = s.discountAllocation;
      } else {
        continue; // pending allocation, skip
      }
    }

    const cashPart = getCashAmount(s);
    const digitalPart = getDigitalAmount(s);
    const total = cashPart + digitalPart;
    totalCash += cashPart;
    totalDigital += digitalPart;
    const recipient = s.digitalRecipientHostId;
    if (digitalPart > 0 && recipient && perHost[recipient]) {
      perHost[recipient].digitalReceived += digitalPart;
    }

    // Compute optimal cash/digital attribution per host. Recipient covers own
    // share from Venmo first, cash pot fills non-recipients first, leftover
    // Venmo creates pairwise debts.
    if (digitalPart > 0 && recipient && perHost[recipient]) {
      const sr = resolved[recipient] || 0;
      const recipientDigitalEarned = Math.min(sr, digitalPart);
      const recipientCashNeeded = sr - recipientDigitalEarned; // taken from cash pot
      const cashForNonRecip = cashPart - recipientCashNeeded;
      const recipientOwes = digitalPart - recipientDigitalEarned;

      let sumNonRec = 0;
      for (const [hid, amt] of Object.entries(resolved)) {
        if (hid !== recipient && amt > 0 && perHost[hid]) sumNonRec += amt;
      }

      // Recipient
      perHost[recipient].earned += sr;
      perHost[recipient].digitalEarned += recipientDigitalEarned;
      perHost[recipient].cashEarned += recipientCashNeeded;

      // Non-recipients: cash pot first, then debt from recipient's leftover
      for (const [hid, amt] of Object.entries(resolved)) {
        if (hid === recipient || !perHost[hid] || amt <= 0) continue;
        perHost[hid].earned += amt;
        const cashCredit = sumNonRec > 0 ? Math.round((amt / sumNonRec) * cashForNonRecip) : 0;
        const digitalCredit = amt - cashCredit;
        perHost[hid].cashEarned += cashCredit;
        perHost[hid].digitalEarned += digitalCredit;
        if (digitalCredit > 0) {
          const key = `${recipient}|${hid}`;
          if (!pairs[key]) pairs[key] = { from: recipient, to: hid, amount: 0, sales: [] };
          pairs[key].amount += digitalCredit;
          pairs[key].sales.push({ saleId: s.id, share: digitalCredit });
        }
      }
    } else {
      // Pure cash sale (or no recipient): everything to cash column.
      for (const [hid, amt] of Object.entries(resolved)) {
        if (!perHost[hid]) continue;
        perHost[hid].earned += amt;
        perHost[hid].cashEarned += amt;
      }
    }
  }

  // Round per-host cash/digital earned to integer cents
  for (const hid of Object.keys(perHost)) {
    perHost[hid].cashEarned = Math.round(perHost[hid].cashEarned);
    perHost[hid].digitalEarned = Math.round(perHost[hid].digitalEarned);
  }

  const pairwiseDebts = Object.values(pairs).filter((p) => p.amount > 0);

  // Net digital position per host: how much they hold over what they earned digitally.
  // Positive net = host owes money. Negative = host is owed.
  for (const hid of Object.keys(perHost)) {
    const p = perHost[hid];
    p.net = p.digitalReceived - p.digitalEarned;
  }

  return { perHost, pairwiseDebts, totalCash, totalDigital };
}

// Per-host share of a single sale, broken into cash and digital portions.
// Uses the same recipient-first / cash-fills-others-first attribution as
// computeSettleUp so HostActivityPage matches the settle-up math.
export function computeHostShare(sale, hostId) {
  if (!sale || !hostId) return { total: 0, cash: 0, digital: 0 };
  const fromItems = perHostFromItems(sale.items);
  const ov = sale.overrideTotal;
  const sub = itemsSubtotal(sale.items);
  let resolved = fromItems;
  if (ov != null && ov !== sub) {
    if (sale.discountAllocation === 'proportional') {
      resolved = proportionalAllocation(fromItems, sub - ov);
    } else if (sale.discountAllocation && typeof sale.discountAllocation === 'object') {
      resolved = sale.discountAllocation;
    } else {
      return { total: fromItems[hostId] || 0, cash: 0, digital: 0, pending: true };
    }
  }
  const share = resolved[hostId] || 0;
  if (share === 0) return { total: 0, cash: 0, digital: 0 };

  const cashPart = getCashAmount(sale);
  const digitalPart = getDigitalAmount(sale);
  const recipient = sale.digitalRecipientHostId;

  if (digitalPart === 0 || !recipient) {
    return { total: share, cash: share, digital: 0 };
  }

  const sr = resolved[recipient] || 0;
  const recipientDigitalEarned = Math.min(sr, digitalPart);
  const recipientCashNeeded = sr - recipientDigitalEarned;
  const cashForNonRecip = cashPart - recipientCashNeeded;

  if (hostId === recipient) {
    return { total: share, cash: recipientCashNeeded, digital: recipientDigitalEarned };
  }

  let sumNonRec = 0;
  for (const [hid, amt] of Object.entries(resolved)) {
    if (hid !== recipient && amt > 0) sumNonRec += amt;
  }
  const cashCredit = sumNonRec > 0 ? Math.round((share / sumNonRec) * cashForNonRecip) : 0;
  return { total: share, cash: cashCredit, digital: share - cashCredit };
}

// What this host actually received in the moment of the sale (vs what they're
// entitled to as their earned share). Differs from computeHostShare for
// digital sales: the recipient gets the FULL digital amount in their account,
// while non-recipients only get their cash share. Settlements then move the
// money around to match earned shares.
export function computeReceivedAtSale(sale, hostId) {
  if (!sale || !hostId) return { cash: 0, digital: 0 };
  const fromItems = perHostFromItems(sale.items);
  const ov = sale.overrideTotal;
  const sub = itemsSubtotal(sale.items);
  let resolved = fromItems;
  if (ov != null && ov !== sub) {
    if (sale.discountAllocation === 'proportional') {
      resolved = proportionalAllocation(fromItems, sub - ov);
    } else if (sale.discountAllocation && typeof sale.discountAllocation === 'object') {
      resolved = sale.discountAllocation;
    } else {
      return { cash: 0, digital: 0, pending: true };
    }
  }
  const share = resolved[hostId] || 0;
  const cashPart = getCashAmount(sale);
  const digitalPart = getDigitalAmount(sale);
  const recipient = sale.digitalRecipientHostId;

  if (digitalPart === 0 || !recipient) {
    // Pure cash: each host gets their full share in cash.
    return { cash: share, digital: 0 };
  }

  if (hostId === recipient) {
    // Recipient pockets the entire Venmo amount, plus any cash needed to
    // complete their share when the recipient earned more than they received.
    const sr = resolved[recipient] || 0;
    const recipientCashNeeded = Math.max(0, sr - digitalPart);
    return { cash: recipientCashNeeded, digital: digitalPart };
  }

  // Non-recipient gets cash share only — the digital owed to them sits in the
  // recipient's account until a settlement.
  if (share === 0) return { cash: 0, digital: 0 };
  const sr = resolved[recipient] || 0;
  const recipientCashNeeded = Math.max(0, sr - digitalPart);
  const cashForNonRecip = cashPart - recipientCashNeeded;
  let sumNonRec = 0;
  for (const [hid, amt] of Object.entries(resolved)) {
    if (hid !== recipient && amt > 0) sumNonRec += amt;
  }
  const cashCredit = sumNonRec > 0 ? Math.round((share / sumNonRec) * cashForNonRecip) : 0;
  return { cash: cashCredit, digital: 0 };
}

// Reduce raw pairwise debts by recorded settlements. Settlements that exceed
// a pair's debt simply zero it out (positive remaining only).
export function applySettlements(pairwiseDebts, settlements) {
  const paid = {};
  for (const s of settlements || []) {
    const k = `${s.from}|${s.to}`;
    paid[k] = (paid[k] || 0) + (s.amount || 0);
  }
  return pairwiseDebts
    .map((d) => {
      const k = `${d.from}|${d.to}`;
      const remaining = Math.max(0, d.amount - (paid[k] || 0));
      return { ...d, originalAmount: d.amount, amount: remaining, paidAmount: paid[k] || 0 };
    })
    .filter((d) => d.amount > 0);
}
