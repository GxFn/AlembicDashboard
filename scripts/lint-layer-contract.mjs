// AD3 Dashboard light conventions contract — blocking direction lint.
//
// Standalone-script choice (vs extending check-space-boundary.mjs): the AD1
// space-boundary gate enforces EXTERNAL edges against the Core-owned
// space-allowed-edges config; this lint enforces INTERNAL src/ conventions
// against the repo-owned config/layer-contract.json. Different authorities,
// different configs, separate gates — mirrors the Alembic AD3 leg layout
// (scripts/lint-layer-contract.mjs + config/layer-contract.json).
//
// Areas are the real src/ census: each top-level directory under src/ is an
// area; each top-level src/*.ts(x) module is its own area named by file stem
// (api, types, App, main, KnowledgePayload, RuntimeDiagnosticsPanelModel).
// Imports resolve through relative specifiers only — this repo has no path
// aliases (tsconfig paths is unset) and package imports are the AD1 gate's
// jurisdiction. `import type` / `export type ... from` edges are type bridges
// and exempt; mixed value imports count as runtime.
//
// --report mode prints the observed as-is graph and never fails: the contract
// codifies reality (report-first method); redesigns go through controller waves.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const sourceRoot = path.join(root, 'src');
const contractPath = path.join(root, 'config', 'layer-contract.json');
const reportMode = process.argv.includes('--report');

const codeFilePattern = /\.(ts|tsx|js|jsx|mjs|cjs)$/;

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(fullPath));
    } else if (codeFilePattern.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

function areaOf(filePath) {
  const relative = path.relative(sourceRoot, filePath).replaceAll(path.sep, '/');
  if (relative.startsWith('..')) {
    return null; // outside src/ — not this contract's jurisdiction
  }
  const [head] = relative.split('/');
  if (head.includes('.')) {
    return head.replace(/\.(ts|tsx|js|jsx|mjs|cjs)$/, '');
  }
  return head;
}

function resolveRelative(importerPath, specifier) {
  const base = path.resolve(path.dirname(importerPath), specifier);
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.jsx`,
    path.join(base, 'index.ts'),
    path.join(base, 'index.tsx'),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      return candidate;
    }
  }
  return null; // non-code asset (css, svg) or unresolved — not a layer edge
}

// Match import/export-from statements, capturing enough prefix to detect
// type-only forms; handles multi-line statements via the from-clause line.
const importStatementPattern =
  /(?:^|;)\s*(import\s+type|export\s+type|import|export)\b[^;'"]*?\bfrom\s*(['"])([^'"]+)\2|(?:^|[^.\w])(?:import|require)\s*\(\s*(['"])([^'"]+)\4/gm;

const runtimeEdges = new Map(); // "from -> to" => [file:specifier]
const typeEdges = new Map();
const files = walk(sourceRoot);
const areas = new Set(files.map(areaOf).filter(Boolean));

for (const filePath of files) {
  const fromArea = areaOf(filePath);
  const text = readFileSync(filePath, 'utf8');
  for (const match of text.matchAll(importStatementPattern)) {
    const keyword = match[1] ?? 'import';
    const specifier = match[3] ?? match[5];
    if (!specifier || !specifier.startsWith('.')) {
      continue;
    }
    const resolved = resolveRelative(filePath, specifier);
    if (!resolved) {
      continue;
    }
    const toArea = areaOf(resolved);
    if (!toArea || toArea === fromArea) {
      continue;
    }
    const isTypeOnly = keyword === 'import type' || keyword === 'export type';
    const bucket = isTypeOnly ? typeEdges : runtimeEdges;
    const edgeKey = `${fromArea} -> ${toArea}`;
    if (!bucket.has(edgeKey)) {
      bucket.set(edgeKey, []);
    }
    bucket.get(edgeKey).push(`${path.relative(root, filePath)} (${specifier})`);
  }
}

if (reportMode) {
  const sortedAreas = [...areas].sort();
  console.log(JSON.stringify({
    kind: 'dashboard-layer-report',
    sourceFiles: files.length,
    areas: sortedAreas,
    runtimeEdges: Object.fromEntries([...runtimeEdges.entries()].sort().map(([k, v]) => [k, v.length])),
    typeOnlyEdges: Object.fromEntries([...typeEdges.entries()].sort().map(([k, v]) => [k, v.length])),
    runtimeEdgeFiles: Object.fromEntries([...runtimeEdges.entries()].sort()),
  }, null, 2));
  process.exit(0);
}

if (!existsSync(contractPath)) {
  console.error(`layer-contract lint FAILED: missing ${path.relative(root, contractPath)}`);
  process.exit(1);
}
const contract = JSON.parse(readFileSync(contractPath, 'utf8'));
const declaredAreas = new Set(contract.areas ?? []);
const allowed = contract.allowedRuntimeImports ?? {};
const exceptions = contract.exactEdgeExceptions ?? [];
const violations = [];

for (const area of areas) {
  if (!declaredAreas.has(area)) {
    violations.push(`area "${area}" exists in src/ but is not declared in the contract census`);
  }
}

for (const [edgeKey, edgeFiles] of [...runtimeEdges.entries()].sort()) {
  const [fromArea, toArea] = edgeKey.split(' -> ');
  const allowedTargets = allowed[fromArea] ?? [];
  if (allowedTargets.includes('*') || allowedTargets.includes(toArea)) {
    continue;
  }
  const unblessed = edgeFiles.filter((ref) => {
    const fileOnly = ref.slice(0, ref.indexOf(' ('));
    return !exceptions.some(
      (entry) => entry.fromFile === fileOnly && entry.toArea === toArea
        && entry.owner && entry.reason && entry.cleanupTrigger,
    );
  });
  for (const ref of unblessed) {
    violations.push(`runtime edge ${edgeKey} not allowed by the contract: ${ref}`);
  }
}

if (violations.length > 0) {
  console.error('layer-contract lint FAILED:');
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exit(1);
}
console.log(
  `layer-contract lint passed (${files.length} files, ${areas.size} areas, ` +
    `${[...runtimeEdges.values()].reduce((n, v) => n + v.length, 0)} runtime edges, ` +
    `${[...typeEdges.values()].reduce((n, v) => n + v.length, 0)} type-only bridges).`,
);
