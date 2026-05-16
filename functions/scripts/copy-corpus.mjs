#!/usr/bin/env node
// Copy src/corpus/corpus.json into lib/corpus/corpus.json so the deployed
// function can read it at runtime. tsc doesn't bundle .json files by
// default; we copy them ourselves as a post-compile step.

import { mkdir, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, '..', 'src', 'corpus', 'corpus.json');
const DEST_DIR = join(__dirname, '..', 'lib', 'corpus');
const DEST = join(DEST_DIR, 'corpus.json');

if (!existsSync(SRC)) {
  console.error(`copy-corpus: ${SRC} does not exist`);
  process.exit(1);
}

await mkdir(DEST_DIR, { recursive: true });
await copyFile(SRC, DEST);
console.log('copy-corpus: corpus.json');
