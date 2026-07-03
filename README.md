# AlembicDashboard

AlembicDashboard is the standalone frontend repository for the Alembic Dashboard. It owns the user-facing UI, routes, interaction state, visualizations, API client, and frontend build output.

It does not own Core runtime logic, Agent decisions, tool execution, CLI / daemon code, plugin marketplace delivery, or real project test operations. Those responsibilities stay in their corresponding Alembic repositories.

## Directory map (W7, 2026-07-03)

| Directory | Responsibility |
| --------- | -------------- |
| `src/api/` | HTTP client split by backend route family (`client`/`problem`/`sse` shared bases + `projects`/`jobs`/`knowledge`/`modules`/… 16 families; `index.ts` re-assembles the legacy `api` aggregate so consumers stay unchanged) |
| `src/components/Views/` | Tab views (one per tab id) plus embedded panels; `Layout/` header/sidebar shells; `Shared/` cross-view pieces (ErrorBoundary…) |
| `src/hooks/` | Socket/session hooks (`useGenerateSocket`), auth, tab navigation, projects control, LLM status |
| `src/i18n/` | zh/en locales (keys pruned to live usage in W7; SPM segment and backend-keyed families intentionally kept) |
| `src/generated/` | Byte-copy of the main repo's canonical dashboard API types (sha256-pinned, do not edit by hand) |
| `scripts/` | Contract test suite (`node --test`, 33 cases — path/regex pinned structure gates) and lint/check tooling |

## Common Commands

```bash
npm run dev
npm run lint
npm run test
npm run typecheck
npm run check
npm run build
npm run preview
```

- `npm run dev` starts the Vite development server.
- `npm run lint` runs the repository-local Dashboard lint baseline for unsafe console output, erased error types, object rendering regressions, user-specific paths, and the current explicit-`any` budget on high-risk files.
- `npm run test` runs executable Dashboard contract smoke tests for quality gates, mock cleanup notifications, markdown rendering, chunk boundaries, and readable error handling.
- `npm run typecheck` runs TypeScript without emitting files.
- `npm run check` runs lint, tests, typecheck, and production build as the Dashboard quality gate.
- `npm run build` runs TypeScript and then creates the production Vite bundle.
- `npm run preview` serves a previously built `dist/` bundle for local inspection.

## Backend Connection

The development server proxies Dashboard API and socket traffic to an Alembic backend. Set `VITE_API_URL` when the backend is not running on the default local URL:

```bash
VITE_API_URL=http://127.0.0.1:3000 npm run dev
```

The frontend talks to the backend through HTTP, SSE, and WebSocket contracts. Do not copy backend persistence, AST parsing, Agent runtime, AI provider execution, or tool orchestration into this repository.

## API Boundary

- Keep API calls and response normalization in `src/api.ts` or nearby frontend client modules.
- Normalize backend data before it enters UI state.
- Preserve compatibility fields only when they have a real backend or historical-data consumer.
- If a Dashboard feature needs a backend contract change, record the required API shape and wait for the owning backend repository to implement it.

## Build Artifacts

`dist/`, `node_modules/`, `.vite/`, and other generated artifacts are local outputs and must stay ignored. Do not commit built bundles from this repository unless a release plan explicitly asks for a packaged artifact.

## Repository Boundaries

- Only modify this repository for Dashboard code changes.
- Do not edit `Alembic`, `AlembicCore`, `AlembicAgent`, `AlembicPlugin`, `AlembicTest`, or real user projects from this window.
- Cross-repository coordination notes belong in the workspace documentation area for `AlembicDashboard`, not inside this repo unless they are long-lived product docs.
