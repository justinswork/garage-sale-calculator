#!/usr/bin/env node
// Build src/corpus/corpus.json from eBay Browse API search results.
//
// Pipeline:
//   1. OAuth client_credentials → eBay bearer token
//   2. For each query in queries.json: search Browse API, collect items
//   3. Dedupe by item ID; filter price/keyword junk
//   4. Embed titles in batches via Voyage
//   5. Write JSON
//
// Usage (from functions/):
//   node --env-file=.secret.local scripts/build-corpus.mjs
//   node --env-file=.secret.local scripts/build-corpus.mjs --dry-run
//
// Required env vars: EBAY_APP_ID, EBAY_CERT_ID, VOYAGE_API_KEY
//
// --dry-run skips embedding and corpus write, just reports what would
// have been embedded. Useful for tuning queries.json without spending
// Voyage tokens.

import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUTPUT = join(ROOT, 'src', 'corpus', 'corpus.json');

const DRY_RUN = process.argv.includes('--dry-run');

// ---- config ----
const MARKETPLACE = 'EBAY_US';
const EBAY_API = 'https://api.ebay.com';
const VOYAGE_API = 'https://api.voyageai.com/v1/embeddings';
const VOYAGE_MODEL = 'voyage-3';
const PER_QUERY_LIMIT = 50;            // 50 is eBay's default; up to 200 allowed
const PRICE_MIN_CENTS = 100;           // $1 — below is noise (charms, parts)
const PRICE_MAX_CENTS = 50000;         // $500 — above isn't garage-sale relevant
const EMBED_BATCH = 64;                // Voyage allows up to 128
const SLEEP_BETWEEN_SEARCHES_MS = 250; // be polite to eBay

// ---- main ----
const EBAY_APP_ID = required('EBAY_APP_ID');
const EBAY_CERT_ID = required('EBAY_CERT_ID');
const VOYAGE_API_KEY = DRY_RUN ? null : required('VOYAGE_API_KEY');

const queries = JSON.parse(await readFile(join(__dirname, 'queries.json'), 'utf8'));

console.log(`Building corpus from ${queries.length} queries${DRY_RUN ? ' (dry run)' : ''}.\n`);

console.log('Auth: requesting eBay OAuth token...');
const token = await getEbayToken();
console.log('Auth: ok.\n');

const seen = new Map(); // itemId -> { item, query }
let failedQueries = 0;
for (const q of queries) {
  process.stdout.write(`  "${q.query}" `.padEnd(50, '.'));
  try {
    const items = await searchOnce(token, q.query);
    let added = 0;
    for (const item of items) {
      if (!seen.has(item.itemId)) {
        seen.set(item.itemId, { item, query: q });
        added++;
      }
    }
    console.log(` ${items.length} returned, ${added} new`);
  } catch (err) {
    failedQueries++;
    console.log(` FAIL: ${err.message}`);
  }
  await sleep(SLEEP_BETWEEN_SEARCHES_MS);
}

console.log(`\nRaw unique items: ${seen.size}`);
if (failedQueries) console.warn(`(${failedQueries} queries failed; continuing)`);

// Filter
const rows = [];
const dropped = { price: 0, junk: 0, noTitle: 0 };
for (const { item, query } of seen.values()) {
  const r = normalize(item, query, dropped);
  if (r) rows.push(r);
}
console.log(`After filtering: ${rows.length} kept, dropped (price=${dropped.price}, junk=${dropped.junk}, noTitle=${dropped.noTitle})`);

if (DRY_RUN) {
  console.log('\nDry run — first 10 kept rows:');
  for (const r of rows.slice(0, 10)) {
    console.log(`  $${(r.priceCents / 100).toFixed(2).padStart(7)}  [${r.condition}]  ${r.title}`);
  }
  console.log(`\n(skipping embed + write)`);
  process.exit(0);
}

// Embed
console.log(`\nEmbedding ${rows.length} titles via Voyage ${VOYAGE_MODEL}...`);
const embeddings = await embedAll(rows.map((r) => r.title));
for (let i = 0; i < rows.length; i++) rows[i].embedding = embeddings[i];

// Write
await writeFile(OUTPUT, JSON.stringify(rows, null, 2));
console.log(`\nWrote ${rows.length} rows to ${OUTPUT}`);
const sizeBytes = (await readFile(OUTPUT)).length;
console.log(`Corpus file size: ${(sizeBytes / 1024 / 1024).toFixed(2)} MiB`);

// ---- helpers ----

async function getEbayToken() {
  const auth = Buffer.from(`${EBAY_APP_ID}:${EBAY_CERT_ID}`).toString('base64');
  const res = await fetch(`${EBAY_API}/identity/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body:
      'grant_type=client_credentials&scope=' +
      encodeURIComponent('https://api.ebay.com/oauth/api_scope')
  });
  if (!res.ok) {
    throw new Error(`eBay OAuth ${res.status}: ${await res.text()}`);
  }
  const body = await res.json();
  return body.access_token;
}

async function searchOnce(token, q) {
  const params = new URLSearchParams({
    q,
    limit: String(PER_QUERY_LIMIT),
    // Used items only, fixed-price (no auctions), US-priced, sane range.
    filter: [
      'buyingOptions:{FIXED_PRICE}',
      'conditionIds:{3000|4000|5000|6000}',
      'priceCurrency:USD',
      `price:[${(PRICE_MIN_CENTS / 100).toFixed(2)}..${(PRICE_MAX_CENTS / 100).toFixed(2)}]`,
      'itemLocationCountry:US'
    ].join(',')
  });

  const url = `${EBAY_API}/buy/browse/v1/item_summary/search?${params}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      'X-EBAY-C-MARKETPLACE-ID': MARKETPLACE
    }
  });
  if (!res.ok) {
    throw new Error(`Browse API ${res.status}: ${await res.text()}`);
  }
  const body = await res.json();
  return body.itemSummaries || [];
}

function normalize(item, query, dropped) {
  const title = (item.title || '').trim();
  if (!title) {
    dropped.noTitle++;
    return null;
  }
  const priceStr = item.price?.value;
  const priceCents = priceStr ? Math.round(Number(priceStr) * 100) : 0;
  if (!priceCents || priceCents < PRICE_MIN_CENTS || priceCents > PRICE_MAX_CENTS) {
    dropped.price++;
    return null;
  }
  // Skip obvious lots, parts, bulk listings — these distort prices.
  const lower = title.toLowerCase();
  if (/\blot of \d{2,}\b|\bwholesale\b|\bbulk\b|\bfor parts\b|\bnot working\b/.test(lower)) {
    dropped.junk++;
    return null;
  }

  return {
    id: `ebay-${item.itemId}`,
    title: title.slice(0, 240),
    priceCents,
    priceType: 'asking',
    condition: item.condition || 'Used',
    observedAt: new Date().toISOString(),
    category: query.tag || 'general',
    embedding: null
  };
}

async function embedAll(texts) {
  const out = new Array(texts.length);
  const batches = Math.ceil(texts.length / EMBED_BATCH);
  for (let i = 0; i < texts.length; i += EMBED_BATCH) {
    const slice = texts.slice(i, i + EMBED_BATCH);
    const batchNum = Math.floor(i / EMBED_BATCH) + 1;
    process.stdout.write(`  batch ${batchNum}/${batches} (${slice.length} items)... `);
    const res = await fetch(VOYAGE_API, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${VOYAGE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        input: slice,
        model: VOYAGE_MODEL,
        input_type: 'document'
      })
    });
    if (!res.ok) {
      throw new Error(`Voyage embed ${res.status}: ${await res.text()}`);
    }
    const body = await res.json();
    for (const d of body.data) {
      out[i + d.index] = d.embedding;
    }
    console.log('done');
  }
  return out;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function required(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing env var ${name}.`);
    console.error('Run with: node --env-file=.secret.local scripts/build-corpus.mjs');
    process.exit(1);
  }
  return v;
}
