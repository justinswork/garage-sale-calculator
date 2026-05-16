# Building the comp corpus

`build-corpus.mjs` pulls active eBay listings via the Browse API, dedupes
+ filters them, embeds the titles with Voyage, and writes
`src/corpus/corpus.json`. That JSON file ships with the deployed
function; cosine search runs over it in memory at request time.

## Prereqs

`functions/.secret.local` must contain all three keys (dotenv format —
no quotes, no `export`):

```
EBAY_APP_ID=YourAppID-...
EBAY_CERT_ID=PRD-...
VOYAGE_API_KEY=pa-...
ANTHROPIC_API_KEY=sk-ant-...
```

You already have these per `PHOTO_TO_PRICE_SETUP.md`. The `ANTHROPIC_API_KEY`
line isn't strictly needed for this script but the file is shared with
the function emulator, so keep them together.

## Run

```bash
cd functions

# Tune queries.json against real search results first — free, no embed:
npm run corpus:build:dry

# When happy with the results, run for real (costs ~$0.01 of Voyage tokens):
npm run corpus:build
```

Then commit `src/corpus/corpus.json`:

```bash
git add src/corpus/corpus.json
git commit -m "Refresh comp corpus"
```

## What gets filtered out

- Items below $1 or above $500 (outside garage-sale range).
- Auctions (we restrict to `FIXED_PRICE`).
- "New" condition listings — we want used-condition price signal.
- Titles matching `lot of \d{2,}`, `wholesale`, `bulk`, `for parts`,
  `not working` — these distort the price band.
- Non-US sellers (currency comparison sanity).

## Tuning

- **Add or remove queries** in `queries.json`. Each query gets up to 50
  results. Aim for breadth across price tiers and categories — a corpus
  heavy on $10 kitchen stuff but light on $200 power tools will price
  power tools badly.
- **Use `--dry-run` first** when iterating on queries. Dry run skips
  embedding so you can re-run cheaply.
- **Inspect the result**: open `src/corpus/corpus.json` and skim the
  titles. If a query is pulling in noise (e.g. "lego set" returning
  individual minifigures at $5), refine to `"lego set complete 500
  pieces"` or similar.

## Cost notes

- **eBay Browse API**: 5K calls/day default tier. We use 1 OAuth +
  N search calls (N = number of queries, currently ~55). Plenty of
  headroom.
- **Voyage `voyage-3`**: ~$0.06 per 1M tokens. A 1500-row corpus with
  ~50-token titles is ~75K tokens → about half a cent per build.
- **Storage**: corpus.json with 1500 rows is roughly 8 MiB
  (1500 × 1024 dims × 4 bytes per float, serialized as JSON ≈ 6x raw
  size). That ships with every function deploy — well under Firebase's
  100 MiB upload limit but worth noting.

## Refresh cadence

Manual. Prices drift over months, not days — rebuilding once a quarter
is plenty. Re-run + commit when you notice the suggestions drifting from
reality.
