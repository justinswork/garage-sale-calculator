// Loads the markdown prompt files at module init. The functions/prompts/
// directory is populated by scripts/copy-prompts.mjs before tsc runs, so the
// content here is exactly what lives in /prompts at the repo root.
//
// If either file is missing the function crashes at cold-start, which is
// what we want — better a loud failure than silently shipping with empty
// prompts.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const PROMPTS_DIR = join(__dirname, '..', 'prompts');

function load(name: string): string {
  const path = join(PROMPTS_DIR, name);
  const text = readFileSync(path, 'utf8').trim();
  if (!text) {
    throw new Error(`prompt file ${name} is empty`);
  }
  return text;
}

export const IDENTIFY_ITEM_PROMPT = load('identify-item.md');
export const SUGGEST_PRICE_PROMPT = load('suggest-price.md');
