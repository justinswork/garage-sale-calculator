import { describe, expect, it } from 'vitest';
import { formatPricingPrompt } from './suggestPriceCall';
import type { Comp, IdentifiedItem } from './types';

function makeIdentified(): IdentifiedItem {
  return {
    name: 'kitchenaid stand mixer',
    description: 'KitchenAid Artisan series, red, 5-quart bowl, good condition',
    attributes: { brand: 'KitchenAid', model: 'Artisan', category: 'small-appliances' },
    condition: 'good',
    confidence: 'high',
    notes: ''
  };
}

function makeComp(id: string, priceCents: number): Comp {
  return {
    id,
    title: `KitchenAid Artisan ${id}`,
    priceCents,
    priceType: 'asking',
    condition: 'Used',
    observedAt: '2026-01-01T00:00:00Z',
    similarity: 0.85
  };
}

describe('formatPricingPrompt', () => {
  it('emits the no-comps fallback instruction when comps is empty', () => {
    const text = formatPricingPrompt(makeIdentified(), []);
    expect(text).toContain('NO COMPS FOUND');
    expect(text).toContain('confidence: "low"');
    expect(text).toContain('usedCompIds');
  });

  it('lists comps with id, price, condition, similarity, and title', () => {
    const text = formatPricingPrompt(makeIdentified(), [
      makeComp('ebay-A', 14999),
      makeComp('ebay-B', 9999)
    ]);
    expect(text).toContain('[ebay-A] $149.99');
    expect(text).toContain('[ebay-B] $99.99');
    expect(text).toContain('similarity=0.85');
    expect(text).not.toContain('NO COMPS FOUND');
  });

  it('includes identification attributes that are populated', () => {
    const text = formatPricingPrompt(makeIdentified(), []);
    expect(text).toContain('brand: KitchenAid');
    expect(text).toContain('model: Artisan');
  });
});
