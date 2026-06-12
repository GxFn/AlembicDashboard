// AD1 consumer-stage space-boundary gate for AlembicDashboard.
//
// Authority: AlembicCore config/space-allowed-edges.json (Core-owned, READ-ONLY).
// Access choice per its consumerContract.access: this repo is the space's
// zero-package-dependency consumer, so there is no node_modules/@alembic/core
// link to read the config through — it is read from the sibling checkout path
// ../AlembicCore/config/space-allowed-edges.json and never copied or forked.
// When the sibling checkout is absent (standalone/CI context) the config-bound
// assertions are skipped with an explicit message; the repo-local own-entry
// checks below still run and still block.
//
// Own-entry duty (perRepoDuty): the manifest holds zero space dependencies
// (no alembic/@alembic/* packages, no file: links escaping the repo) and no
// src/ import resolves to a space package. The generated src/generated/
// artifacts are sha256-pinned committed text, not package imports — legal.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const configPath = path.resolve(root, '..', 'AlembicCore', 'config', 'space-allowed-edges.json');
const violations = [];
const notes = [];

function fail(message) {
  violations.push(message);
}

// ── 1. Own-entry manifest duty (always runs) ──
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const dependencySections = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];
const liveSpaceDeps = [];
for (const section of dependencySections) {
  for (const [name, spec] of Object.entries(pkg[section] ?? {})) {
    if (name === 'alembic' || name.startsWith('@alembic/')) {
      liveSpaceDeps.push(name);
      fail(`${section} contains space package "${name}" — alembic-dashboard must keep zero space dependencies`);
    }
    if (typeof spec === 'string' && spec.startsWith('file:')) {
      const linkTarget = path.resolve(root, spec.slice('file:'.length));
      if (!linkTarget.startsWith(root + path.sep)) {
        fail(`${section} entry "${name}" uses file: link escaping the repo (${spec}) — forbidden for the zero-dependency consumer`);
      }
    }
  }
}

// ── 2. Own-entry source-import duty (always runs) ──
// Specifier-focused scan: matches static `from '...'` (incl. multi-line import
// closings), bare `import '...'`, dynamic import('...'), and require('...').
// Comment mentions of @alembic/* (e.g. the generated artifact header) do not match.
const importSpecifierPattern = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|^\s*import\s+)(['"])([^'"]+)\1/gm;
function walkSource(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkSource(fullPath));
    } else if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}
let scannedImports = 0;
for (const filePath of walkSource(path.join(root, 'src'))) {
  const text = readFileSync(filePath, 'utf8');
  for (const match of text.matchAll(importSpecifierPattern)) {
    scannedImports += 1;
    const specifier = match[2];
    if (specifier === 'alembic' || specifier.startsWith('alembic/') || specifier.startsWith('@alembic/')) {
      fail(`${path.relative(root, filePath)} imports space package specifier "${specifier}"`);
    }
  }
}
notes.push(`source scan: ${scannedImports} import specifiers checked under src/`);

// ── 3. Config-bound assertions (sibling checkout required) ──
function parseVersion(value) {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(value);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}
function atLeast(actual, floor) {
  for (let i = 0; i < 3; i += 1) {
    if (actual[i] > floor[i]) return true;
    if (actual[i] < floor[i]) return false;
  }
  return true;
}

if (existsSync(configPath)) {
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  const entry = config.repos?.alembicDashboard;
  if (!entry) {
    fail(`canonical config ${configPath} has no repos.alembicDashboard entry`);
  } else {
    if (entry.packageName !== pkg.name) {
      fail(`config packageName "${entry.packageName}" does not match manifest name "${pkg.name}"`);
    }
    const allowed = entry.allowedDependencies ?? [];
    // perRepoDuty: live space deps must equal the canonical allowedDependencies exactly.
    const unexpected = liveSpaceDeps.filter((name) => !allowed.includes(name));
    const missing = allowed.filter((name) => !liveSpaceDeps.includes(name));
    if (unexpected.length > 0 || missing.length > 0) {
      fail(`live space dependencies [${liveSpaceDeps.join(', ')}] != canonical allowedDependencies [${allowed.join(', ')}]`);
    }
    if (entry.zeroPackageDependency === true && liveSpaceDeps.length > 0) {
      fail('canonical entry declares zeroPackageDependency but the manifest carries space dependencies');
    }
    notes.push(`canonical own entry verified: allowedDependencies=[${allowed.join(', ')}], zeroPackageDependency=${entry.zeroPackageDependency === true}`);
  }

  // Toolchain floor — assert only what this repo's toolchain actually uses;
  // floors record facts, gates fail below floor with an explicit message.
  const floor = config.toolchainFloor ?? {};
  const nodeFloorMatch = /^>=(\d+\.\d+\.\d+)$/.exec(floor.node ?? '');
  if (nodeFloorMatch) {
    const actual = parseVersion(process.versions.node);
    const required = parseVersion(nodeFloorMatch[1]);
    if (!actual || !atLeast(actual, required)) {
      fail(`node ${process.versions.node} is below the space floor ${floor.node}`);
    } else {
      notes.push(`toolchain floor: node ${process.versions.node} satisfies ${floor.node}`);
    }
  } else {
    fail(`unrecognized node floor format "${floor.node}" — refusing to silently pass`);
  }
  const tsFloorMatch = /^(\d+)\.(\d+)\.x$/.exec(floor.typescript ?? '');
  const tsPkgPath = path.join(root, 'node_modules', 'typescript', 'package.json');
  if (!tsFloorMatch) {
    fail(`unrecognized typescript floor format "${floor.typescript}" — refusing to silently pass`);
  } else if (!existsSync(tsPkgPath)) {
    fail('typescript is not installed but tsc runs this repo\'s typecheck and build gates');
  } else {
    const tsVersion = JSON.parse(readFileSync(tsPkgPath, 'utf8')).version;
    const actual = parseVersion(tsVersion);
    if (!actual || actual[0] !== Number(tsFloorMatch[1]) || actual[1] !== Number(tsFloorMatch[2])) {
      fail(`typescript ${tsVersion} does not match the space floor ${floor.typescript}`);
    } else {
      notes.push(`toolchain floor: typescript ${tsVersion} matches ${floor.typescript}`);
    }
  }
  // biome and vitest floors exist in the config but are not part of this repo's
  // toolchain (lint is scripts/lint-dashboard.mjs, tests run under node --test).
  notes.push('toolchain floor: biome/vitest floors not applicable to this repo\'s toolchain (no biome, tests use node --test)');
  // vite is used here but the canonical floor defines no vite entry — recorded
  // as a repo fact only; this gate does not invent floors.
  const vitePkgPath = path.join(root, 'node_modules', 'vite', 'package.json');
  if (existsSync(vitePkgPath)) {
    notes.push(`toolchain fact (no canonical floor): vite ${JSON.parse(readFileSync(vitePkgPath, 'utf8')).version}`);
  }
} else {
  notes.push(
    `SKIPPED config-bound assertions: canonical config not found at ${configPath} ` +
      '(standalone/CI checkout without the AlembicCore sibling). Own-entry manifest and import checks above still ran; ' +
      'run this gate in the workspace checkout to verify against the canonical allowed-edge config.',
  );
}

for (const note of notes) {
  console.log(`space-boundary gate: ${note}`);
}
if (violations.length > 0) {
  console.error('space-boundary gate FAILED:');
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exit(1);
}
console.log('space-boundary gate passed (alembic-dashboard own entry: zero space dependencies, zero space imports).');
