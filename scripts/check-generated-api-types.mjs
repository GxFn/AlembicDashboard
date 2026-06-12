// Dashboard-side drift gate for the generated API contract artifact (IC2, P0 §8).
// The artifact is committed text copied from the Alembic-side canonical; this gate
// fails the check pipeline when the copy is hand-edited (pin mismatch) or stale
// against a present sibling canonical. Sync procedure: src/generated/README.md.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const artifactPath = path.join(root, 'src', 'generated', 'api-types.ts');
const pinPath = path.join(root, 'src', 'generated', 'api-types.sha256');
const canonicalPath = path.resolve(root, '..', 'Alembic', 'lib', 'generated', 'dashboard-api-types.ts');

function fail(message) {
  console.error(`api-types drift gate FAILED: ${message}`);
  console.error('Re-sync procedure: src/generated/README.md');
  process.exit(1);
}

if (!existsSync(artifactPath)) {
  fail(`missing artifact ${path.relative(root, artifactPath)}`);
}
if (!existsSync(pinPath)) {
  fail(`missing hash pin ${path.relative(root, pinPath)}`);
}

const artifact = readFileSync(artifactPath);
const actualHash = createHash('sha256').update(artifact).digest('hex');
const pinnedHash = readFileSync(pinPath, 'utf8').trim().split(/\s+/)[0] ?? '';

if (!/^[0-9a-f]{64}$/.test(pinnedHash)) {
  fail(`hash pin ${path.relative(root, pinPath)} does not contain a SHA-256 hex digest`);
}
if (actualHash !== pinnedHash) {
  fail(
    `src/generated/api-types.ts hash ${actualHash} does not match committed pin ${pinnedHash}. ` +
      'The committed artifact must be a verbatim copy of the Alembic-side canonical — do not edit it by hand.',
  );
}

if (existsSync(canonicalPath)) {
  const canonical = readFileSync(canonicalPath);
  if (!canonical.equals(artifact)) {
    const canonicalHash = createHash('sha256').update(canonical).digest('hex');
    fail(
      `src/generated/api-types.ts (sha256 ${actualHash}) differs from the Alembic-side canonical ` +
        `${canonicalPath} (sha256 ${canonicalHash}). The Dashboard copy is stale or diverged.`,
    );
  }
  console.log('api-types drift gate passed (pin verified; byte-identical to the Alembic-side canonical).');
} else {
  // Standalone checkout: cross-repo comparison impossible, pin check above still holds.
  console.log(`api-types drift gate passed (pin verified; sibling canonical not found at ${canonicalPath}, cross-repo byte-compare skipped).`);
}
