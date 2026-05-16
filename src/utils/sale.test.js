import { describe, it, expect } from 'vitest';
import {
  buildSaleNumberMap,
  lineSubtotal,
  itemsSubtotal,
  perHostFromItems,
  proportionalAllocation,
  resolvePerHost,
  isPending,
  effectiveTotal,
  getCashAmount,
  getDigitalAmount,
  computeSettleUp,
  computeHostShare,
  computeReceivedAtSale,
  applySettlements,
  applyDailyCashCarryover
} from './sale.js';

// ─── Test helpers ───────────────────────────────────────────────────

const ts = (millis) => ({ toMillis: () => millis });

function mkSale(overrides = {}) {
  return {
    id: 'sale-1',
    status: 'completed',
    items: [],
    itemsSubtotal: 0,
    overrideTotal: null,
    discountAllocation: null,
    cashReceived: null,
    changeGiven: null,
    cashAmount: null,
    digitalAmount: null,
    paymentMethod: 'cash',
    digitalRecipientHostId: null,
    notes: '',
    deletedAt: null,
    deletedBy: null,
    enteredByHostId: 'h-justin',
    enteredByUid: 'u-1',
    createdAt: ts(1_000),
    completedAt: ts(1_000),
    ...overrides
  };
}

function mkItem(name, hostId, qty, unitPrice) {
  return { id: `it-${name}`, name, hostId, qty, unitPrice, saveForQuickAdd: false };
}

const HOSTS = [
  { id: 'h-justin', name: 'Justin' },
  { id: 'h-rachel', name: 'Rachel' },
  { id: 'h-carol', name: 'Carol' }
];

// ─── lineSubtotal / itemsSubtotal ──────────────────────────────────

describe('lineSubtotal', () => {
  it('multiplies qty by unitPrice', () => {
    expect(lineSubtotal({ qty: 1, unitPrice: 500 })).toBe(500);
    expect(lineSubtotal({ qty: 5, unitPrice: 100 })).toBe(500);
    expect(lineSubtotal({ qty: 3, unitPrice: 199 })).toBe(597);
  });
  it('handles missing/zero values gracefully', () => {
    expect(lineSubtotal({})).toBe(0);
    expect(lineSubtotal({ qty: 0, unitPrice: 500 })).toBe(0);
    expect(lineSubtotal({ qty: 5 })).toBe(0);
  });
});

describe('itemsSubtotal', () => {
  it('sums all line subtotals', () => {
    expect(itemsSubtotal([
      { qty: 2, unitPrice: 500 },
      { qty: 1, unitPrice: 250 }
    ])).toBe(1250);
  });
  it('returns 0 for empty / nullish', () => {
    expect(itemsSubtotal([])).toBe(0);
    expect(itemsSubtotal(undefined)).toBe(0);
  });
});

// ─── perHostFromItems ──────────────────────────────────────────────

describe('perHostFromItems', () => {
  it('groups item value by host', () => {
    const items = [
      mkItem('Lego', 'h-justin', 1, 1000),
      mkItem('Shirt', 'h-rachel', 1, 500),
      mkItem('Books', 'h-justin', 5, 100)
    ];
    expect(perHostFromItems(items)).toEqual({ 'h-justin': 1500, 'h-rachel': 500 });
  });
  it('skips items without a hostId', () => {
    const items = [
      mkItem('Lego', null, 1, 1000),
      mkItem('Shirt', 'h-rachel', 1, 500)
    ];
    expect(perHostFromItems(items)).toEqual({ 'h-rachel': 500 });
  });
});

// ─── proportionalAllocation ────────────────────────────────────────

describe('proportionalAllocation', () => {
  it('returns input unchanged when no discount', () => {
    expect(proportionalAllocation({ a: 600, b: 400 }, 0)).toEqual({ a: 600, b: 400 });
  });
  it('splits discount proportionally', () => {
    // $10 discount on $50 (split a=$30, b=$20). Each loses 20%.
    const out = proportionalAllocation({ a: 3000, b: 2000 }, 1000);
    expect(out.a).toBe(2400); // -600
    expect(out.b).toBe(1600); // -400
    expect(out.a + out.b).toBe(4000);
  });
  it('handles rounding so totals are exact', () => {
    // $7 discount on $15 (a=$10, b=$5) → a loses 4.667, b loses 2.333
    // Sum must be exactly $8 final = $15 - $7
    const out = proportionalAllocation({ a: 1000, b: 500 }, 700);
    expect(out.a + out.b).toBe(800);
  });
  it('handles single host', () => {
    expect(proportionalAllocation({ a: 1000 }, 200)).toEqual({ a: 800 });
  });
  it('returns shares unchanged when total is zero', () => {
    expect(proportionalAllocation({ a: 0, b: 0 }, 100)).toEqual({ a: 0, b: 0 });
  });
});

// ─── resolvePerHost ────────────────────────────────────────────────

describe('resolvePerHost', () => {
  const items = [
    mkItem('Lego', 'h-justin', 1, 1000),
    mkItem('Shirt', 'h-rachel', 1, 500)
  ];

  it('returns from-items when no override', () => {
    expect(resolvePerHost(items, null, null)).toEqual({ 'h-justin': 1000, 'h-rachel': 500 });
  });

  it('returns from-items when override equals subtotal', () => {
    expect(resolvePerHost(items, 1500, null)).toEqual({ 'h-justin': 1000, 'h-rachel': 500 });
  });

  it('returns null when override differs but allocation is unset (pending)', () => {
    expect(resolvePerHost(items, 1300, null)).toBeNull();
  });

  it('applies proportional allocation when discount present', () => {
    const out = resolvePerHost(items, 1200, 'proportional');
    // discount = 300, split per share: justin loses 200, rachel loses 100
    expect(out['h-justin']).toBe(800);
    expect(out['h-rachel']).toBe(400);
    expect(out['h-justin'] + out['h-rachel']).toBe(1200);
  });

  it('applies manual allocation when allocation is an object', () => {
    const allocation = { 'h-justin': 700, 'h-rachel': 500 };
    expect(resolvePerHost(items, 1200, allocation)).toEqual(allocation);
  });

  it('treats override above subtotal as a tip distributed proportionally', () => {
    const out = resolvePerHost(items, 1800, null);
    // tip = 300; justin gets 200 more, rachel 100 more
    expect(out['h-justin']).toBe(1200);
    expect(out['h-rachel']).toBe(600);
    expect(out['h-justin'] + out['h-rachel']).toBe(1800);
  });
});

// ─── isPending ─────────────────────────────────────────────────────

describe('isPending', () => {
  const items = [mkItem('Lego', 'h-justin', 1, 1000)];

  it('returns false when no override', () => {
    expect(isPending(mkSale({ items, overrideTotal: null }))).toBe(false);
  });
  it('returns false when override equals subtotal', () => {
    expect(isPending(mkSale({ items, overrideTotal: 1000 }))).toBe(false);
  });
  it('returns true when override differs and no allocation set', () => {
    expect(isPending(mkSale({ items, overrideTotal: 800, discountAllocation: null }))).toBe(true);
  });
  it('returns false once an allocation is set', () => {
    expect(isPending(mkSale({ items, overrideTotal: 800, discountAllocation: 'proportional' }))).toBe(false);
    expect(isPending(mkSale({ items, overrideTotal: 800, discountAllocation: { 'h-justin': 800 } }))).toBe(false);
  });
});

// ─── effectiveTotal ────────────────────────────────────────────────

describe('effectiveTotal', () => {
  const items = [mkItem('Lego', 'h-justin', 1, 1000)];
  it('returns subtotal when no override', () => {
    expect(effectiveTotal(mkSale({ items }))).toBe(1000);
  });
  it('returns override when set', () => {
    expect(effectiveTotal(mkSale({ items, overrideTotal: 800 }))).toBe(800);
  });
});

// ─── getCashAmount / getDigitalAmount ──────────────────────────────

describe('getCashAmount / getDigitalAmount', () => {
  it('reads stored fields when present', () => {
    const sale = mkSale({ cashAmount: 700, digitalAmount: 800 });
    expect(getCashAmount(sale)).toBe(700);
    expect(getDigitalAmount(sale)).toBe(800);
  });

  it('legacy: pure cash payment returns full effectiveTotal as cash', () => {
    const items = [mkItem('Lego', 'h-justin', 1, 1000)];
    const sale = mkSale({ items, paymentMethod: 'cash' });
    expect(getCashAmount(sale)).toBe(1000);
    expect(getDigitalAmount(sale)).toBe(0);
  });

  it('legacy: pure digital payment returns full effectiveTotal as digital', () => {
    const items = [mkItem('Lego', 'h-justin', 1, 1000)];
    const sale = mkSale({ items, paymentMethod: 'digital' });
    expect(getCashAmount(sale)).toBe(0);
    expect(getDigitalAmount(sale)).toBe(1000);
  });
});

// ─── buildSaleNumberMap ────────────────────────────────────────────

describe('buildSaleNumberMap', () => {
  it('numbers sales sequentially by createdAt', () => {
    const sales = [
      { id: 'b', createdAt: ts(2_000) },
      { id: 'a', createdAt: ts(1_000) },
      { id: 'c', createdAt: ts(3_000) }
    ];
    expect(buildSaleNumberMap(sales)).toEqual({ a: 1, b: 2, c: 3 });
  });
  it('includes deleted sales so numbers stay stable', () => {
    const sales = [
      { id: 'a', createdAt: ts(1_000), deletedAt: ts(1_500) },
      { id: 'b', createdAt: ts(2_000) }
    ];
    expect(buildSaleNumberMap(sales)).toEqual({ a: 1, b: 2 });
  });
  it('handles empty list', () => {
    expect(buildSaleNumberMap([])).toEqual({});
  });
});

// ─── computeSettleUp — core scenarios ──────────────────────────────

describe('computeSettleUp', () => {
  it('pure cash sale: no transfers, all goes to cashEarned', () => {
    const sale = mkSale({
      items: [
        mkItem('Lego', 'h-justin', 1, 1000),
        mkItem('Shirt', 'h-rachel', 1, 500)
      ],
      paymentMethod: 'cash',
      cashAmount: 1500,
      digitalAmount: 0
    });
    const r = computeSettleUp([sale], HOSTS);
    expect(r.totalCash).toBe(1500);
    expect(r.totalDigital).toBe(0);
    expect(r.pairwiseDebts).toEqual([]);
    expect(r.perHost['h-justin']).toMatchObject({ earned: 1000, cashEarned: 1000, digitalEarned: 0 });
    expect(r.perHost['h-rachel']).toMatchObject({ earned: 500, cashEarned: 500, digitalEarned: 0 });
  });

  it('pure digital sale: recipient owes others their digital share', () => {
    // $15 sale all paid via Venmo to Rachel; Justin's $10 is his
    const sale = mkSale({
      items: [
        mkItem('Lego', 'h-justin', 1, 1000),
        mkItem('Shirt', 'h-rachel', 1, 500)
      ],
      paymentMethod: 'digital',
      cashAmount: 0,
      digitalAmount: 1500,
      digitalRecipientHostId: 'h-rachel'
    });
    const r = computeSettleUp([sale], HOSTS);
    expect(r.totalDigital).toBe(1500);
    expect(r.perHost['h-rachel'].digitalReceived).toBe(1500);
    expect(r.perHost['h-justin']).toMatchObject({ earned: 1000, digitalEarned: 1000, cashEarned: 0 });
    expect(r.perHost['h-rachel']).toMatchObject({ earned: 500, digitalEarned: 500, cashEarned: 0 });
    expect(r.pairwiseDebts).toHaveLength(1);
    expect(r.pairwiseDebts[0]).toMatchObject({ from: 'h-rachel', to: 'h-justin', amount: 1000 });
  });

  it('split sale: cash fills non-recipient first; recipient covers own share from Venmo', () => {
    // The Justin/Rachel example from the conversation:
    // Lego $10 (Justin) + Shirt $5 (Rachel), $7 cash + $8 Venmo to Rachel
    const sale = mkSale({
      items: [
        mkItem('Lego', 'h-justin', 1, 1000),
        mkItem('Shirt', 'h-rachel', 1, 500)
      ],
      paymentMethod: 'split',
      cashAmount: 700,
      digitalAmount: 800,
      digitalRecipientHostId: 'h-rachel'
    });
    const r = computeSettleUp([sale], HOSTS);
    expect(r.totalCash).toBe(700);
    expect(r.totalDigital).toBe(800);
    // Justin: $7 cash + $3 owed via Venmo
    expect(r.perHost['h-justin']).toMatchObject({ earned: 1000, cashEarned: 700, digitalEarned: 300 });
    // Rachel: $5 Venmo (her own share) + $0 cash
    expect(r.perHost['h-rachel']).toMatchObject({ earned: 500, cashEarned: 0, digitalEarned: 500, digitalReceived: 800 });
    // Rachel owes Justin $3
    expect(r.pairwiseDebts).toHaveLength(1);
    expect(r.pairwiseDebts[0]).toMatchObject({ from: 'h-rachel', to: 'h-justin', amount: 300 });
  });

  it('skips draft sales', () => {
    const draft = mkSale({
      status: 'draft',
      items: [mkItem('Lego', 'h-justin', 1, 1000)],
      paymentMethod: 'cash',
      cashAmount: 1000,
      digitalAmount: 0
    });
    const r = computeSettleUp([draft], HOSTS);
    expect(r.totalCash).toBe(0);
    expect(r.perHost['h-justin'].earned).toBe(0);
  });

  it('skips deleted sales', () => {
    const deleted = mkSale({
      deletedAt: ts(2_000),
      items: [mkItem('Lego', 'h-justin', 1, 1000)],
      paymentMethod: 'cash',
      cashAmount: 1000,
      digitalAmount: 0
    });
    const r = computeSettleUp([deleted], HOSTS);
    expect(r.totalCash).toBe(0);
    expect(r.perHost['h-justin'].earned).toBe(0);
  });

  it('skips sales with pending discount allocation', () => {
    const pending = mkSale({
      items: [mkItem('Lego', 'h-justin', 1, 1000), mkItem('Shirt', 'h-rachel', 1, 500)],
      overrideTotal: 1000, // negotiated
      discountAllocation: null, // not yet decided
      paymentMethod: 'cash',
      cashAmount: 1000,
      digitalAmount: 0
    });
    expect(isPending(pending)).toBe(true);
    const r = computeSettleUp([pending], HOSTS);
    expect(r.totalCash).toBe(0);
    expect(r.perHost['h-justin'].earned).toBe(0);
  });

  it('handles override with proportional allocation', () => {
    const sale = mkSale({
      items: [mkItem('Lego', 'h-justin', 1, 1000), mkItem('Shirt', 'h-rachel', 1, 500)],
      overrideTotal: 1200,
      discountAllocation: 'proportional',
      paymentMethod: 'cash',
      cashAmount: 1200,
      digitalAmount: 0
    });
    const r = computeSettleUp([sale], HOSTS);
    expect(r.perHost['h-justin'].earned).toBe(800);
    expect(r.perHost['h-rachel'].earned).toBe(400);
  });

  it('handles override with manual allocation', () => {
    const sale = mkSale({
      items: [mkItem('Lego', 'h-justin', 1, 1000), mkItem('Shirt', 'h-rachel', 1, 500)],
      overrideTotal: 1200,
      discountAllocation: { 'h-justin': 900, 'h-rachel': 300 },
      paymentMethod: 'cash',
      cashAmount: 1200,
      digitalAmount: 0
    });
    const r = computeSettleUp([sale], HOSTS);
    expect(r.perHost['h-justin'].earned).toBe(900);
    expect(r.perHost['h-rachel'].earned).toBe(300);
  });

  it('aggregates pairwise debts across multiple sales', () => {
    // Two digital sales to Rachel; Justin earns $5 in each via his items
    const sale1 = mkSale({
      id: 's1',
      items: [mkItem('A', 'h-justin', 1, 500), mkItem('B', 'h-rachel', 1, 500)],
      paymentMethod: 'digital',
      cashAmount: 0,
      digitalAmount: 1000,
      digitalRecipientHostId: 'h-rachel'
    });
    const sale2 = mkSale({
      id: 's2',
      items: [mkItem('C', 'h-justin', 1, 500), mkItem('D', 'h-rachel', 1, 500)],
      paymentMethod: 'digital',
      cashAmount: 0,
      digitalAmount: 1000,
      digitalRecipientHostId: 'h-rachel'
    });
    const r = computeSettleUp([sale1, sale2], HOSTS);
    expect(r.pairwiseDebts).toHaveLength(1);
    expect(r.pairwiseDebts[0]).toMatchObject({ from: 'h-rachel', to: 'h-justin', amount: 1000 });
    expect(r.pairwiseDebts[0].sales).toHaveLength(2);
  });

  it('three-host pure digital sale: recipient owes both others their share', () => {
    // Carol is recipient. Justin $5 + Rachel $5 + Carol $5 = $15 all via Venmo
    const sale = mkSale({
      items: [
        mkItem('A', 'h-justin', 1, 500),
        mkItem('B', 'h-rachel', 1, 500),
        mkItem('C', 'h-carol', 1, 500)
      ],
      paymentMethod: 'digital',
      cashAmount: 0,
      digitalAmount: 1500,
      digitalRecipientHostId: 'h-carol'
    });
    const r = computeSettleUp([sale], HOSTS);
    expect(r.pairwiseDebts).toHaveLength(2);
    const debts = Object.fromEntries(r.pairwiseDebts.map((d) => [d.to, d.amount]));
    expect(debts['h-justin']).toBe(500);
    expect(debts['h-rachel']).toBe(500);
  });

  it('sets perHost.net to digitalReceived - digitalEarned', () => {
    // Rachel receives $8 Venmo, earns $5 of it → net = +$3 (she owes)
    const sale = mkSale({
      items: [mkItem('Lego', 'h-justin', 1, 1000), mkItem('Shirt', 'h-rachel', 1, 500)],
      paymentMethod: 'split',
      cashAmount: 700,
      digitalAmount: 800,
      digitalRecipientHostId: 'h-rachel'
    });
    const r = computeSettleUp([sale], HOSTS);
    expect(r.perHost['h-rachel'].net).toBe(300);
    expect(r.perHost['h-justin'].net).toBe(-300);
  });
});

// ─── computeHostShare ──────────────────────────────────────────────

describe('computeHostShare', () => {
  it('returns zero share for hosts with no items in the sale', () => {
    const sale = mkSale({
      items: [mkItem('Lego', 'h-justin', 1, 1000)],
      paymentMethod: 'cash',
      cashAmount: 1000,
      digitalAmount: 0
    });
    expect(computeHostShare(sale, 'h-rachel')).toEqual({ total: 0, cash: 0, digital: 0 });
  });

  it('pure cash: full share is cash', () => {
    const sale = mkSale({
      items: [mkItem('Lego', 'h-justin', 1, 1000)],
      paymentMethod: 'cash',
      cashAmount: 1000,
      digitalAmount: 0
    });
    expect(computeHostShare(sale, 'h-justin')).toEqual({ total: 1000, cash: 1000, digital: 0 });
  });

  it('split sale (Justin/Rachel example): non-recipient gets cash share, owed Venmo for the rest', () => {
    const sale = mkSale({
      items: [mkItem('Lego', 'h-justin', 1, 1000), mkItem('Shirt', 'h-rachel', 1, 500)],
      paymentMethod: 'split',
      cashAmount: 700,
      digitalAmount: 800,
      digitalRecipientHostId: 'h-rachel'
    });
    expect(computeHostShare(sale, 'h-justin')).toEqual({ total: 1000, cash: 700, digital: 300 });
    expect(computeHostShare(sale, 'h-rachel')).toEqual({ total: 500, cash: 0, digital: 500 });
  });

  it('returns pending=true when sale awaits discount allocation', () => {
    const sale = mkSale({
      items: [mkItem('Lego', 'h-justin', 1, 1000), mkItem('Shirt', 'h-rachel', 1, 500)],
      overrideTotal: 1000,
      discountAllocation: null,
      paymentMethod: 'cash',
      cashAmount: 1000,
      digitalAmount: 0
    });
    const out = computeHostShare(sale, 'h-justin');
    expect(out.pending).toBe(true);
  });

  it('returns zero for invalid input', () => {
    expect(computeHostShare(null, 'h-justin')).toEqual({ total: 0, cash: 0, digital: 0 });
    expect(computeHostShare({}, null)).toEqual({ total: 0, cash: 0, digital: 0 });
  });
});

// ─── computeReceivedAtSale ─────────────────────────────────────────

describe('computeReceivedAtSale', () => {
  it('pure cash: each host gets their share in cash directly', () => {
    const sale = mkSale({
      items: [mkItem('Lego', 'h-justin', 1, 1000), mkItem('Shirt', 'h-rachel', 1, 500)],
      paymentMethod: 'cash',
      cashAmount: 1500,
      digitalAmount: 0
    });
    expect(computeReceivedAtSale(sale, 'h-justin')).toEqual({ cash: 1000, digital: 0 });
    expect(computeReceivedAtSale(sale, 'h-rachel')).toEqual({ cash: 500, digital: 0 });
  });

  it('digital sale: recipient pockets full digital amount, others receive nothing immediately', () => {
    const sale = mkSale({
      items: [mkItem('Lego', 'h-justin', 1, 1000), mkItem('Shirt', 'h-rachel', 1, 500)],
      paymentMethod: 'digital',
      cashAmount: 0,
      digitalAmount: 1500,
      digitalRecipientHostId: 'h-rachel'
    });
    expect(computeReceivedAtSale(sale, 'h-rachel')).toEqual({ cash: 0, digital: 1500 });
    expect(computeReceivedAtSale(sale, 'h-justin')).toEqual({ cash: 0, digital: 0 });
  });

  it('split sale: non-recipient gets only cash share, recipient gets full digital + any cash they need', () => {
    const sale = mkSale({
      items: [mkItem('Lego', 'h-justin', 1, 1000), mkItem('Shirt', 'h-rachel', 1, 500)],
      paymentMethod: 'split',
      cashAmount: 700,
      digitalAmount: 800,
      digitalRecipientHostId: 'h-rachel'
    });
    // Justin gets $7 cash directly; the $3 he's owed comes via settlement later
    expect(computeReceivedAtSale(sale, 'h-justin')).toEqual({ cash: 700, digital: 0 });
    // Rachel pockets the full $8 in her Venmo
    expect(computeReceivedAtSale(sale, 'h-rachel')).toEqual({ cash: 0, digital: 800 });
  });

  it('digital sale where recipient earned more than received: recipient gets cash share too', () => {
    // Recipient (Rachel) earns $10 of items; only $3 came in via Venmo. Other $7 from cash pot.
    const sale = mkSale({
      items: [mkItem('Lego', 'h-rachel', 1, 1000)],
      paymentMethod: 'split',
      cashAmount: 700,
      digitalAmount: 300,
      digitalRecipientHostId: 'h-rachel'
    });
    expect(computeReceivedAtSale(sale, 'h-rachel')).toEqual({ cash: 700, digital: 300 });
  });
});

// ─── applySettlements ──────────────────────────────────────────────

describe('applySettlements', () => {
  it('returns debts unchanged when no settlements', () => {
    const debts = [{ from: 'a', to: 'b', amount: 500, sales: [] }];
    const out = applySettlements(debts, []);
    expect(out).toHaveLength(1);
    expect(out[0].amount).toBe(500);
    expect(out[0].paidAmount).toBe(0);
    expect(out[0].originalAmount).toBe(500);
  });

  it('subtracts settlement amount from matching pair', () => {
    const debts = [{ from: 'a', to: 'b', amount: 500, sales: [] }];
    const settlements = [{ from: 'a', to: 'b', amount: 200 }];
    const out = applySettlements(debts, settlements);
    expect(out[0].amount).toBe(300);
    expect(out[0].paidAmount).toBe(200);
    expect(out[0].originalAmount).toBe(500);
  });

  it('removes pair entirely when fully settled', () => {
    const debts = [{ from: 'a', to: 'b', amount: 500, sales: [] }];
    const settlements = [{ from: 'a', to: 'b', amount: 500 }];
    expect(applySettlements(debts, settlements)).toEqual([]);
  });

  it('clamps to zero when overpaid', () => {
    const debts = [{ from: 'a', to: 'b', amount: 500, sales: [] }];
    const settlements = [{ from: 'a', to: 'b', amount: 700 }];
    expect(applySettlements(debts, settlements)).toEqual([]);
  });

  it('only matches by direction, not absolute pair', () => {
    const debts = [{ from: 'a', to: 'b', amount: 500, sales: [] }];
    const settlements = [{ from: 'b', to: 'a', amount: 500 }]; // wrong direction
    const out = applySettlements(debts, settlements);
    expect(out).toHaveLength(1);
    expect(out[0].amount).toBe(500);
  });

  it('aggregates multiple settlements for the same pair', () => {
    const debts = [{ from: 'a', to: 'b', amount: 500, sales: [] }];
    const settlements = [
      { from: 'a', to: 'b', amount: 100 },
      { from: 'a', to: 'b', amount: 150 }
    ];
    const out = applySettlements(debts, settlements);
    expect(out[0].amount).toBe(250);
    expect(out[0].paidAmount).toBe(250);
  });
});

describe('applyDailyCashCarryover', () => {
  const days = [
    { dayKey: '2025-05-10', cashTotal: 3950 },
    { dayKey: '2025-05-11', cashTotal: 2000 },
    { dayKey: '2025-05-12', cashTotal: 1500 }
  ];

  it('returns 0 for the first day when no explicit value is set', () => {
    const out = applyDailyCashCarryover({}, days);
    expect(out[0].effectiveStartingCash).toBe(0);
    expect(out[0].isCarryover).toBe(false);
  });

  it('carries forward the previous day ending cash to days without an explicit value', () => {
    const event = { dailyStartingCash: { '2025-05-10': 10000 } };
    const out = applyDailyCashCarryover(event, days);
    // Day 1: explicit $100.00, ending $139.50
    expect(out[0]).toMatchObject({ effectiveStartingCash: 10000, isCarryover: false });
    // Day 2: carried over from day 1 ending, ending $159.50
    expect(out[1]).toMatchObject({ effectiveStartingCash: 13950, isCarryover: true });
    // Day 3: carried over from day 2 ending
    expect(out[2]).toMatchObject({ effectiveStartingCash: 15950, isCarryover: true });
  });

  it('respects an explicit value mid-chain and resumes carryover after it', () => {
    const event = {
      dailyStartingCash: {
        '2025-05-10': 10000,
        '2025-05-11': 500
      }
    };
    const out = applyDailyCashCarryover(event, days);
    expect(out[1]).toMatchObject({ effectiveStartingCash: 500, isCarryover: false });
    // Day 3 carries over from day 2's *explicit* 500 + 2000 cash = 2500
    expect(out[2]).toMatchObject({ effectiveStartingCash: 2500, isCarryover: true });
  });

  it('treats an explicit 0 as a deliberate value, not as "missing"', () => {
    const event = {
      dailyStartingCash: {
        '2025-05-10': 10000,
        '2025-05-11': 0
      }
    };
    const out = applyDailyCashCarryover(event, days);
    expect(out[1]).toMatchObject({ effectiveStartingCash: 0, isCarryover: false });
  });

  it('handles an event with no dailyStartingCash object at all', () => {
    const out = applyDailyCashCarryover(undefined, days);
    expect(out[0].effectiveStartingCash).toBe(0);
    expect(out[1].effectiveStartingCash).toBe(3950);
    expect(out[1].isCarryover).toBe(true);
  });

  it('handles a day with missing cashTotal field by treating it as zero', () => {
    const event = { dailyStartingCash: { '2025-05-10': 10000 } };
    const out = applyDailyCashCarryover(event, [
      { dayKey: '2025-05-10' },
      { dayKey: '2025-05-11' }
    ]);
    expect(out[1].effectiveStartingCash).toBe(10000);
  });
});
