import type { VoyageAIClient } from 'voyageai';
import type { Comp, CorpusItem, IdentifiedItem } from './types';

// RAG step: embed the identification, cosine-search the corpus, return top-k.
//
// Phase 1 stub. The corpus is empty until Phase 2 populates it from the
// eBay Marketplace Insights API. The cosine math here is final, though —
// nothing to swap out at runtime.

const TOP_K = 8;

export async function findComps(
  _voyage: VoyageAIClient,
  _identified: IdentifiedItem,
  corpus: CorpusItem[]
): Promise<Comp[]> {
  if (corpus.length === 0) {
    // Phase 1: no corpus yet. Return empty and let the caller deal with it.
    return [];
  }

  // TODO (Phase 3): embed the identified.name + description with Voyage,
  // then run the cosine search below against the result.
  //
  //   const { data } = await voyage.embed({
  //     input: [`${identified.name}. ${identified.description}`],
  //     model: 'voyage-3'
  //   });
  //   const queryEmbedding = data[0].embedding;

  const queryEmbedding: number[] = new Array(corpus[0].embedding.length).fill(0);

  return cosineTopK(queryEmbedding, corpus, TOP_K);
}

export function cosineTopK(query: number[], corpus: CorpusItem[], k: number): Comp[] {
  const queryNorm = norm(query);
  if (queryNorm === 0) return [];

  const scored = corpus.map((item) => {
    const sim = dot(query, item.embedding) / (queryNorm * norm(item.embedding));
    return { item, sim };
  });
  scored.sort((a, b) => b.sim - a.sim);

  return scored.slice(0, k).map(({ item, sim }) => ({
    id: item.id,
    title: item.title,
    priceCents: item.priceCents,
    priceType: item.priceType,
    condition: item.condition,
    observedAt: item.observedAt,
    similarity: sim
  }));
}

function dot(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

function norm(a: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * a[i];
  return Math.sqrt(s);
}
