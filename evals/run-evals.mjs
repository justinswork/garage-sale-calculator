#!/usr/bin/env node
// Runs every test case in testcases.json against the deployed
// `suggestPrice` callable function and writes a CSV scorecard.
//
// Usage:
//   FN_URL=https://<region>-<project>.cloudfunctions.net/suggestPrice \
//   FN_TOKEN=$(gcloud auth print-identity-token) \
//   node evals/run-evals.mjs
//
// If FN_URL points at the local emulator (http://127.0.0.1:5001/...) you can
// omit FN_TOKEN. The emulator does not require auth.
//
// Output: evals/results/<ISO timestamp>.csv with one row per case. The
// reasoning_quality column is left blank — fill it in manually per
// evals/rubric.md after the run.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EVALS_DIR = __dirname;
const IMAGES_DIR = join(EVALS_DIR, 'images');
const RESULTS_DIR = join(EVALS_DIR, 'results');

const FN_URL = process.env.FN_URL;
const FN_TOKEN = process.env.FN_TOKEN;

if (!FN_URL) {
  console.error('Set FN_URL to the deployed (or emulated) suggestPrice URL.');
  process.exit(1);
}

const testCases = JSON.parse(await readFile(join(EVALS_DIR, 'testcases.json'), 'utf8'));

if (!existsSync(RESULTS_DIR)) {
  await mkdir(RESULTS_DIR, { recursive: true });
}

const headers = [
  'id',
  'ground_truth',
  'identified_name',
  'identified_description',
  'suggested_price',
  'price_range_low',
  'price_range_high',
  'accept_low',
  'accept_high',
  'identification_correct',
  'price_in_range',
  'reasoning_quality',
  'reasoning',
  'error'
];

const rows = [headers.join(',')];

for (const tc of testCases) {
  console.log(`\n[${tc.id}] ${tc.groundTruth.description}`);
  const imagePath = resolve(EVALS_DIR, tc.image);
  if (!existsSync(imagePath)) {
    console.warn(`  skipped — missing image at ${imagePath}`);
    rows.push(csv([tc.id, tc.groundTruth.description, '', '', '', '', '', tc.acceptablePriceRange[0], tc.acceptablePriceRange[1], '', '', '', '', 'missing image']));
    continue;
  }

  try {
    const base64 = (await readFile(imagePath)).toString('base64');
    const mediaType = guessMediaType(imagePath);

    const result = await callFunction({ image: { base64, mediaType } });

    // identification_correct is auto-scored on a fuzzy substring match of the
    // ground truth category against the model's name. This is a rough first
    // pass — the human grader can override it when filling in
    // reasoning_quality.
    const idMatch = looseCategoryMatch(result.identified?.name || '', tc.groundTruth.category);
    const priceOk =
      result.priceSuggestion?.suggestedPrice >= tc.acceptablePriceRange[0] &&
      result.priceSuggestion?.suggestedPrice <= tc.acceptablePriceRange[1];

    rows.push(csv([
      tc.id,
      tc.groundTruth.description,
      result.identified?.name || '',
      result.identified?.description || '',
      result.priceSuggestion?.suggestedPrice ?? '',
      result.priceSuggestion?.priceLow ?? '',
      result.priceSuggestion?.priceHigh ?? '',
      tc.acceptablePriceRange[0],
      tc.acceptablePriceRange[1],
      idMatch ? 'y' : 'n',
      priceOk ? 'y' : 'n',
      '', // reasoning_quality — fill in manually
      result.priceSuggestion?.reasoning || '',
      ''
    ]));

    console.log(`  identified: ${result.identified?.name}`);
    console.log(`  price: $${result.priceSuggestion?.suggestedPrice} (${priceOk ? 'in' : 'out of'} range)`);
  } catch (err) {
    console.error(`  error: ${err.message}`);
    rows.push(csv([tc.id, tc.groundTruth.description, '', '', '', '', '', tc.acceptablePriceRange[0], tc.acceptablePriceRange[1], '', '', '', '', err.message]));
  }
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outPath = join(RESULTS_DIR, `${stamp}.csv`);
await writeFile(outPath, rows.join('\n'));
console.log(`\nWrote ${outPath}`);
console.log('Fill in the reasoning_quality column per evals/rubric.md.');

async function callFunction(data) {
  const headers = { 'Content-Type': 'application/json' };
  if (FN_TOKEN) headers.Authorization = `Bearer ${FN_TOKEN}`;
  const res = await fetch(FN_URL, {
    method: 'POST',
    headers,
    // Firebase callable functions expect { data: ... }
    body: JSON.stringify({ data })
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  const body = await res.json();
  if (body.error) throw new Error(body.error.message || JSON.stringify(body.error));
  return body.result;
}

function looseCategoryMatch(name, category) {
  if (!name || !category) return false;
  const n = name.toLowerCase();
  return category
    .toLowerCase()
    .split(/\s+/)
    .some((tok) => tok.length > 3 && n.includes(tok));
}

function guessMediaType(path) {
  const ext = path.toLowerCase().split('.').pop();
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'gif') return 'image/gif';
  return 'image/jpeg';
}

function csv(cells) {
  return cells
    .map((c) => {
      const s = c == null ? '' : String(c);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    })
    .join(',');
}
