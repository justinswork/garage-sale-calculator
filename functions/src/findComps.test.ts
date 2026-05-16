import { describe, expect, it } from 'vitest';
import { cosineTopK } from './findComps';
import type { CorpusItem } from './types';

function makeItem(id: string, embedding: number[]): CorpusItem {
  return {
    id,
    title: id,
    priceCents: 1000,
    priceType: 'asking',
    condition: 'Used',
    observedAt: '2026-01-01T00:00:00Z',
    embedding
  };
}

describe('cosineTopK', () => {
  it('returns top-k items by descending similarity', () => {
    // Query points along +x. Items closer to +x rank higher.
    const corpus: CorpusItem[] = [
      makeItem('parallel', [1, 0]),     // sim = 1.0
      makeItem('forty-five', [1, 1]),   // sim ≈ 0.707
      makeItem('orthogonal', [0, 1]),   // sim = 0
      makeItem('opposite', [-1, 0])     // sim = -1
    ];

    const top = cosineTopK([1, 0], corpus, 3);

    expect(top.map((c) => c.id)).toEqual(['parallel', 'forty-five', 'orthogonal']);
    expect(top[0].similarity).toBeCloseTo(1, 5);
    expect(top[1].similarity).toBeCloseTo(Math.SQRT1_2, 5);
    expect(top[2].similarity).toBeCloseTo(0, 5);
  });

  it('returns at most k items', () => {
    const corpus = [
      makeItem('a', [1, 0]),
      makeItem('b', [1, 1]),
      makeItem('c', [0, 1])
    ];
    expect(cosineTopK([1, 0], corpus, 2)).toHaveLength(2);
  });

  it('returns empty when query is the zero vector', () => {
    const corpus = [makeItem('a', [1, 0])];
    expect(cosineTopK([0, 0], corpus, 5)).toEqual([]);
  });

  it('passes through corpus metadata onto the comp', () => {
    const corpus = [makeItem('item-1', [1, 0])];
    const [top] = cosineTopK([1, 0], corpus, 1);
    expect(top.id).toBe('item-1');
    expect(top.priceCents).toBe(1000);
    expect(top.priceType).toBe('asking');
    expect(top.condition).toBe('Used');
  });
});
