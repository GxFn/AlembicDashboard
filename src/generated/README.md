# Generated API contract artifacts

`api-types.ts` is a committed text copy of the canonical artifact generated
in the Alembic repository (IC2, P0 §8). The Dashboard intentionally keeps
zero `@alembic/*` package dependencies, so the contract travels as committed
source, not as an npm import.

- Canonical source: `Alembic/lib/generated/dashboard-api-types.ts`
  (generated there by `npm run build && npm run generate:dashboard-types`;
  guarded there by a regenerate + byte-compare drift gate in `npm run check`).
- Dashboard copy: `src/generated/api-types.ts` plus the SHA-256 pin
  `src/generated/api-types.sha256`.

## Do not edit by hand

Never hand-patch `api-types.ts`. If a generated type mismatches a live API
response, the fix belongs in the Alembic-side generator (or Core wire types),
followed by a re-sync here.

## Sync procedure

1. In the Alembic checkout: regenerate and commit the canonical artifact
   (`npm run generate:dashboard-types`, gated by Alembic `npm run check`).
2. In this repository, from the repo root:

   ```sh
   cp "$ALEMBIC_REPO/lib/generated/dashboard-api-types.ts" src/generated/api-types.ts
   shasum -a 256 src/generated/api-types.ts | awk '{ print $1 "  api-types.ts" }' > src/generated/api-types.sha256
   npm run check
   ```

   `ALEMBIC_REPO` must point at the checkout root that owns the canonical
   generated artifact.

3. Commit the updated artifact and pin together with any consumer fallout.

## Drift gate (Dashboard side)

`npm run check` runs `scripts/check-generated-api-types.mjs`, which

1. recomputes the SHA-256 of `src/generated/api-types.ts` and compares it to
   the committed pin (catches local hand-edits or corruption), and
2. byte-compares the copy against the Alembic-side canonical when the provider
   checkout contains `lib/generated/dashboard-api-types.ts` (catches
   a stale Dashboard copy after the canonical regenerates). When the sibling
   checkout is absent the cross-repo comparison is skipped with a diagnostic
   line; the pin check above still applies.
