#!/usr/bin/env node
// Copy ../prompts/*.md into functions/prompts/ so the deployed function
// has the prompt files alongside its compiled code. Runs before `tsc` as
// part of `npm run build`.
//
// We copy rather than symlink because Firebase only ships files inside
// the functions directory.

import { readdir, mkdir, copyFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, '..', '..', 'prompts');
const DEST = join(__dirname, '..', 'prompts');

if (!existsSync(SRC)) {
  console.error(`copy-prompts: source ${SRC} does not exist`);
  process.exit(1);
}

if (existsSync(DEST)) {
  await rm(DEST, { recursive: true, force: true });
}
await mkdir(DEST, { recursive: true });

const files = (await readdir(SRC)).filter((f) => f.endsWith('.md'));
for (const f of files) {
  await copyFile(join(SRC, f), join(DEST, f));
  console.log(`copy-prompts: ${f}`);
}
