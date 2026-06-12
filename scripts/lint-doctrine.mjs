// Side-effect doctrine lint (P2 AD6, AlembicDashboard — scaled from the
// Alembic leg): blocks the machine-checkable doctrine pattern classes over
// src/ per config/doctrine-lint.json —
//  A. module-scope mutable `let` bindings, EXCEPT the managed-lifecycle
//     accessor idiom (`let _x: T | null = null;` slots, AD4 pattern);
//  B. module-scope EMPTY `new Map()` / `new Set()` accumulators (seeded
//     const lookups are immutable and not matched).
// Module scope = column-0 declarations; React component/hook state lives
// inside function bodies and is therefore structurally exempt (the config
// documents this exemption rule). Blessed entries (owner/reason/
// cleanupTrigger) exempt named pre-existing bindings; anything new fails.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG_PATH = path.join(REPO_ROOT, 'config', 'doctrine-lint.json');
const SOURCE_EXTENSIONS = new Set(['.ts', '.mts', '.cts', '.tsx']);

const LET_BINDING_RE =
  /^(?:export\s+)?let\s+([A-Za-z_$][\w$]*)(\s*:\s*[^=\n]+)?\s*=\s*([^\n;]+);?\s*$/gm;
const MANAGED_NULL_SLOT_RE =
  /^(?:export\s+)?let\s+[A-Za-z_$][\w$]*\s*:\s*[^=\n]*\|\s*null\s*=\s*null;?\s*$/;
const EMPTY_COLLECTION_RE =
  /^(?:export\s+)?(?:const|let)\s+([A-Za-z_$][\w$]*)(\s*:\s*[^=\n]+)?\s*=\s*new\s+(Map|Set)\s*\(\s*\)/gm;

const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
const blessed = new Set(
  (config.blessedEntries ?? []).map((entry) => `${entry.file}::${entry.binding}`),
);
for (const entry of config.blessedEntries ?? []) {
  for (const field of ['file', 'binding', 'reason', 'owner', 'cleanupTrigger']) {
    if (!entry?.[field]) {
      console.error(`doctrine lint: blessed entry ${JSON.stringify(entry)} missing '${field}'.`);
      process.exit(1);
    }
  }
}

function collectFiles(dir, files = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectFiles(fullPath, files);
    } else if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }
  return files;
}

function lineNumber(text, index) {
  return text.slice(0, index).split('\n').length;
}

const scanRoot = path.join(REPO_ROOT, config.scanRoot ?? 'src');
const violations = [];
let scanned = 0;

for (const filePath of collectFiles(scanRoot)) {
  const relative = path.relative(REPO_ROOT, filePath).replaceAll(path.sep, '/');
  const text = readFileSync(filePath, 'utf8');
  scanned += 1;
  for (const match of text.matchAll(LET_BINDING_RE)) {
    if (MANAGED_NULL_SLOT_RE.test(match[0].trim())) {
      continue; // sanctioned managed-lifecycle accessor slot
    }
    const key = `${relative}::${match[1]}`;
    if (!blessed.has(key)) {
      violations.push(
        `${relative}:${lineNumber(text, match.index ?? 0)} module-scope mutable let "${match[1]}" (class A) — use component/hook state, a managed null-slot, or bless with owner/reason/cleanupTrigger`,
      );
    }
  }
  for (const match of text.matchAll(EMPTY_COLLECTION_RE)) {
    const key = `${relative}::${match[1]}`;
    if (!blessed.has(key)) {
      violations.push(
        `${relative}:${lineNumber(text, match.index ?? 0)} module-scope empty ${match[3]} accumulator "${match[1]}" (class B) — seed it as an immutable lookup or own it inside a component/provider`,
      );
    }
  }
}

if (violations.length > 0) {
  console.error('doctrine lint FAILED:');
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exit(1);
}
console.log(
  `doctrine lint passed (${scanned} files scanned; ${blessed.size} blessed pre-existing bindings; managed null-slots and function-scoped React state exempt by rule).`,
);
