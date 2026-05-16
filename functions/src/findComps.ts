import type { VoyageAIClient } from 'voyageai';
import type { Comp, CorpusItem, IdentifiedItem } from './types';

// RAG step: embed the identification, cosine-search the corpus, return top-k
// above a minimum similarity threshold.
//
// Embedding model is fixed to match the model used to build the corpus
// (see scripts/build-corpus.mjs). If the corpus is rebuilt with a different
// model the search vectors will be incompatible and similarity scores will
// be garbage — keep them aligned.

const VOYAGE_MODEL = 'voyage-3';
const TOP_K = 6;
const MIN_SIMILARITY = 0.5; // drop matches that are clearly off-topic

export async function findComps(
  voyage: VoyageAIClient,
  identified: IdentifiedItem,
  corpus: CorpusItem[]
): Promise<Comp[]> {
  if (corpus.length === 0) {
    // Empty corpus is a real runtime case during Phase 2 rollout and a
    // useful fallback to keep working. The pipeline still calls Claude
    // for pricing; the prompt knows what to do with zero comps.
    return [];
  }

  const queryText = buildQueryText(identified);
  const response = await voyage.embed({
    input: [queryText],
    model: VOYAGE_MODEL,
    inputType: 'query'
  });

  const queryEmbedding = response.data?.[0]?.embedding;
  if (!queryEmbedding || queryEmbedding.length === 0) {
    throw new Error('findComps: Voyage returned no embedding');
  }

  return cosineTopK(queryEmbedding, corpus, TOP_K)
    .filter((c) => c.similarity >= MIN_SIMILARITY);
}

// Format the query the same shape the corpus uses (eBay listing titles).
// Brand + model + name first because that's the highest-signal part of a
// listing title.
function buildQueryText(identified: IdentifiedItem): string {
  const parts: string[] = [];
  if (identified.attributes.brand) parts.push(identified.attributes.brand);
  if (identified.attributes.model) parts.push(identified.attributes.model);
  parts.push(identified.name);
  return parts.join(' ').trim();
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
