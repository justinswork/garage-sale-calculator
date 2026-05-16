# corpus.json

The retrieval corpus. Each row is an eBay active listing with a pre-computed
Voyage embedding. Phase 2 populates this from the eBay **Browse API** (we
pivoted off Marketplace Insights — gated access denied).

Because Browse API exposes active listings, `priceType` is `"asking"` for
every row in the initial build. The suggest-price prompt knows to apply
an asking→sold discount in addition to the garage-sale discount.

The file ships with the function — there's no vector DB. Cosine search runs
in-memory at request time. That works fine up to ~10–20K rows; beyond that
we'd need to move to a real vector store.

Schema (see functions/src/types.ts → `CorpusItem`):

```
{
  "id": "ebay-v1|1234567890|0",
  "title": "Vintage Pyrex Cinderella Mixing Bowl 1.5qt",
  "priceCents": 3499,
  "priceType": "asking",
  "condition": "Used",
  "observedAt": "2026-05-15T00:00:00Z",
  "category": "Kitchenware",
  "embedding": [0.0123, -0.0456, ...]
}
```

Embeddings are produced by Voyage `voyage-3` against the listing title.
Title-only is the cheapest signal that still discriminates well at this
scale; if recall turns out to be a problem we can embed title + description
in a later pass.
