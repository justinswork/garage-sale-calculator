// End-to-end scenarios mirroring real garage-sale flows from the project's
// design conversations. These exercise multiple money helpers together to
// catch regressions in the integration of per-host attribution, settlements,
// and cash-pot reconciliation.

import { describe, it, expect } from 'vitest';
import {
  computeSettleUp,
  applySettlements,
  computeHostShare,
  computeReceivedAtSale,
  getCashAmount,
  getDigitalAmount
} from '../src/utils/sale.js';

const HOSTS = [
  { id: 'h-justin', name: 'Justin' },
  { id: 'h-rachel', name: 'Rachel' },
  { id: 'h-carol', name: 'Carol' }
];

const ts = (millis) => ({ toMillis: () => millis });

function mkSale(overrides = {}) {
  return {
    id: 'sale-x',
    status: 'completed',
    items: [],
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
    createdAt: ts(1_000),
    completedAt: ts(1_000),
    ...overrides
  };
}

const item = (name, hostId, qty, unitPrice) => ({ id: `it-${name}`, name, hostId, qty, unitPrice });

// ─── Scenario 1: split-payment sale (Justin/Rachel) ────────────────

describe('Scenario: split-payment sale ($10 Lego + $5 Shirt, $7 cash + $8 Venmo to Rachel)', () => {
  const sale = mkSale({
    id: 's1',
    items: [item('Lego', 'h-justin', 1, 1000), item('Shirt', 'h-rachel', 1, 500)],
    paymentMethod: 'split',
    cashAmount: 700,
    digitalAmount: 800,
    digitalRecipientHostId: 'h-rachel'
  });

  it('attributes Justin: $7 cash earned, $3 owed via Venmo', () => {
    const r = computeSettleUp([sale], HOSTS);
    expect(r.perHost['h-justin']).toMatchObject({
      earned: 1000, cashEarned: 700, digitalEarned: 300
    });
  });

  it('attributes Rachel: $5 own Venmo share, $0 cash, holds $8 in Venmo', () => {
    const r = computeSettleUp([sale], HOSTS);
    expect(r.perHost['h-rachel']).toMatchObject({
      earned: 500, cashEarned: 0, digitalEarned: 500, digitalReceived: 800
    });
  });

  it('produces exactly one debt: Rachel owes Justin $3', () => {
    const r = computeSettleUp([sale], HOSTS);
    expect(r.pairwiseDebts).toHaveLength(1);
    expect(r.pairwiseDebts[0]).toMatchObject({
      from: 'h-rachel', to: 'h-justin', amount: 300
    });
    expect(r.pairwiseDebts[0].sales).toEqual([{ saleId: 's1', share: 300 }]);
  });

  it('Justin received $7 directly; the $3 he is owed is via settlement', () => {
    expect(computeReceivedAtSale(sale, 'h-justin')).toEqual({ cash: 700, digital: 0 });
  });

  it('Rachel received $0 cash + $8 Venmo at sale moment', () => {
    expect(computeReceivedAtSale(sale, 'h-rachel')).toEqual({ cash: 0, digital: 800 });
  });

  it('after Rachel pays Justin $3 (settlement), no open debts remain', () => {
    const r = computeSettleUp([sale], HOSTS);
    const remaining = applySettlements(r.pairwiseDebts, [
      { from: 'h-rachel', to: 'h-justin', amount: 300, paymentMethod: 'digital' }
    ]);
    expect(remaining).toEqual([]);
  });

  it('cash pot calc only counts the cash portion ($7), not the Venmo', () => {
    expect(getCashAmount(sale)).toBe(700);
    expect(getDigitalAmount(sale)).toBe(800);
  });
});

// ─── Scenario 2: customer negotiation (proportional split) ─────────

describe('Scenario: negotiated total with proportional discount allocation', () => {
  // $10 + $5 = $15 subtotal, customer pays $12, all cash
  const sale = mkSale({
    id: 's2',
    items: [item('Lego', 'h-justin', 1, 1000), item('Shirt', 'h-rachel', 1, 500)],
    overrideTotal: 1200,
    discountAllocation: 'proportional',
    paymentMethod: 'cash',
    cashAmount: 1200,
    digitalAmount: 0
  });

  it("each host loses 20% of their share to absorb the $3 discount", () => {
    const r = computeSettleUp([sale], HOSTS);
    // discount = $3 on $15 subtotal = 20% off; Justin loses $2, Rachel $1
    expect(r.perHost['h-justin'].earned).toBe(800);
    expect(r.perHost['h-rachel'].earned).toBe(400);
  });

  it('totals add up to the negotiated amount exactly', () => {
    const r = computeSettleUp([sale], HOSTS);
    expect(r.totalCash).toBe(1200);
    expect(r.perHost['h-justin'].earned + r.perHost['h-rachel'].earned).toBe(1200);
  });
});

// ─── Scenario 3: pending sale excluded from totals ─────────────────

describe('Scenario: pending discount sales excluded from settle-up totals', () => {
  const completedSale = mkSale({
    id: 'cs',
    items: [item('Lego', 'h-justin', 1, 1000)],
    paymentMethod: 'cash',
    cashAmount: 1000,
    digitalAmount: 0
  });
  const pendingSale = mkSale({
    id: 'ps',
    items: [item('Lego', 'h-justin', 1, 1000), item('Shirt', 'h-rachel', 1, 500)],
    overrideTotal: 1200,
    discountAllocation: null, // pending
    paymentMethod: 'cash',
    cashAmount: 1200,
    digitalAmount: 0
  });

  it('only completed sales contribute to totals', () => {
    const r = computeSettleUp([completedSale, pendingSale], HOSTS);
    expect(r.totalCash).toBe(1000); // pending excluded
    expect(r.perHost['h-justin'].earned).toBe(1000);
    expect(r.perHost['h-rachel'].earned).toBe(0);
  });

  it('once pending is resolved, totals incorporate it', () => {
    const resolved = { ...pendingSale, discountAllocation: 'proportional' };
    const r = computeSettleUp([completedSale, resolved], HOSTS);
    expect(r.totalCash).toBe(2200);
    // Justin: $10 + $8 (after 20% off proportional) = $18
    expect(r.perHost['h-justin'].earned).toBe(1800);
    expect(r.perHost['h-rachel'].earned).toBe(400);
  });
});

// ─── Scenario 4: multi-sale aggregation ────────────────────────────

describe('Scenario: many sales of mixed payment methods aggregate correctly', () => {
  const sales = [
    // Pure cash, both hosts
    mkSale({
      id: 'a',
      items: [item('Lego', 'h-justin', 1, 1000), item('Shirt', 'h-rachel', 1, 500)],
      paymentMethod: 'cash', cashAmount: 1500, digitalAmount: 0
    }),
    // Pure digital to Rachel: Justin $10, Rachel $5
    mkSale({
      id: 'b',
      items: [item('Lego', 'h-justin', 1, 1000), item('Shirt', 'h-rachel', 1, 500)],
      paymentMethod: 'digital', cashAmount: 0, digitalAmount: 1500,
      digitalRecipientHostId: 'h-rachel'
    }),
    // Split sale to Rachel: Justin $5, Rachel $5; $5 cash + $5 Venmo
    mkSale({
      id: 'c',
      items: [item('A', 'h-justin', 1, 500), item('B', 'h-rachel', 1, 500)],
      paymentMethod: 'split', cashAmount: 500, digitalAmount: 500,
      digitalRecipientHostId: 'h-rachel'
    })
  ];

  it('totals reflect sum across all sales', () => {
    const r = computeSettleUp(sales, HOSTS);
    expect(r.totalCash).toBe(2000);   // $15 + $0 + $5
    expect(r.totalDigital).toBe(2000); // $0 + $15 + $5
  });

  it('each host earns the sum of their items across all sales', () => {
    const r = computeSettleUp(sales, HOSTS);
    expect(r.perHost['h-justin'].earned).toBe(2500); // $10 + $10 + $5
    expect(r.perHost['h-rachel'].earned).toBe(1500); // $5 + $5 + $5
  });

  it('Rachel holds all Venmo received from sales b and c', () => {
    const r = computeSettleUp(sales, HOSTS);
    expect(r.perHost['h-rachel'].digitalReceived).toBe(2000);
  });

  it('Rachel owes Justin the digital portion of his items in b and c', () => {
    const r = computeSettleUp(sales, HOSTS);
    const debt = r.pairwiseDebts.find((d) => d.from === 'h-rachel' && d.to === 'h-justin');
    expect(debt).toBeTruthy();
    // From sale b: $10 Justin's share, all digital
    // From sale c: split — cash $5 covers Justin's $5 share, $0 owed
    expect(debt.amount).toBe(1000);
    expect(debt.sales.map((s) => s.saleId)).toEqual(['b']);
  });
});

// ─── Scenario 5: settlement clears debt ────────────────────────────

describe('Scenario: full settlement chain', () => {
  // Two digital sales to Rachel; Rachel owes Justin $5 across them
  const sales = [
    mkSale({
      id: 's1',
      items: [item('A', 'h-justin', 1, 300), item('B', 'h-rachel', 1, 200)],
      paymentMethod: 'digital', cashAmount: 0, digitalAmount: 500,
      digitalRecipientHostId: 'h-rachel'
    }),
    mkSale({
      id: 's2',
      items: [item('C', 'h-justin', 1, 200), item('D', 'h-rachel', 1, 100)],
      paymentMethod: 'digital', cashAmount: 0, digitalAmount: 300,
      digitalRecipientHostId: 'h-rachel'
    })
  ];

  it('initial: Rachel owes Justin $5 ($3 + $2)', () => {
    const r = computeSettleUp(sales, HOSTS);
    expect(r.pairwiseDebts[0].amount).toBe(500);
  });

  it('partial settlement: $2 paid leaves $3 outstanding', () => {
    const r = computeSettleUp(sales, HOSTS);
    const remaining = applySettlements(r.pairwiseDebts, [
      { from: 'h-rachel', to: 'h-justin', amount: 200, paymentMethod: 'digital' }
    ]);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].amount).toBe(300);
    expect(remaining[0].paidAmount).toBe(200);
  });

  it('full settlement: no open debts', () => {
    const r = computeSettleUp(sales, HOSTS);
    const remaining = applySettlements(r.pairwiseDebts, [
      { from: 'h-rachel', to: 'h-justin', amount: 500, paymentMethod: 'digital' }
    ]);
    expect(remaining).toEqual([]);
  });

  it('overpayment never goes negative', () => {
    const r = computeSettleUp(sales, HOSTS);
    const remaining = applySettlements(r.pairwiseDebts, [
      { from: 'h-rachel', to: 'h-justin', amount: 9999, paymentMethod: 'digital' }
    ]);
    expect(remaining).toEqual([]);
  });
});

// ─── Scenario 6: cash pot reconciliation ───────────────────────────

describe('Scenario: cash pot matches starting cash + cash sales only', () => {
  const sales = [
    mkSale({ id: 'a', paymentMethod: 'cash', cashAmount: 1000, digitalAmount: 0,
             items: [item('A', 'h-justin', 1, 1000)] }),
    mkSale({ id: 'b', paymentMethod: 'cash', cashAmount: 500, digitalAmount: 0,
             items: [item('B', 'h-rachel', 1, 500)] }),
    // Pure Venmo sale should NOT contribute to cash pot
    mkSale({ id: 'c', paymentMethod: 'digital', cashAmount: 0, digitalAmount: 800,
             digitalRecipientHostId: 'h-rachel',
             items: [item('C', 'h-justin', 1, 800)] }),
    // Split sale: only the cash portion contributes to the pot
    mkSale({ id: 'd', paymentMethod: 'split', cashAmount: 200, digitalAmount: 300,
             digitalRecipientHostId: 'h-rachel',
             items: [item('D', 'h-justin', 1, 500)] })
  ];

  it('totalCash from settle-up matches sum of getCashAmount across sales', () => {
    const r = computeSettleUp(sales, HOSTS);
    const cashSumDirect = sales.reduce((s, x) => s + getCashAmount(x), 0);
    expect(r.totalCash).toBe(cashSumDirect);
    expect(r.totalCash).toBe(1700); // 1000 + 500 + 0 + 200
  });

  it('starting $50 + $17 cash = $67 expected pot', () => {
    const startingCash = 5000;
    const cashSum = sales.reduce((s, x) => s + getCashAmount(x), 0);
    expect(startingCash + cashSum).toBe(6700);
  });
});

// ─── Scenario 7: math reconciliation per host ──────────────────────

describe('Scenario: per-host received + settlements = earned', () => {
  // The Justin/Rachel split sale, after Rachel pays Justin $3 via Venmo
  const sale = mkSale({
    id: 's',
    items: [item('Lego', 'h-justin', 1, 1000), item('Shirt', 'h-rachel', 1, 500)],
    paymentMethod: 'split', cashAmount: 700, digitalAmount: 800,
    digitalRecipientHostId: 'h-rachel'
  });
  const settlements = [
    { from: 'h-rachel', to: 'h-justin', amount: 300, paymentMethod: 'digital' }
  ];

  it("Justin's received + settlement adjustments equal his earned share", () => {
    const recv = computeReceivedAtSale(sale, 'h-justin');
    const inboundSettle = settlements
      .filter((s) => s.to === 'h-justin')
      .reduce((sum, s) => sum + s.amount, 0);
    const outboundSettle = settlements
      .filter((s) => s.from === 'h-justin')
      .reduce((sum, s) => sum + s.amount, 0);
    const total = recv.cash + recv.digital + inboundSettle - outboundSettle;
    expect(total).toBe(1000); // his earned share
  });

  it("Rachel's received - settlements paid = her earned share", () => {
    const recv = computeReceivedAtSale(sale, 'h-rachel');
    const inboundSettle = 0;
    const outboundSettle = 300;
    const total = recv.cash + recv.digital + inboundSettle - outboundSettle;
    expect(total).toBe(500); // her earned share
  });
});

// ─── Scenario 8: discount with custom manual allocation ───────────

describe('Scenario: customer negotiates and host manually allocates discount', () => {
  // $15 sale, customer pays $10, host says "I'll eat the whole $5 discount"
  // (discount allocation: Justin $5, Rachel $5 → both unchanged since the discount goes to one host)
  // Manual allocation specifies final per-host amounts directly.
  const sale = mkSale({
    id: 's',
    items: [item('Lego', 'h-justin', 1, 1000), item('Shirt', 'h-rachel', 1, 500)],
    overrideTotal: 1000,
    discountAllocation: { 'h-justin': 500, 'h-rachel': 500 }, // Justin eats the full $5 discount
    paymentMethod: 'cash', cashAmount: 1000, digitalAmount: 0
  });

  it('Justin earns the manual allocated amount, not proportional', () => {
    const r = computeSettleUp([sale], HOSTS);
    expect(r.perHost['h-justin'].earned).toBe(500);
    expect(r.perHost['h-rachel'].earned).toBe(500);
  });

  it('manual allocation totals match the override exactly', () => {
    const r = computeSettleUp([sale], HOSTS);
    expect(r.perHost['h-justin'].earned + r.perHost['h-rachel'].earned).toBe(1000);
  });
});
