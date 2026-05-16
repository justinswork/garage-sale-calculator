// Shared request/response types for the photo-to-price flow.

export interface SuggestPriceRequest {
  image: {
    base64: string;
    mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
  };
}

export interface IdentifiedItem {
  name: string;
  description: string;
  attributes: {
    brand?: string;
    model?: string;
    category?: string;
    material?: string;
    color?: string;
    size?: string;
    era?: string;
  };
  condition: 'like-new' | 'good' | 'fair' | 'poor';
  confidence: 'high' | 'medium' | 'low';
  notes: string;
}

export interface Comp {
  id: string;
  title: string;
  priceCents: number;
  // 'asking' for active eBay Browse API listings (the Phase 2 source);
  // 'sold' if we ever pull from a sold-price source. The suggest-price
  // prompt branches on this field.
  priceType: 'asking' | 'sold';
  condition: string;
  observedAt: string;    // ISO date — when this listing was indexed
  similarity: number;    // cosine similarity from retrieval, 0–1
}

export interface PriceSuggestion {
  suggestedPrice: number;        // USD, integer
  priceLow: number;
  priceHigh: number;
  reasoning: string;
  usedCompIds: string[];
  confidence: 'high' | 'medium' | 'low';
}

export interface SuggestPriceResponse {
  identified: IdentifiedItem;
  comps: Comp[];
  priceSuggestion: PriceSuggestion;
}

// Each row in functions/src/corpus/corpus.json. Built offline from eBay
// Browse API by the Phase 2 corpus builder.
export interface CorpusItem {
  id: string;
  title: string;
  priceCents: number;
  priceType: 'asking' | 'sold';
  condition: string;
  observedAt: string;
  category?: string;
  embedding: number[];
}
