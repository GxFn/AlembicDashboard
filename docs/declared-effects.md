# Declared effects — AlembicDashboard entrypoint family (P2 AD6)

The Dashboard's whole entrypoint family is one thing: a browser UI consuming
the Alembic HTTP contract (`/api/v1/*`) on the same origin. It has **no direct
filesystem or database access** — all persistence effects happen server-side
behind the HTTP API. The generated contract types (`src/generated/api-types.ts`)
are build-time committed artifacts (sha256-pinned, drift-gated), not a runtime
channel. This repo ships as built static artifacts (`vite build` output); it is
`private: true` with no npm pack surface — packaging-isolation proof is the
build + check pipeline itself.

## Transport census (declared seams)

| Module | Primitive | Role |
| --- | --- | --- |
| `src/api.ts` | axios client (`/api/v1` base), `fetch` ×2 + `EventSource` ×2 (lines ~3225/3335: SSE scan-stream session start + consume) | The HTTP transport + normalizer seam. The only module that may grow new HTTP calls. |
| `src/lib/socket.ts` | `socket.io-client` singleton (managed null-slot) | Realtime events channel; one emit (`join-notifications` room opt-in, AD5 single-room contract). Hooks consume the exported singleton, never create transports. |

Pinned by the contract-suite test
`network transport primitives stay pinned to the declared census` — any new
file touching `fetch`/`XMLHttpRequest`/`EventSource`/`WebSocket`/`sendBeacon`/
axios/socket.io fails `npm test`.

## Known stray transport sites — AD6 FINDINGS (recorded, not fixed)

These pre-existing sites perform HTTP outside `src/api.ts`. They are
normalizer-seam adjacency findings (charter places transport in the api area),
pinned as an exact list in the same test so the set cannot grow silently.
Consolidating them into `src/api.ts` is a controller-routed wave, not part of
this audit.

| Site | Calls | Note |
| --- | --- | --- |
| `src/hooks/useAuth.ts` | `axios.post /auth/login`, `axios.get /auth/me` | Auth flows predate the api-layer convention. |
| `src/hooks/usePermission.ts` | `axios.get /auth/probe` | Same auth family. |
| `src/i18n/index.tsx` | `fetch /ai/lang` ×3 (read + persist UI language) | Language preference round-trips outside api.ts. |

## Read vs mutating operations (`src/api.ts`, wire-level facts)

GET call sites: 36 (read-only). Mutating-verb call sites: 43 (`http.*`) plus
the 2 SSE `fetch` POSTs, enumerated by method below (`refreshProject` has two
POST sites: `/modules/update-map` + `/commands/spm-map` fallback). Verb is the
machine fact recorded here; a subset of POST endpoints are compute/query RPCs
(e.g. `probeProvider`, `getTargetFiles`, `extractFrom*`) — their semantic
classification (whether server state changes) is owned by the HTTP contract
(Alembic provider-contracts), not asserted here. W7-a deleted the zero-consumer
methods (design doc ③-1/③-3): discoverRelations, getDiscoverRelationsStatus,
getKnowledgeGraph, getGraphStats, getJob, getProjectInfo, saveRecipe,
getRecipeByName, getCandidate, getAiProvidersEnhanced, setAiConfig,
summarizeCode, translate, saveGuardRule, knowledgeGet, knowledgeRecordUsage,
knowledgeUpdateQuality, getLogs, getProposalStats, getWarningStats.

- **POST (32 sites / 31 methods):** action, addProjectScopeFolder,
  aiGenerateSkill, bootstrap, cancelBootstrap, cancelJob, clearViolations,
  createSkill, dismissWarning, enqueueBootstrapJob, enqueueRescanJob,
  executeProposal, extractFromPath, extractFromText, getTargetFiles,
  knowledgeBatchDelete, knowledgeBatchDeprecate, knowledgeBatchPublish,
  knowledgeCreate, observeProposal, probeProvider, promoteToCandidate,
  refreshProject (×2), rejectProposal, rescan, resolveProjectScopeFolder,
  resolveWarning, saveLlmEnvConfig, scanProject, scanTarget, setLang
- **PUT (1):** updateSkill
- **PATCH (5):** knowledgeLifecycle, knowledgeUpdate,
  promoteCandidateToRecipe, setRecipeAuthority, updateRecipeRelations
- **DELETE (5):** deleteAllCandidatesInTarget, deleteCandidate, deleteRecipe,
  deleteSkill, knowledgeDelete
- **SSE session starts (`fetch` POST ×2):** scan stream, scan-folder stream —
  mutating (server session creation), consumed via `EventSource`.

## Doctrine status (AD6 lint)

`scripts/lint-doctrine.mjs` + `config/doctrine-lint.json` block the two
machine-checkable AD0 doctrine classes over `src/` in `npm run check`:
module-scope mutable `let` bindings (class A) and module-scope empty
`Map`/`Set` accumulators (class B). React component/hook state is structurally
exempt (module scope = column-0 declarations only); the managed null-slot
idiom (`let _x: T | null = null`) is sanctioned — `src/lib/socket.ts` matches
it. Blessed pre-existing findings: `MermaidBlock.tsx` `idCounter` + `lastTheme`
(owner/reason/cleanupTrigger recorded in the config). Locator census: zero
service-locator sites; space dependencies: zero (enforced by the AD1
space-boundary gate).
