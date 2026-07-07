import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import ts from 'typescript';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

function read(relativePath) {
  return readFileSync(path.join(root, relativePath), 'utf8');
}

// W7-f: src/api.ts was split into src/api/ route-family files. Whole-surface
// assertions (absence pins and cross-family presence pins) read the joined
// api-area text; single-family assertions read the owning family file.
function readApiDir() {
  return readdirSync(path.join(root, 'src', 'api'))
    .filter((name) => name.endsWith('.ts'))
    .sort()
    .map((name) => read(`src/api/${name}`))
    .join('\n');
}

const transpiledFileCache = new Map();

function resolveRelativeImport(importerRelativePath, specifier) {
  const joined = path
    .normalize(path.join(path.dirname(importerRelativePath), specifier))
    .replaceAll(path.sep, '/');
  for (const candidate of [`${joined}.ts`, `${joined}.tsx`, joined, `${joined}/index.ts`]) {
    if (existsSync(path.join(root, candidate))) {
      return candidate;
    }
  }
  assert.fail(`Cannot resolve relative import ${specifier} from ${importerRelativePath}`);
}

function transpileToTempFile(relativePath) {
  const cached = transpiledFileCache.get(relativePath);
  if (cached) {
    return cached;
  }
  const source = read(relativePath);
  let output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  // Type-only imports are erased by the transpile; surviving relative imports are
  // runtime dependencies (e.g. src/generated/api-types.ts) and must be rewritten to
  // point at their own transpiled copies, because the temp module lives outside src/.
  output = output.replace(
    /(from\s*|import\s*\(?\s*)(["'])(\.{1,2}\/[^"']+)\2/g,
    (_match, prefix, quote, specifier) => {
      const depTempFile = transpileToTempFile(resolveRelativeImport(relativePath, specifier));
      return `${prefix}${quote}${pathToFileURL(depTempFile).href}${quote}`;
    },
  );
  const tempDir = path.join(root, 'node_modules', '.tmp', 'dashboard-contract');
  mkdirSync(tempDir, { recursive: true });
  const tempFile = path.join(tempDir, `${relativePath.replace(/[^A-Za-z0-9._-]+/g, '-')}-${Date.now()}.mjs`);
  writeFileSync(tempFile, output);
  transpiledFileCache.set(relativePath, tempFile);
  return tempFile;
}

async function importTranspiled(relativePath) {
  return import(pathToFileURL(transpileToTempFile(relativePath)).href);
}

async function importAlembicProviderContracts() {
  const providerPath = path.resolve(root, '..', 'Alembic', 'dist', 'lib', 'http', 'provider-contracts.js');
  return import(pathToFileURL(providerPath).href);
}

function providerFixture(fixtures, fixtureId) {
  const fixture = fixtures.find((item) => item.fixtureId === fixtureId);
  assert.ok(fixture, `Alembic provider fixture ${fixtureId} is required`);
  return fixture;
}

const dashboardForbiddenPublicFieldKeys = new Set([
  'apikey',
  'authorization',
  'authtoken',
  'hiddenreasoning',
  'hostmetadata',
  'password',
  'privatepath',
  'providerrequest',
  'providerresponse',
  'rawpayload',
  'rawproviderpayload',
  'rawresponse',
  'secret',
  'secrettoken',
  'token',
]);

function normalizedFieldKey(key) {
  return key.replace(/[^a-z0-9]/gi, '').toLowerCase();
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function addForbiddenProviderFields(record) {
  if (!isRecord(record)) {
    return;
  }
  record.apiKey = 'sk-dashboard-private';
  record.secretToken = 'private-token';
  record.rawProviderPayload = { requestId: 'raw-provider-request' };
  record.privatePath = '/private/alembic/provider.json';
  record.hostMetadata = { host: 'codex' };
  record.hiddenReasoning = 'provider-only reasoning';
}

function cloneWithForbiddenProviderFields(value) {
  const clone = cloneJson(value);
  const targets = [
    clone,
    clone.data,
    clone.error,
    clone.error?.failureTaxonomy,
    clone.data?.error,
    clone.data?.failureTaxonomy,
    clone.data?.items?.[0],
    clone.data?.event,
    clone.data?.metadata,
    clone.data?.searchMeta,
    clone.event,
    clone.metadata,
    clone.validation,
    clone.producer,
  ];
  for (const target of targets) {
    addForbiddenProviderFields(target);
  }
  return clone;
}

function cloneWithRetiredProviderCompatibilityFields(value) {
  const clone = cloneWithForbiddenProviderFields(value);
  // CR3 test-only negative fixture. Owner: AlembicDashboard contract tests.
  // Cleanup trigger: remove after Core runtime contracts drop the retired alias field.
  const fileMonitor = clone.data?.capabilities?.fileMonitor ?? clone.capabilities?.fileMonitor;
  if (isRecord(fileMonitor)) {
    fileMonitor.compatibilityAliases = {
      'ide-edit': 'host-edit',
    };
  }
  return clone;
}

function assertNoForbiddenPublicFields(value, pathLabel = 'projection') {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoForbiddenPublicFields(item, `${pathLabel}[${index}]`));
    return;
  }
  if (!isRecord(value)) {
    return;
  }
  for (const [key, nestedValue] of Object.entries(value)) {
    assert.ok(
      !dashboardForbiddenPublicFieldKeys.has(normalizedFieldKey(key)),
      `${pathLabel}.${key} must not expose provider-private fields`,
    );
    assertNoForbiddenPublicFields(nestedValue, `${pathLabel}.${key}`);
  }
}

function valueAtPath(value, pathExpression) {
  return pathExpression.split('.').reduce((current, key) => {
    if (Array.isArray(current) && /^\d+$/.test(key)) {
      return current[Number(key)];
    }
    return isRecord(current) ? current[key] : undefined;
  }, value);
}

function assertExpectedProjectionFields(projection, scenario) {
  for (const [pathExpression, expected] of scenario.expectedFields) {
    assert.deepEqual(
      valueAtPath(projection, pathExpression),
      expected,
      `${scenario.id} should expose ${pathExpression}`,
    );
  }
}

function producerContractForFixture(provider, fixture) {
  return provider.ALEMBIC_PROVIDER_ROUTE_CONTRACTS.find((contract) =>
    contract.fixtureIds.includes(fixture.fixtureId)
  ) ||
    provider.ALEMBIC_PROVIDER_EVENT_CONTRACTS.find((contract) => contract.fixtureIds.includes(fixture.fixtureId));
}

function classifyDashboardReplayFailure({ fixture, producerContract, projection }) {
  if (!fixture) {
    return 'producer-fixture';
  }
  if (!producerContract) {
    return 'contract-registry';
  }
  if (!projection) {
    return 'dashboard-adapter';
  }
  return 'dashboard-consumer-expectation';
}

test('package exposes real local quality gates', () => {
  const pkg = JSON.parse(read('package.json'));
  for (const scriptName of ['lint', 'test', 'typecheck', 'build', 'build:check', 'check']) {
    assert.equal(typeof pkg.scripts?.[scriptName], 'string', `${scriptName} script is required`);
    assert.doesNotMatch(pkg.scripts[scriptName], /echo|exit\s+0|true/, `${scriptName} must not be a placeholder`);
  }
  assert.match(pkg.scripts.lint, /lint-dashboard\.mjs/);
  assert.match(pkg.scripts.test, /dashboard-contract\.test\.mjs/);
});

test('dashboard does not expose product AI mock UI or cleanup API', () => {
  const header = read('src/components/Layout/Header.tsx');
  const api = readApiDir();
  const llmConfig = read('src/components/Modals/LlmConfigModal.tsx');
  const zh = read('src/i18n/locales/zh.ts');
  const en = read('src/i18n/locales/en.ts');
  const start = header.indexOf('const handleSelectAi');
  const end = header.indexOf('const loadProviders');
  assert.ok(start >= 0 && end > start, 'AI provider switch handler should be present');

  const block = header.slice(start, end);
  assert.match(block, /api\.saveLlmEnvConfig/);
  assert.doesNotMatch(block, /cleanupMockData/);
  assert.doesNotMatch(block, /mockSwitch/);
  assert.doesNotMatch(block, /provider === ['"]mock['"]/);
  assert.doesNotMatch(header, /FlaskConical/);
  assert.doesNotMatch(header, /mockModeHint/);
  assert.doesNotMatch(api, /cleanupMockData|ai\/mock\/cleanup/);
  assert.doesNotMatch(llmConfig, /providers\.mock|p => p\.id !== ['"]mock['"]/);
  assert.doesNotMatch(zh, /mockModeHint|mockSwitch|mockCleanup|Mock \(测试\)/);
  assert.doesNotMatch(en, /mockModeHint|mockSwitch|mockCleanup|Mock \(Test\)/);
});

test('header nests terminal and sandbox details under runtime route badge', () => {
  const header = read('src/components/Layout/Header.tsx');
  const runtimeStart = header.indexOf('{runtimeBoundary && (');
  const testModeStart = header.indexOf('{testMode?.enabled && (');
  const searchStart = header.indexOf('{/* ── 中间：⌘K 搜索触发 ── */}');
  assert.ok(runtimeStart >= 0 && testModeStart > runtimeStart, 'runtime badge should render before test mode badge');
  assert.ok(searchStart > testModeStart, 'search block should follow the left status badges');

  const runtimeBlock = header.slice(runtimeStart, testModeStart);
  const testModeBlock = header.slice(testModeStart, searchStart);

  assert.match(header, /const terminalCapability = testMode\?\.terminal\.enabled \? testMode\.terminal : null/);
  assert.match(header, /const sandboxStatus = testMode\?\.sandbox \?\? null/);
  assert.match(runtimeBlock, /hasNestedRuntimeDetails/);
  assert.match(runtimeBlock, /t\('generate\.terminalCapability'\)/);
  assert.match(runtimeBlock, /terminalCapability\.toolset/);
  assert.match(runtimeBlock, /SandboxStatusIcon sandbox=\{sandboxStatus\}/);
  assert.match(runtimeBlock, /t\(sandboxLabelKey\(sandboxStatus\)\)/);
  assert.match(runtimeBlock, /t\(sandboxHintKey\(sandboxStatus\)\)/);

  assert.match(testModeBlock, /t\('generate\.testMode'\)/);
  assert.doesNotMatch(testModeBlock, /terminalCapability/);
  assert.doesNotMatch(testModeBlock, /sandbox\./);
});

test('dashboard consumes API AI runtime contract naming', () => {
  const types = read('src/types.ts');
  const api = readApiDir();
  const header = read('src/components/Layout/Header.tsx');
  const help = read('src/components/Views/HelpView.tsx');
  const zh = read('src/i18n/locales/zh.ts');
  const en = read('src/i18n/locales/en.ts');
  const activeRuntimeText = [types, api, header, help, zh, en].join('\n');
  const blockedRuntimeTokens = [
    ['internal', 'Ai'].join(''),
    ['internal', '-ai'].join(''),
    ['Internal', 'Ai'].join(''),
    ['Internal', ' AI'].join(''),
    ['jobs.', 'internal', '-ai'].join(''),
    ['Alembic', 'Internal', 'Ai'].join(''),
    ['ProjectRuntime', 'Internal', 'Ai'].join(''),
  ];
  const blockedRuntimePattern = new RegExp(
    blockedRuntimeTokens.map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'),
  );

  assert.match(types, /interface RuntimeApiAiCapability/);
  assert.match(types, /apiAi\?: RuntimeApiAiCapability/);
  assert.match(api, /runtimeBoundary\?\.apiAi/);
  assert.match(api, /capabilities\.apiAi/);
  assert.match(api, /apiAi: apiAiCapability \|\| runtimeApiAi/);
  assert.match(header, /runtimeBoundary\.capabilities\.apiAi\?\.available/);
  assert.match(header, /t\('header\.runtimeApiAi'\)/);
  assert.match(help, /help\.apiAiWorkflows/);
  assert.match(en, /runtimeApiAi: 'API AI'/);
  assert.match(zh, /runtimeApiAi: 'API AI'/);
  assert.doesNotMatch(activeRuntimeText, blockedRuntimePattern);
});

test('projects runtime control source-of-truth diagnostics are preserved and visible', () => {
  const types = read('src/types.ts');
  const api = read('src/api/projects.ts');
  const header = read('src/components/Layout/Header.tsx');
  const zh = read('src/i18n/locales/zh.ts');
  const en = read('src/i18n/locales/en.ts');

  assert.match(types, /interface DashboardProjectRuntimeSourceOfTruth/);
  assert.match(types, /interface DashboardProjectRuntimeFailureEnvelope/);
  assert.match(types, /interface DashboardProjectRuntimeControlDiagnostic/);
  assert.match(types, /sourceOfTruth: DashboardProjectRuntimeSourceOfTruth \| null/);
  assert.match(types, /stateCleanup: DashboardProjectRuntimeControlStateCleanup/);
  assert.match(types, /extraFields: Record<string, unknown>/);
  assert.match(types, /nextActions: string\[\]/);
  assert.match(types, /detailRefs: string\[\]/);

  assert.match(api, /function normalizeProjectRuntimeSourceOfTruth/);
  assert.match(api, /function normalizeProjectRuntimeDiagnostics/);
  assert.match(api, /function normalizeProjectRuntimeStateCleanup/);
  assert.match(api, /projectRuntimeDiagnosticExtraFields/);
  assert.match(api, /extraFields: projectRuntimeDiagnosticExtraFields\(record\)/);
  assert.match(api, /sourceOfTruth: normalizeProjectRuntimeSourceOfTruth\(record\.sourceOfTruth/);
  assert.match(api, /diagnostics: normalizeProjectRuntimeDiagnostics\(record\.diagnostics\)/);
  assert.match(api, /stateCleanup = normalizeProjectRuntimeStateCleanup\(record\.stateCleanup\)/);
  assert.match(api, /getCurrentProjectSnapshot\(\): Promise<DashboardProjectsSnapshot>/);
  assert.doesNotMatch(api, /sourceOfTruth:\s*null/);

  assert.match(header, /function RuntimeSourceOfTruthPanel/);
  assert.match(header, /projectsSnapshot\?\.sourceOfTruth/);
  assert.match(header, /buildRuntimeDiagnosticsFieldRows\(sourceOfTruth\)/);
  assert.match(header, /runtimeDiagnosticsRowValue\(row, t\)/);
  assert.match(header, /buildRuntimeDiagnosticExtraRows\(diagnostic\)/);
  assert.match(header, /refs\.slice\(0, 6\)/);
  assert.match(header, /failure\?\.nextActions/);
  assert.match(header, /activeCleanup\?\.cleaned/);
  assert.match(header, /projectDiagnosticsTitle/);
  assert.match(header, /projectDiagnosticsUnavailableHint/);

  assert.match(zh, /projectDiagnosticsTitle: '运行诊断'/);
  assert.match(zh, /projectDiagnosticsNextActions: '下一步'/);
  assert.match(en, /projectDiagnosticsTitle: 'Runtime diagnostics'/);
  assert.match(en, /projectDiagnosticsNextActions: 'Next actions'/);
});

test('projects runtime diagnostics fixture preserves source-of-truth details through executable normalizer', async () => {
  const { normalizeProjectsSnapshot } = await importTranspiled('src/api/index.ts');
  const snapshot = normalizeProjectsSnapshot({
    diagnostics: [
      {
        reasonCode: 'fallback-diagnostic',
        message: 'Fallback diagnostic',
        severity: 'warning',
        detailRefs: ['fallback-detail.md'],
        sourceRefs: ['fallback-source.md'],
      },
    ],
    state: { activeProjectId: 'old-active', selectedProjectId: 'selected' },
    stateCleanup: {
      activeState: {
        cleaned: true,
        cleanedAt: '2026-06-07T14:00:00Z',
        previousProjectRoot: '/tmp/old',
        reasonCode: 'stale-active-state',
      },
    },
    sourceOfTruth: {
      contractVersion: 1,
      detailRefs: ['detail/source-of-truth.md'],
      diagnostics: [
        {
          reasonCode: 'runtime-control-blocked',
          message: 'Runtime control blocked implicit writes',
          severity: 'error',
          sourceRefs: ['runtime/source.ts'],
          detailRefs: ['runtime/detail.md'],
          remediationOwner: 'plugin-runtime',
          nestedContext: { queue: 'runtime-control' },
        },
      ],
      explicitActions: { runtimeControl: ['switch'], daemonLifecycle: [], projectScopeRegistry: [] },
      failure: {
        reasonCode: 'runtime-control-unavailable',
        blockingCondition: 'required service route missing',
        observedSource: 'projects-api',
        retryable: false,
        blockedFallbacks: ['dashboard-local-state'],
        nextActions: ['restart daemon'],
        sourceRefs: ['failure/source.ts'],
        detailRefs: ['failure/detail.md'],
      },
      generatedAt: '2026-06-07T14:30:00Z',
      operation: {
        mode: 'read-only-diagnostics',
        readOnly: true,
        explicitRuntimeActionRequired: true,
        implicitRuntimeActionAllowed: false,
      },
      readiness: { ready: false, reasonCode: 'needs-runtime-control', stale: false, status: 'blocked' },
      requiredService: { kind: 'runtime-control', owner: 'AlembicPlugin', route: '/api/v1/projects/current' },
      route: '/api/v1/projects',
      sourceRefs: ['source-of-truth.ts'],
      writePolicy: {
        activeStateWriteAllowed: false,
        daemonLifecycleWriteAllowed: false,
        jobStoreWriteAllowed: false,
        projectScopeRegistryWriteAllowed: false,
        selectedStateWriteAllowed: false,
        writeOwner: 'AlembicPlugin',
      },
    },
  });

  assert.equal(snapshot.sourceOfTruth?.requiredService.kind, 'runtime-control');
  assert.equal(snapshot.sourceOfTruth?.operation.mode, 'read-only-diagnostics');
  assert.equal(snapshot.sourceOfTruth?.operation.implicitRuntimeActionAllowed, false);
  assert.equal(snapshot.sourceOfTruth?.writePolicy.activeStateWriteAllowed, false);
  assert.equal(snapshot.sourceOfTruth?.failure?.blockingCondition, 'required service route missing');
  assert.equal(snapshot.stateCleanup.activeState.cleaned, true);
  assert.equal(snapshot.sourceOfTruth?.diagnostics[0]?.extraFields.remediationOwner, 'plugin-runtime');
  assert.deepEqual(snapshot.sourceOfTruth?.diagnostics[0]?.extraFields.nestedContext, { queue: 'runtime-control' });
  assert.notEqual(snapshot.sourceOfTruth, null);
});

test('runtime diagnostics panel model exposes operation, service, write-policy, failure, and extra-field rows', async () => {
  const { buildRuntimeDiagnosticExtraRows, buildRuntimeDiagnosticsFieldRows } = await importTranspiled('src/RuntimeDiagnosticsPanelModel.ts');
  const rows = buildRuntimeDiagnosticsFieldRows({
    readiness: { reasonCode: 'needs-runtime-control', status: 'blocked' },
    route: '/api/v1/projects',
    generatedAt: '2026-06-07T14:30:00Z',
    operation: {
      mode: 'read-only-diagnostics',
      readOnly: true,
      explicitRuntimeActionRequired: true,
      implicitRuntimeActionAllowed: false,
    },
    requiredService: { kind: 'runtime-control', owner: 'AlembicPlugin', route: '/api/v1/projects/current' },
    writePolicy: {
      activeStateWriteAllowed: false,
      daemonLifecycleWriteAllowed: false,
      jobStoreWriteAllowed: false,
      projectScopeRegistryWriteAllowed: false,
      selectedStateWriteAllowed: false,
      writeOwner: 'AlembicPlugin',
    },
    failure: {
      reasonCode: 'runtime-control-unavailable',
      blockingCondition: 'required service route missing',
      observedSource: 'projects-api',
      retryable: false,
    },
  });
  const rowKeys = rows.map((row) => row.key);
  assert.ok(rowKeys.includes('operation-mode'));
  assert.ok(rowKeys.includes('operation-explicit-required'));
  assert.ok(rowKeys.includes('required-service-kind'));
  assert.ok(rowKeys.includes('write-active-state'));
  assert.ok(rowKeys.includes('failure-blocking-condition'));

  const extraRows = buildRuntimeDiagnosticExtraRows({
    extraFields: { remediationOwner: 'plugin-runtime', nestedContext: { queue: 'runtime-control' } },
  });
  assert.deepEqual(extraRows.map((row) => row.key), ['nestedContext', 'remediationOwner']);

  const zh = read('src/i18n/locales/zh.ts');
  const en = read('src/i18n/locales/en.ts');
  for (const key of ['projectDiagnosticsOperationMode', 'projectDiagnosticsWriteActiveState', 'projectDiagnosticsFailureBlockingCondition', 'projectDiagnosticsExtraFields']) {
    assert.match(zh, new RegExp(`${key}:`));
    assert.match(en, new RegExp(`${key}:`));
  }
});

test('markdown renderer is typed and heavy renderers are lazy-loaded', () => {
  const markdown = read('src/components/Shared/MarkdownWithHighlight.tsx');
  const segment = read('src/components/Shared/MarkdownSegment.tsx');
  const lazyCode = read('src/components/Shared/LazyCodeBlock.tsx');
  assert.match(markdown, /React\.lazy\(\(\) => import\('\.\/MarkdownSegment'\)\)/);
  assert.match(segment, /type Components/);
  assert.match(lazyCode, /React\.lazy\(\(\) => import\('\.\/CodeBlock'\)\)/);
  assert.match(markdown, /React\.lazy\(\(\) => import\('\.\/MermaidBlock'\)\)/);
  assert.match(markdown, /React\.Suspense/);
  assert.doesNotMatch(markdown, /:\s*any\b/);
  assert.doesNotMatch(segment, /:\s*any\b/);
});

test('vite chunks isolate markdown and mermaid without splitting syntax internals', () => {
  const config = read('vite.config.ts');
  assert.match(config, /return 'markdown'/);
  assert.match(config, /return 'mermaid'/);
  assert.match(config, /return 'syntax-highlight'/);
  assert.match(config, /isSyntaxHighlightPackage/);
});

test('object errors keep a readable fallback instead of rendering object identity', () => {
  const errorUtil = read('src/utils/error.ts');
  assert.match(errorUtil, /export function getErrorMessage\(err: unknown/);
  assert.match(errorUtil, /typeof data\.error === 'object'/);
  assert.doesNotMatch(errorUtil, /\[object Object\]/);
});

test('bootstrap dimension completion does not refresh content mid-run', () => {
  const app = read('src/App.tsx');
  const hook = read('src/hooks/useGenerateSocket.ts');

  assert.match(app, /bootstrap\.isAllDone[\s\S]*fetchData\(\)/);
  assert.doesNotMatch(app, /candidateCreatedTick/);
  assert.doesNotMatch(app, /setTimeout\(\(\) => fetchData\(\), 2000\)/);
  assert.doesNotMatch(hook, /candidateCreatedTick/);
  assert.doesNotMatch(hook, /setCandidateCreatedTick/);
});

test('jobs process timeline consumes typed events contract', () => {
  const api = read('src/api/jobs.ts');
  const hook = read('src/hooks/useJobProcessEvents.ts');
  const eventUtils = read('src/utils/JobProcessEvents.ts');
  const jobs = read('src/components/Views/JobsView.tsx');
  const bootstrap = read('src/components/Views/GenerateProgressView.tsx');

  assert.match(api, /interface JobProcessDeveloperView/);
  assert.match(api, /interface JobProcessArtifactContent/);
  assert.match(api, /developerViews: JobProcessDeveloperView\[\]/);
  assert.match(api, /getJobProcessEvents\(jobId: string/);
  assert.match(api, /`\/jobs\/\$\{encodeURIComponent\(jobId\)\}\/events`/);
  assert.match(api, /normalizeJobProcessArtifactRequestPath\(jobId: string, ref: string\)/);
  assert.match(api, /Artifact ref points to a different job/);
  assert.match(api, /getJobProcessArtifact\(jobId: string, artifactRef: JobProcessArtifactRef\)/);
  assert.match(api, /responseType: 'text'/);
  assert.match(api, /transformResponse: \[\(data\) => data\]/);
  assert.match(api, /export function normalizeProcessDeveloperView/);
  assert.match(api, /contentTextOrUndefined\(record\.content\)/);

  assert.match(hook, /job:process-event/);
  assert.match(hook, /afterSequence/);
  assert.match(hook, /mergeProcessEvents/);
  assert.match(hook, /socket\.io\.on\('reconnect'/);
  assert.match(hook, /normalizeProcessDeveloperView\(eventRecord, payload\.jobId\)/);
  assert.match(hook, /readJobProcessEventsDisplayCache\(jobId\)/);
  assert.match(hook, /writeJobProcessEventsDisplayCache\(jobId, merged/);
  assert.match(hook, /setContentExpanded/);

  assert.match(eventUtils, /JOB_PROCESS_EVENTS_CACHE_PREFIX = 'alembic\.dashboard\.jobProcessEvents\.v1'/);
  assert.match(eventUtils, /JOB_PROCESS_EVENTS_CACHE_TTL_MS = 6 \* 60 \* 60 \* 1000/);
  assert.match(eventUtils, /JOB_PROCESS_EVENTS_CACHE_JOB_LIMIT = 40/);
  assert.match(eventUtils, /JOB_PROCESS_EVENTS_CACHE_EVENT_LIMIT = 120/);
  assert.match(eventUtils, /cleanupJobProcessEventsDisplayCache/);
  assert.match(eventUtils, /expandedContentEventIds/);
  assert.match(eventUtils, /getProcessEventSemanticCategory/);
  assert.match(eventUtils, /metadata\?\.\[key\]/);
  assert.match(eventUtils, /dimension-findings/);
  assert.match(eventUtils, /tier-findings/);
  assert.match(eventUtils, /transition-nudge/);
  assert.match(eventUtils, /findingSources/);
  assert.match(eventUtils, /getProcessEventSemanticPriority/);
  assert.match(eventUtils, /JOB_PROCESS_EVENT_CONTENT_COLLAPSE_LINE_LIMIT = 10/);
  assert.match(eventUtils, /shouldCollapseProcessEventContentByDefault/);
  assert.match(eventUtils, /export function getProcessEventMetadataNumber/);
  assert.match(eventUtils, /export function getProcessEventMetadataBoolean/);
  assert.match(eventUtils, /export function getLlmOutputCompletenessHints/);
  assert.match(eventUtils, /visibleTextChars/);
  assert.match(eventUtils, /hasHiddenReasoningContent/);
  assert.match(eventUtils, /reasoningContentOmitted/);
  assert.match(eventUtils, /finishReason/);
  assert.match(eventUtils, /providerOutputTruncated/);
  assert.match(eventUtils, /contentTruncated/);

  assert.match(jobs, /JobProcessTimeline/);
  assert.match(jobs, /import \{ Drawer \} from '\.\.\/Layout\/Drawer'/);
  assert.match(jobs, /import PageOverlay from '\.\.\/Shared\/PageOverlay'/);
  assert.match(jobs, /import \{ useDrawerWide \} from '\.\.\/\.\.\/hooks\/useDrawerWide'/);
  assert.match(jobs, /artifactRefs/);
  assert.match(jobs, /ProcessEventItem/);
  assert.match(jobs, /formatProcessEventSemanticLabel\(event, text\.lang\)/);
  assert.match(jobs, /getLlmOutputCompletenessHints\(event, text\.lang\)/);
  assert.match(jobs, /getProcessEventSemanticKind\(event\)/);
  assert.match(jobs, /getProcessEventNudgeType\(event\)/);
  assert.match(jobs, /getProcessEventMetadataText\(event, 'findingCount'\)/);
  assert.match(jobs, /selectedTimelineJobId/);
  assert.match(jobs, /selectedTimelineDetail/);
  assert.match(jobs, /JobProcessEventDetailPanel/);
  assert.match(jobs, /selectedTimelineJob && \(/);
  assert.match(jobs, /onOpenTimeline=\{\(\) => setSelectedTimelineJobId\(job\.id\)\}/);
  assert.match(jobs, /type TimelineDisplayMode = 'default' \| 'compact'/);
  assert.match(jobs, /const \[timelineDisplayMode, setTimelineDisplayMode\] = useState<TimelineDisplayMode>\('default'\)/);
  assert.match(jobs, /role="group"[\s\S]*aria-label=\{text\.timelineModeTitle\}/);
  assert.match(jobs, /aria-pressed=\{timelineDisplayMode === mode\}/);
  assert.match(jobs, /displayMode=\{timelineDisplayMode\}/);
  assert.match(jobs, /const timelineSubtitleParts = \[/);
  assert.match(jobs, /subtitle=\{timelineSubtitleParts\.join\(' · '\)\}/);
  assert.match(jobs, /<PageOverlay className="z-30 flex justify-end overflow-hidden" onClick=\{onClose\}>/);
  assert.match(jobs, /<PageOverlay\.Backdrop className="bg-black\/20 backdrop-blur-sm dark:bg-black\/40" \/>/);
  assert.match(jobs, /const \{ isWide: drawerWide, toggle: toggleDrawerWide \} = useDrawerWide\(\)/);
  assert.match(jobs, /const closeTimelineDetail = \(\) => setSelectedTimelineDetail\(null\)/);
  assert.match(jobs, /selectedTimelineDetail[\s\S]*setSelectedTimelineDetail\(null\)[\s\S]*onClose\(\)/);
  assert.match(jobs, /const stackedPanelWidth = drawerWide \? 'w-\[min\(92vw,960px\)\]' : 'w-\[min\(92vw,700px\)\]'/);
  assert.match(jobs, /const timelinePanelWidth = selectedDetailEvent \? `\$\{stackedPanelWidth\} lg:w-\[min\(62vw,960px\)\]` : undefined/);
  assert.match(jobs, /const timelineDetailPanelWidth = `\$\{stackedPanelWidth\} lg:w-\[min\(34vw,560px\)\]`/);
  assert.match(jobs, /width=\{timelineDetailPanelWidth\}/);
  assert.match(jobs, /className="absolute inset-y-0 right-0 z-20 lg:static lg:z-auto lg:!border-l-0 lg:!shadow-none lg:border-r lg:border-r-\[var\(--border-default\)\]"/);
  assert.match(jobs, /<Drawer\.Panel[\s\S]*size=\{drawerWide \? 'lg' : 'md'\}[\s\S]*width=\{timelinePanelWidth\}/);
  assert.match(jobs, /<Drawer\.WidthToggle isWide=\{drawerWide\} onToggle=\{toggleDrawerWide\} \/>/);
  assert.match(jobs, /<JobProcessEventDetailPanel[\s\S]*onClose=\{closeTimelineDetail\}/);
  assert.match(jobs, /<Drawer\.CloseButton onClose=\{onClose\} \/>/);
  assert.match(jobs, /<Drawer\.Body padded=\{false\} className="min-h-0 overflow-hidden">/);
  assert.match(jobs, /ref=\{timelineListRef\}/);
  assert.match(jobs, /scrollTimelineToBottom\(timelineListRef\.current\)/);
  assert.match(jobs, /className="h-full overflow-y-auto overflow-x-hidden px-5 py-4 text-\[#0f172a\] overscroll-contain dark:text-\[#e2e8f0\]"/);
  assert.match(jobs, /const contentToggle = event\.content && contentShouldCollapse \? \(/);
  assert.match(jobs, /const detailButton = hasDetail \? \(/);
  assert.match(jobs, /onOpenDetails\(artifactRefs\[0\]\)/);
  assert.match(jobs, /items-start justify-between/);
  assert.match(jobs, /event\.content && effectiveContentExpanded && \(/);
  assert.match(jobs, /text\.timelineProjection/);
  assert.match(jobs, /text\.projectionHint/);
  assert.match(jobs, /text\.fullArtifact/);
  assert.match(jobs, /api\.getJobProcessArtifact\(event\.jobId, selectedArtifactRef\)/);
  assert.match(jobs, /artifactState\.status === 'empty'/);
  assert.match(jobs, /artifactState\.status === 'loading'/);
  assert.match(jobs, /artifactState\.status === 'error'/);
  assert.match(jobs, /artifactState\.status === 'success'/);
  assert.match(jobs, /getProcessEventRecordMetadata\(event, 'llmMetrics'\)/);
  assert.match(jobs, /getProcessEventRecordMetadata\(event, 'traceEnvelope'\)/);
  assert.match(jobs, /getArtifactMetadataItems\(event\)/);
  assert.match(jobs, /hasProcessEventDetail\(event\)/);
  assert.match(jobs, /displayMode === 'default' \? getLlmOutputCompletenessHints\(event, text\.lang\) : \[\]/);
  assert.match(jobs, /aria-label=\{text\.outputCompleteness\}/);
  assert.match(jobs, /getLlmOutputCompletenessToneClass\(hint\.tone\)/);
  assert.match(jobs, /displayMode === 'default' && metaItems\.length > 0/);
  assert.match(jobs, /node\.scrollTop = node\.scrollHeight/);
  assert.match(jobs, /isLlmProcessEvent/);
  assert.match(jobs, /onContentExpandedChange\(!contentExpanded\)/);
  assert.match(jobs, /max-w-full whitespace-pre-wrap break-all/);
  assert.doesNotMatch(jobs, /\{visibleEvents\.length\} \{text\.timelineCount\}/);
  assert.doesNotMatch(jobs, /contentCollapsed/);
  assert.doesNotMatch(jobs, /border-\[#cbd5e1\] bg-white p-3/);
  assert.doesNotMatch(jobs, /<Drawer open=\{open\} onClose=\{onClose\} size="full">/);
  assert.doesNotMatch(jobs, /lg:grid-cols-\[minmax\(0,1fr\)_minmax\(340px,460px\)\]/);
  assert.doesNotMatch(jobs, /backToTimeline/);
  assert.doesNotMatch(jobs, /w-full lg:w-\[min\(34vw,460px\)\]/);
  assert.doesNotMatch(jobs, /w-\[min\(96vw,1280px\)\]/);
  assert.doesNotMatch(jobs, /line-clamp|max-h-\[/);
  assert.doesNotMatch(jobs, /bg-\[#080b10\]/);
  assert.doesNotMatch(jobs, /isLlmEvent &&/);
  assert.doesNotMatch(jobs, /raw\s*log/i);

  assert.match(bootstrap, /BootstrapProcessSummary/);
  assert.match(bootstrap, /onOpenJobDetails/);
  assert.match(bootstrap, /pickKeyProcessEvents/);
  assert.match(bootstrap, /getProcessEventPreviewText\(event, 180\)/);
  assert.match(bootstrap, /getBootstrapProcessEventTone/);
  assert.match(bootstrap, /formatProcessEventSemanticLabel\(event, lang\)/);
});

test('jobs process terminal readability rules are enforced in the DOM contract', () => {
  const eventUtils = read('src/utils/JobProcessEvents.ts');
  const jobs = read('src/components/Views/JobsView.tsx');

  assert.match(eventUtils, /JOB_PROCESS_EVENT_CONTENT_COLLAPSE_LINE_LIMIT = 10/);
  assert.match(eventUtils, /getProcessEventContentLineCount\(event\.content\) > JOB_PROCESS_EVENT_CONTENT_COLLAPSE_LINE_LIMIT/);
  assert.match(eventUtils, /getProcessEventSemanticCategory\(event\) === 'transition'/);
  assert.match(eventUtils, /return false;[\s\S]*getProcessEventContentLineCount/);

  assert.match(jobs, /shouldCollapseProcessEventContentByDefault\(event\)/);
  assert.match(jobs, /const effectiveContentExpanded = Boolean\(event\.content\) && \(!contentShouldCollapse \|\| contentExpanded\)/);
  assert.match(jobs, /event\.content && contentShouldCollapse \? \(/);
  assert.match(jobs, /data-process-event-sequence=\{event\.sequence\}/);
  assert.match(jobs, /text-\[#0f172a\]/);
  assert.match(jobs, /text-\[#1e293b\]/);
  assert.match(jobs, /text-\[#475569\]/);
  assert.match(jobs, /dark:text-\[#f8fafc\]/);
  assert.match(jobs, /dark:text-\[#e2e8f0\]/);
  assert.match(jobs, /dark:text-\[#cbd5e1\]/);
  assert.match(jobs, /dark:text-\[#94a3b8\]/);
  assert.match(jobs, /bg-blue-50 text-blue-700 dark:border-blue-400\/30 dark:bg-blue-400\/10 dark:text-blue-300/);
  assert.match(jobs, /bg-violet-50 text-violet-700 dark:border-violet-400\/30 dark:bg-violet-400\/10 dark:text-violet-300/);
  assert.doesNotMatch(jobs, /text-slate-500">\{formatEventTimestamp/);
  assert.doesNotMatch(jobs, /border-slate-800 bg-slate-900\/80/);
  assert.doesNotMatch(jobs, /bg-slate-900/);
  assert.doesNotMatch(jobs, /text-slate-100/);
});

test('jobs display snapshot viewer consumes the persisted snapshot contract', () => {
  const api = read('src/api/jobs.ts');
  const jobs = read('src/components/Views/JobsView.tsx');

  assert.match(api, /interface JobDisplaySnapshotSummaryRef extends JobDisplaySnapshotRef/);
  assert.match(api, /interface JobDisplaySnapshotResponse/);
  assert.match(api, /displaySnapshot\?: JobDisplaySnapshotSummaryRef \| null/);
  assert.match(api, /displaySnapshotUrl\?: string/);
  assert.match(api, /export function normalizeJobDisplaySnapshotSummaryRef/);
  assert.match(api, /function normalizeJobDisplaySnapshotResponse\(value: unknown, fallbackJobId: string\)/);
  assert.match(api, /async getJobDisplaySnapshot\(jobId: string\)/);
  assert.match(api, /`\/jobs\/\$\{encodeURIComponent\(jobId\)\}\/display-snapshot`/);
  assert.match(api, /return normalizeJobDisplaySnapshotResponse\(res\.data\?\.data, jobId\)/);
  assert.match(api, /warnings: normalizeJobDisplaySnapshotWarnings\(record\.warnings\)/);
  assert.match(api, /evidenceIncomplete: normalizeJobDisplaySnapshotEvidenceIncomplete\(record\.evidenceIncomplete\)/);
  assert.match(api, /entries: normalizeJobDisplaySnapshotLlmIoEntries\(llmIo\.entries\)/);
  assert.match(api, /sourceRefs: normalizeJobDisplaySnapshotEvidenceItems\(record\.sourceRefs\)/);
  assert.match(api, /findings: normalizeJobDisplaySnapshotEvidenceItems\(record\.findings\)/);
  assert.match(api, /candidates: normalizeJobDisplaySnapshotEvidenceItems\(record\.candidates\)/);

  assert.match(jobs, /selectedSnapshotJobId/);
  assert.match(jobs, /selectedSnapshotJob && \(/);
  assert.match(jobs, /JobDisplaySnapshotPanel/);
  assert.match(jobs, /onOpenSnapshot=\{\(\) => setSelectedSnapshotJobId\(job\.id\)\}/);
  assert.match(jobs, /normalizeJobDisplaySnapshotSummaryRef\(job\.displaySnapshot\)/);
  assert.match(jobs, /<SnapshotSummaryBlock summary=\{snapshotSummary\} text=\{text\} \/>/);
  assert.match(jobs, /api\.getJobDisplaySnapshot\(job\.id\)/);
  assert.match(jobs, /text\.snapshotUnavailable/);
  assert.match(jobs, /snapshotState\.response\.persisted \? text\.snapshotPersisted : text\.snapshotNotPersisted/);
  assert.match(jobs, /const allIncomplete = \[\.\.\.snapshot\.evidenceIncomplete, \.\.\.snapshot\.llmIo\.evidenceIncomplete\]/);
  assert.match(jobs, /snapshot\.phaseTimeline/);
  assert.match(jobs, /snapshot\.warnings/);
  assert.match(jobs, /snapshot\.llmIo\.entries/);
  assert.match(jobs, /snapshot\.developerViews\.length > 0 \? snapshot\.developerViews : snapshot\.events/);
  assert.match(jobs, /snapshot\.findings/);
  assert.match(jobs, /snapshot\.candidates/);
  assert.match(jobs, /snapshot\.sourceRefs/);
  assert.match(jobs, /SnapshotTextBlock/);
  assert.match(jobs, /overflow-x-hidden whitespace-pre-wrap break-all/);
  assert.doesNotMatch(jobs, /readJobProcessEventsDisplayCache\(.*snapshot/i);
  assert.doesNotMatch(jobs, /localStorage[\s\S]*displaySnapshot/i);
});

test('recipe evolution drawer uses the same responsive stack pattern as timeline details', () => {
  const recipes = read('src/components/Views/RecipesView.tsx');
  assert.match(recipes, /<PageOverlay className="z-30 flex justify-end overflow-hidden" onClick=\{closeDrawer\}>/);
  assert.match(recipes, /const closeEvolutionPanel = \(\) => setShowEvolution\(false\)/);
  assert.match(recipes, /const stackedPanelWidth = drawerWide \? 'w-\[min\(92vw,960px\)\]' : 'w-\[min\(92vw,700px\)\]'/);
  assert.match(recipes, /const recipePanelWidth = showEvolution[\s\S]*\$\{stackedPanelWidth\} lg:w-\[min\(62vw,960px\)\][\s\S]*undefined/);
  assert.match(recipes, /const evolutionPanelWidth = `\$\{stackedPanelWidth\} lg:w-\[min\(34vw,560px\)\]`/);
  assert.match(recipes, /closeEvolutionOnEscape[\s\S]*setShowEvolution\(false\)/);
  assert.match(recipes, /width=\{evolutionPanelWidth\}/);
  assert.match(recipes, /className="absolute inset-y-0 right-0 z-20 lg:static lg:z-auto lg:!border-l-0 lg:!shadow-none lg:border-r lg:border-r-\[var\(--border-default\)\]"/);
  assert.match(recipes, /<Drawer\.CloseButton onClose=\{closeEvolutionPanel\} \/>/);
  assert.match(recipes, /<Drawer\.Panel size=\{drawerWide \? 'lg' : 'md'\} width=\{recipePanelWidth\}>/);

  assert.doesNotMatch(recipes, /backToRecipe/);
  assert.doesNotMatch(recipes, /ChevronLeft/);
  assert.doesNotMatch(recipes, /<Drawer\.Panel size="sm" className="!border-l-0 !shadow-none border-r border-r-\[var\(--border-default\)\]">/);
  assert.doesNotMatch(recipes, /<PageOverlay className="z-30 flex justify-end" onClick=\{closeDrawer\}>/);
});

test('jobs view lets the page scroll without inner list scrolling', () => {
  const app = read('src/App.tsx');
  const jobs = read('src/components/Views/JobsView.tsx');

  assert.match(app, /min-h-0 flex-1/);
  assert.match(app, /overflow-y-auto overflow-x-hidden/);
  assert.match(app, /activeTab === 'jobs' \? 'min-h-full min-w-0'/);
  assert.match(jobs, /flex min-h-full min-w-0 flex-col overflow-x-hidden/);
  assert.match(jobs, /const JOBS_PAGE_SIZE = 6/);
  assert.match(jobs, /paginatedJobs\.map/);
  assert.match(jobs, /focusedIndex \/ JOBS_PAGE_SIZE/);
  assert.match(jobs, /formatJobsPageSummary\(currentPage, totalPages, filteredJobs\.length, text\)/);
  assert.match(jobs, /<div className="max-w-full overflow-x-hidden">/);
  assert.match(jobs, /<div className="space-y-3">/);
  assert.match(jobs, /rounded-xl border border-\[var\(--border-default\)\] bg-\[var\(--bg-surface\)\] p-4/);
  assert.match(jobs, /sm:flex-row sm:items-center sm:justify-between/);
  assert.match(jobs, /border-y border-\[var\(--border-muted\)\] py-2/);
  assert.match(jobs, /gap-x-6 gap-y-2/);
  assert.match(jobs, /md:grid-cols-2/);
  assert.match(jobs, /<Meta label=\{text\.created\} value=\{formatDate\(job\.createdAt\)\} \/>[\s\S]*<Meta label=\{text\.updated\} value=\{formatDate\(job\.updatedAt\)\} \/>/);
  assert.match(jobs, /getCurrentDimensionLabel\(job\)/);
  assert.match(jobs, /flex min-w-0 flex-wrap items-baseline gap-x-1\.5/);
  assert.match(jobs, /text-\[11px\] leading-5 text-\[var\(--fg-muted\)\]/);
  assert.match(jobs, /min-w-0 break-words font-medium leading-5/);
  assert.match(jobs, /badgeIssue && <IssueBadge issue=\{badgeIssue\} text=\{text\} \/>/);
  assert.match(jobs, /blockIssue && <EvidenceIssueBlock issue=\{blockIssue\} text=\{text\} \/>/);
  assert.match(jobs, /function isDuplicateStatusIssue/);
  assert.match(jobs, /function isCancelledStatusIssue/);
  assert.match(jobs, /return formatEvidenceIssueLabel\(issue, text\.lang\);/);
  assert.match(jobs, /max-w-full break-words/);
  assert.doesNotMatch(jobs, /lastEvent/);
  assert.doesNotMatch(jobs, /RuntimeStateBlock/);
  assert.doesNotMatch(jobs, /resolveJobActivityAt/);
  assert.doesNotMatch(jobs, /key: 'progressUpdatedAt'/);
  assert.doesNotMatch(jobs, /hover:border-\[var\(--border-strong\)\] hover:bg-\[var\(--bg-subtle\)\]/);
  assert.doesNotMatch(jobs, /max-w-full overflow-x-hidden rounded-xl border border-\[var\(--border-default\)\] bg-\[var\(--bg-surface\)\] shadow-sm/);
  assert.doesNotMatch(jobs, /divide-y divide-\[var\(--border-muted\)\]/);
  assert.doesNotMatch(jobs, /min-h-0 flex-1 overflow-y-auto/);
});

test('guard view keeps narrow screens from overflowing on long audit paths', () => {
  const app = read('src/App.tsx');
  const guard = read('src/components/Views/GuardView.tsx');

  assert.ok(app.includes('<main className="flex-1 min-w-0 flex flex-col overflow-hidden relative">'));
  assert.ok(guard.includes('flex-1 flex min-w-0 flex-col overflow-hidden'));
  assert.ok(guard.includes('overflow-x-auto px-1 pb-1 scrollbar-hidden'));
  assert.ok(guard.includes('min-w-0 flex-1 break-all font-mono text-xs text-[var(--fg-primary)] sm:text-sm sm:truncate'));
  assert.ok(guard.includes('max-w-full break-all font-mono text-xs text-[var(--fg-secondary)]'));
  assert.ok(guard.includes('overflow-x-hidden whitespace-pre-wrap break-all'));
  assert.ok(guard.includes('<table className="min-w-[760px] w-full text-sm">'));
  assert.ok(guard.includes('break-all font-mono text-[11px] text-indigo-500'));
  assert.ok(guard.includes('flex min-w-0 flex-col gap-2 p-3 rounded-lg'));
  assert.ok(guard.includes('min-w-0 flex-1 break-all text-xs text-[var(--fg-secondary)] sm:truncate'));
});

test('socket process events share REST content normalization', () => {
  // W7-f split: the shared content normalizer lives in the api client family;
  // its jobs-side consumption lives in the jobs family.
  const apiClient = read('src/api/client.ts');
  const apiJobs = read('src/api/jobs.ts');
  const hook = read('src/hooks/useJobProcessEvents.ts');

  assert.match(apiClient, /function contentTextOrUndefined\(value: unknown\)/);
  assert.match(apiClient, /stringOrUndefined\(record\.text\)/);
  assert.match(apiClient, /JSON\.stringify\(value, null, 2\)/);
  assert.match(apiJobs, /const content = contentTextOrUndefined\(record\.content\)/);
  assert.match(apiJobs, /content,/);

  assert.doesNotMatch(hook, /\.\.\.payload\.event,\s*\n\s*jobId:/);
  assert.match(hook, /event\?: unknown/);
  assert.match(hook, /normalizeProcessDeveloperView\(eventRecord, payload\.jobId\)/);
  assert.match(hook, /socket\.on\('job:process-event', onProcessEvent\)/);
  assert.match(hook, /mergeProcessEvents\(prev, \[event\]\)/);
  assert.match(hook, /writeJobProcessEventsDisplayCache\(jobId, merged/);
  assert.match(hook, /socket\.io\.on\('reconnect', recover\)/);
  assert.match(hook, /setInterval\(\(\) => fetchEvents\('incremental'\), 5000\)/);
  assert.doesNotMatch(hook, /socketAppendQueue|SOCKET_APPEND|appendNextQueued|ensureSocketAppend/);
});

test('dashboard replays accepted Alembic provider fixtures through executable normalizers', async () => {
  const provider = await importAlembicProviderContracts();
  const apiModule = await importTranspiled('src/api/index.ts');
  const eventUtils = await importTranspiled('src/utils/JobProcessEvents.ts');
  const fixtures = provider.ALEMBIC_PROVIDER_FIXTURES;
  const eventContracts = provider.ALEMBIC_PROVIDER_EVENT_CONTRACTS;
  const routeContracts = provider.ALEMBIC_PROVIDER_ROUTE_CONTRACTS;

  assert.ok(routeContracts.some((route) => route.operationId === 'listProjects'));
  assert.ok(routeContracts.some((route) => route.operationId === 'getProjectScope'));
  assert.ok(routeContracts.some((route) => route.operationId === 'listJobProcessEvents'));
  assert.ok(routeContracts.some((route) => route.operationId === 'getJobDisplaySnapshot'));
  assert.ok(
    eventContracts.some((event) => event.transport === 'rest-recovery' && event.eventName === 'job-process-events'),
  );
  assert.ok(
    eventContracts.some((event) => event.transport === 'socket.io' && event.eventName === 'job:process-event'),
  );

  const visibleEvent = providerFixture(fixtures, 'job-event.visible');
  const directEvent = apiModule.normalizeProcessDeveloperView(visibleEvent.payload.event, visibleEvent.payload.jobId);
  assert.equal(directEvent.jobId, 'job-bootstrap-1');
  assert.equal(directEvent.kind, 'bootstrap');
  assert.equal(directEvent.title, 'bootstrap');
  assert.equal(directEvent.content, 'Indexed project files.');

  const recoveredEvents = apiModule.normalizeJobProcessEventsResponse(
    visibleEvent.payload,
    visibleEvent.payload.jobId,
  );
  assert.equal(recoveredEvents.developerViews.length, 1);
  assert.equal(recoveredEvents.developerViews[0].eventId, 'evt-1');
  assert.equal(recoveredEvents.nextSequence, 2);

  const mergedEvents = eventUtils.mergeProcessEvents([], recoveredEvents.developerViews);
  assert.deepEqual(mergedEvents.map((event) => event.eventId), ['evt-1']);

  const partialEvents = providerFixture(fixtures, 'job-event.partial');
  const normalizedPartialEvents = apiModule.normalizeJobProcessEventsResponse(
    partialEvents.payload,
    partialEvents.payload.jobId,
  );
  assert.equal(normalizedPartialEvents.retainedCount, 50);
  assert.equal(normalizedPartialEvents.developerViews.length, 0);

  const snapshotFixture = providerFixture(fixtures, 'job-snapshot.success');
  const normalizedSnapshot = apiModule.normalizeJobDisplaySnapshotResponse(
    snapshotFixture.payload,
    'job-bootstrap-1',
  );
  assert.equal(normalizedSnapshot.persisted, true);
  assert.equal(normalizedSnapshot.snapshot.snapshot.jobId, 'job-bootstrap-1');
  assert.equal(normalizedSnapshot.snapshot.snapshot.snapshotVersion, 1);

  const projectsFixture = providerFixture(fixtures, 'project-runtime.success');
  const normalizedProjects = apiModule.normalizeProjectsSnapshot(projectsFixture.payload);
  assert.equal(normalizedProjects.state.activeProjectId, 'project-alpha');
  assert.equal(normalizedProjects.projects[0].projectId, 'project-alpha');

  const scopeFixture = providerFixture(fixtures, 'project-scope.success');
  const normalizedScope = apiModule.normalizeProjectScopeResponse(scopeFixture.payload);
  assert.equal(normalizedScope.summary.projectScopeId, 'scope-alpha');
  assert.equal(normalizedScope.summary.folders[0].path, 'src');
  assert.equal(normalizedScope.summary.folders[0].displayName, 'src');

  const normalizedFolders = apiModule.normalizeProjectScopeFoldersResponse(scopeFixture.payload);
  assert.deepEqual(normalizedFolders.folders.map((folder) => folder.path), ['src']);
});

test('dashboard uses canonical host source labels without legacy IDE mappings', async () => {
  const labels = await importTranspiled('src/utils/SourceLabels.ts');
  const t = (key) => `translated:${key}`;

  const hostAgent = labels.getSourceLabelInfo('host-agent');
  assert.equal(hostAgent.compatibility, undefined);
  assert.equal(hostAgent.disposition, 'provider-source');
  assert.equal(labels.formatSourceLabel('host-agent', t), 'translated:sources.hostAgent');

  const hostEdit = labels.getSourceLabelInfo('host-edit');
  assert.equal(hostEdit.compatibility, undefined);
  assert.equal(hostEdit.disposition, 'provider-source');
  assert.equal(labels.formatSourceLabel('host-edit', t), 'translated:sources.hostEdit');

  // CR3 test-only negative fixture for retired source labels.
  // Owner: AlembicDashboard contract tests. Cleanup trigger: remove after
  // source scans prove no provider or persisted fixture can emit these labels.
  const retired = labels.getSourceLabelInfo('ide-agent');
  assert.equal(retired.compatibility, undefined);
  assert.equal(retired.disposition, 'unmapped-display');
  assert.equal(labels.formatSourceLabel('ide-agent', t), 'ide-agent');

  const unknown = labels.getSourceLabelInfo('custom-importer');
  assert.equal(unknown.disposition, 'unmapped-display');
  assert.equal(labels.formatSourceLabel('custom-importer', t), 'custom-importer');
});

test('dashboard public governance copy avoids retired runtime role claims', () => {
  const publicSurface = [
    read('src/i18n/locales/en.ts'),
    read('src/i18n/locales/zh.ts'),
    read('src/components/Views/HelpView.tsx'),
  ].join('\n');

  for (const retiredClaim of [
    /3-role RBAC/i,
    /3 角色 RBAC/,
    /developer\s*\(full\)/i,
    /开发者全权限/,
    /developer full access/i,
    /Gateway permissions \/ constitution \/ audit/i,
    /Gateway 权限 \/ 宪法 \/ 审计/,
    /Constitution governance/i,
    /宪法治理/,
    /Agent\s*\/\s*Admin layered/i,
    /Agent\s*\/\s*Admin 分层/,
  ]) {
    assert.doesNotMatch(publicSurface, retiredClaim);
  }

  const permissionHook = read('src/hooks/usePermission.ts');
  assert.match(permissionHook, /local-write/);
  assert.match(permissionHook, /agent-submit/);
  assert.doesNotMatch(permissionHook, /ROLE_PERMISSIONS|Constitution 角色|role === 'developer'|'developer': \['\*'\]|项目 Owner/);
});

test('runtime boundary consumes canonical file monitor event sources only', async () => {
  const apiModule = await importTranspiled('src/api/index.ts');
  const boundary = apiModule.normalizeRuntimeBoundary({}, cloneWithRetiredProviderCompatibilityFields({
    mode: 'daemon',
    projectRoot: '/workspace/alembic',
    capabilities: {
      fileMonitor: {
        available: true,
        acceptedEventSources: ['file-change'],
      },
    },
  }));

  assert.deepEqual(boundary.capabilities.fileMonitor.acceptedEventSources, ['file-change']);
  assert.equal('compatibilityAliases' in boundary.capabilities.fileMonitor, false);
  assert.equal('compatibilityAliasPolicy' in boundary.capabilities.fileMonitor, false);
});

test('knowledge save uses a typed provider payload projector', async () => {
  const app = read('src/App.tsx');
  const api = read('src/api/knowledge.ts');
  const payload = await importTranspiled('src/KnowledgePayload.ts');
  const projected = payload.buildKnowledgeCreatePayload({
    title: 'Typed boundary',
    description: 'No wide bag',
    trigger: 'unused',
    language: 'ts',
    category: 'interfaces',
    tags: ['contract'],
    source: 'host-agent',
    content: { pattern: 'const ok = true;' },
    reasoning: { whyStandard: 'provider contract', sources: ['fixture'], confidence: 0.8 },
    quality: { overall: 0.9 },
    stats: { applications: 1 },
    headers: ['A.h'],
    headerPaths: ['Sources/A.h'],
    includeHeaders: true,
  }, ['typed-boundary']);

  assert.equal(projected.title, 'Typed boundary');
  assert.equal(projected.trigger, 'typed-boundary');
  assert.equal(projected.kind, 'pattern');
  assert.deepEqual(projected.headerPaths, ['Sources/A.h']);
  assert.equal(projected.includeHeaders, true);
  assert.match(app, /buildKnowledgeCreatePayload\(extracted, triggers\)/);
  assert.doesNotMatch(app, /const v3Data: Record<string, any>/);
  assert.match(api, /knowledgeCreate\(data: KnowledgeCreatePayload\)/);
});

test('dashboard chat page and drawer surfaces are removed', () => {
  const app = read('src/App.tsx');
  const constants = read('src/constants/index.ts');
  const sidebar = read('src/components/Layout/Sidebar.tsx');
  const commandPalette = read('src/components/Layout/CommandPalette.tsx');
  const header = read('src/components/Layout/Header.tsx');
  const pageOverlay = read('src/components/Shared/PageOverlay.tsx');
  const api = readApiDir();
  const zh = read('src/i18n/locales/zh.ts');
  const en = read('src/i18n/locales/en.ts');

  for (const removedPath of [
    'src/components/Views/AiChatView.tsx',
    'src/components/Shared/GlobalChatDrawer.tsx',
    'src/hooks/useChatStream.ts',
    'src/hooks/useChatTopics.ts',
  ]) {
    assert.equal(existsSync(path.join(root, removedPath)), false, `${removedPath} should be deleted`);
  }

  assert.doesNotMatch(app, /AiChatView|activeTab === ['"]ai['"]/);
  assert.doesNotMatch(constants, /['"]ai['"]/);
  assert.doesNotMatch(sidebar, /sidebar\.aiAssistant|MessageSquare/);
  assert.doesNotMatch(commandPalette, /sidebar\.aiAssistant|MessageSquare/);
  assert.doesNotMatch(header, /sidebar\.aiAssistant/);
  assert.doesNotMatch(pageOverlay, /GlobalChat|CHAT_PANEL_WIDTH|chatOpen/);
  assert.doesNotMatch(api, /async chatStream|async chat\(|\/api\/v1\/ai\/chat|projectSseChatDone|ChatStreamDoneProjection/);
  assert.doesNotMatch(zh, /aiChat:|globalChat:|chatStream:|chatAgent|roleChatAgent|openAiChat|closeAiChat/);
  assert.doesNotMatch(en, /aiChat:|globalChat:|chatStream:|chatAgent|roleChatAgent|openAiChat|closeAiChat/);
});

test('dashboard wiki page surfaces are removed', () => {
  const app = read('src/App.tsx');
  const constants = read('src/constants/index.ts');
  const sidebar = read('src/components/Layout/Sidebar.tsx');
  const commandPalette = read('src/components/Layout/CommandPalette.tsx');
  const header = read('src/components/Layout/Header.tsx');
  const api = readApiDir();
  const help = read('src/components/Views/HelpView.tsx');
  const zh = read('src/i18n/locales/zh.ts');
  const en = read('src/i18n/locales/en.ts');
  const css = read('src/index.css');

  assert.equal(existsSync(path.join(root, 'src/components/Views/WikiView.tsx')), false, 'WikiView page should be deleted');

  assert.doesNotMatch(app, /WikiView|activeTab === ['"]wiki['"]/);
  assert.doesNotMatch(constants, /['"]wiki['"]/);
  assert.doesNotMatch(sidebar, /sidebar\.repoWiki|tab:\s*['"]wiki['"]|BookOpen/);
  assert.doesNotMatch(commandPalette, /sidebar\.repoWiki|^\s*wiki:\s*FileText/m);
  assert.doesNotMatch(header, /sidebar\.repoWiki|['"]wiki['"]:/);
  assert.doesNotMatch(api, /\/wiki\/|wikiGenerate|wikiUpdate|wikiAbort|wikiStatus|wikiFiles|wikiFileContent/);
  assert.doesNotMatch(help, /wikiDocGen|wikiDocBullet/);
  assert.doesNotMatch(zh, /repoWiki|wiki:\s*\{|wikiDocGen|wikiDocBullet|wikiGenerating|aiBadge/);
  assert.doesNotMatch(en, /repoWiki|wiki:\s*\{|wikiDocGen|wikiDocBullet|wikiGenerating|aiBadge/);
  assert.doesNotMatch(css, /wiki-reader/);
});

test('dashboard signal page surfaces are removed while core dashboard views remain', () => {
  const app = read('src/App.tsx');
  const constants = read('src/constants/index.ts');
  const sidebar = read('src/components/Layout/Sidebar.tsx');
  const commandPalette = read('src/components/Layout/CommandPalette.tsx');
  const header = read('src/components/Layout/Header.tsx');
  const jobs = read('src/components/Views/JobsView.tsx');
  const api = readApiDir();
  const efficiency = read('src/utils/efficiency.ts');
  const zh = read('src/i18n/locales/zh.ts');
  const en = read('src/i18n/locales/en.ts');

  for (const removedPath of [
    'src/components/Views/SignalReportView.tsx',
    'src/components/Panels/SignalMonitor.tsx',
  ]) {
    assert.equal(existsSync(path.join(root, removedPath)), false, `${removedPath} should be deleted`);
  }

  assert.doesNotMatch(app, /SignalReportView|activeTab === ['"]signals['"]|navigateToTab\(['"]signals['"]/);
  assert.doesNotMatch(constants, /['"]signals['"]/);
  assert.doesNotMatch(sidebar, /sidebar\.signals|tab:\s*['"]signals['"]|Radio/);
  assert.doesNotMatch(commandPalette, /sidebar\.signals|^\s*signals:\s*Radio/m);
  assert.doesNotMatch(header, /sidebar\.signals|['"]signals['"]:/);
  assert.doesNotMatch(jobs, /onOpenReports|navigateToTab\(['"]signals['"]|reports:/);
  assert.doesNotMatch(
    api,
    /getSignalTrace|getSignalStats|getReports|\/signals\/(?:trace|stats|reports)|listBootstrapReports|getBootstrapReportLatest|getBootstrapReport\(|diffBootstrapReports|SignalEntry|ReportEntry|BootstrapReportSummary|BootstrapReportDimension|interface BootstrapReport/,
  );
  assert.doesNotMatch(efficiency, /getReportEfficiency|getReportDimensionEfficiencies|BootstrapReport/);
  assert.doesNotMatch(zh, /sidebar\.signals|signals:\s*\{|openMonitor|closeMonitor|信号 & 报告中心/);
  assert.doesNotMatch(en, /sidebar\.signals|signals:\s*\{|openMonitor|closeMonitor|Signal & Report Center/);

  for (const preservedView of [
    'RecipesView',
    'CandidatesView',
    'KnowledgeView',
    'GuardView',
    'JobsView',
    'GenerateProgressView',
    'SkillsView',
  ]) {
    assert.match(app, new RegExp(preservedView), `${preservedView} should remain mounted by App`);
  }

  for (const preservedTab of [
    'recipes',
    'candidates',
    'knowledge',
    'guard',
    'jobs',
    'skills',
    'help',
  ]) {
    assert.match(constants, new RegExp(`['"]${preservedTab}['"]`), `${preservedTab} tab should remain valid`);
  }

  assert.match(api, /async listJobs/);
  assert.match(api, /async listSkills/);
  assert.match(api, /async knowledgeList/);
  assert.match(api, /async getGuardReport/);
  assert.match(api, /async promoteCandidateToRecipe/);
});

test('dashboard restores the Panorama four-tab contract on P2 endpoints', () => {
  const app = read('src/App.tsx');
  const constants = read('src/constants/index.ts');
  const sidebar = read('src/components/Layout/Sidebar.tsx');
  const commandPalette = read('src/components/Layout/CommandPalette.tsx');
  const header = read('src/components/Layout/Header.tsx');
  const panorama = read('src/components/Views/PanoramaView.tsx');
  const depGraph = read('src/components/Views/DepGraphView.tsx');
  const knowledgeGraph = read('src/components/Views/KnowledgeGraphView.tsx');
  const api = read('src/api/panorama.ts');
  const generated = read('src/generated/api-types.ts');
  const zh = read('src/i18n/locales/zh.ts');
  const en = read('src/i18n/locales/en.ts');

  assert.equal(existsSync(path.join(root, 'src/components/Views/ProjectPyramidView.tsx')), false);
  assert.equal(existsSync(path.join(root, 'src/components/Views/PanoramaView.tsx')), true);
  assert.equal(existsSync(path.join(root, 'src/components/Views/DepGraphView.tsx')), true);
  assert.equal(existsSync(path.join(root, 'src/components/Views/KnowledgeGraphView.tsx')), true);

  assert.match(app, /PanoramaView/);
  assert.match(app, /activeTab === ['"]panorama['"]/);
  assert.match(constants, /['"]panorama['"]/);
  assert.doesNotMatch(constants, /project-pyramid/);
  assert.match(sidebar, /tab:\s*['"]panorama['"]/);
  assert.match(commandPalette, /panorama:\s*Layers/);
  assert.match(header, /panorama:\s*['"]sidebar\.panorama['"]/);
  assert.doesNotMatch(`${sidebar}\n${commandPalette}\n${header}`, /projectPyramid|project-pyramid/);

  for (const tab of ['overview', 'dependencies', 'graph', 'gaps']) {
    assert.match(panorama, new RegExp(`key:\\s*['"]${tab}['"]`), `${tab} Panorama tab should be restored`);
  }
  for (const endpoint of ['/panorama', '/panorama/health', '/panorama/gaps']) {
    assert.match(api, new RegExp(endpoint.replaceAll('/', '\\/')), `${endpoint} should be called by the Panorama API family`);
    assert.match(generated, new RegExp(`"path": "${endpoint}"`), `${endpoint} should be present in the generated API contract`);
  }
  for (const operationId of ['getPanoramaOverview', 'getPanoramaHealth', 'getPanoramaGaps']) {
    assert.match(generated, new RegExp(`"operationId": "${operationId}"`));
  }

  assert.match(panorama, /DepGraphView/);
  assert.match(panorama, /KnowledgeGraphView/);
  assert.match(depGraph, /api\.getDepGraph/);
  assert.match(knowledgeGraph, /api\.getKnowledgeGraph/);
  assert.match(knowledgeGraph, /api\.getGraphStats/);

  for (const role of ['app', 'core', 'foundation', 'service', 'networking', 'storage', 'model', 'ui', 'routing', 'utility', 'auth', 'feature', 'config', 'test']) {
    assert.match(panorama, new RegExp(`${role}:`), `${role} role label should remain in Panorama`);
  }
  assert.match(api, /recipeCount:\s*number \| null/);
  assert.match(panorama, /recipeCount === null/);
  assert.match(panorama, /recipeCountDegraded/);

  for (const locale of [zh, en]) {
    assert.match(locale, /sidebar:\s*\{[\s\S]*panorama:/);
    assert.match(locale, /panorama:\s*\{[\s\S]*overview:/);
    assert.match(locale, /panorama:\s*\{[\s\S]*dependencies:/);
    assert.match(locale, /panorama:\s*\{[\s\S]*recipeCountDegraded:/);
    assert.doesNotMatch(locale, /projectPyramid/);
  }
});

test('dashboard classifies D21 adapter fallbacks by provider surface', async () => {
  const api = read('src/api/client.ts');
  const apiModule = await importTranspiled('src/api/index.ts');
  const policies = apiModule.DASHBOARD_PROVIDER_ADAPTER_POLICIES;

  assert.doesNotMatch(api, /不做字段映射/);
  assert.match(api, /显式 adapter\/view projection/);
  assert.ok(Array.isArray(policies));

  const ids = new Set(policies.map((policy) => policy.id));
  for (const id of [
    'providerDataRecord',
    'firstString',
    'firstRecord',
    'projectRuntimeDiagnostic.extraFields',
    'hostManagedUnavailable',
    'sseProjection',
  ]) {
    assert.ok(ids.has(id), `adapter policy should classify ${id}`);
  }

  // CR3 test-only negative assertions for retired Dashboard fallback policy ids.
  // Owner: AlembicDashboard contract tests. Cleanup trigger: remove when the
  // compatibility-removal ledger archives CR3 and no historical fixture replay is needed.
  assert.equal([...ids].some((id) => id.includes('compatibilityAliases')), false);
  assert.equal(
    policies.some((policy) => policy.fixtureRefs.includes('search.compatibility-fallback')),
    false,
  );
  assert.ok(policies.some((policy) => policy.fixtureRefs.includes('search.degraded')));

  for (const surface of [
    'runtime-project',
    'project-scope',
    'jobs-events',
    'knowledge-search',
    'guard',
    'diagnostics',
    'ai-host-managed-unavailable',
    'artifacts',
    'sse',
  ]) {
    assert.ok(
      policies.some((policy) => policy.surface === surface || policy.fixtureRefs.some((ref) => ref.includes(surface.split('-')[0]))),
      `adapter policies should cover ${surface}`,
    );
  }

  for (const policy of policies) {
    assert.match(policy.currentConsumer, /\S/);
    assert.match(policy.providerBranch, /\S/);
    assert.match(policy.cleanupTrigger, /\S/);
    assert.ok(policy.fixtureRefs.length > 0);
  }
});

test('dashboard replays D20 provider fixtures through typed adapter projections', async () => {
  const provider = await importAlembicProviderContracts();
  const apiModule = await importTranspiled('src/api/index.ts');
  const fixtures = provider.ALEMBIC_PROVIDER_FIXTURES;

  const runtimeReady = providerFixture(fixtures, 'runtime-health.ready');
  const readyBoundary = apiModule.normalizeRuntimeBoundary({}, runtimeReady.payload.data);
  assert.equal(readyBoundary.mode, 'daemon');
  assert.equal(readyBoundary.capabilities.jobs.available, true);
  assert.equal(readyBoundary.capabilities.projectScope.available, true);

  const runtimePartial = providerFixture(fixtures, 'runtime-health.partial');
  const partialBoundary = apiModule.normalizeRuntimeBoundary({}, runtimePartial.payload.data);
  assert.equal(partialBoundary.capabilities.apiAi.available, false);
  assert.equal(partialBoundary.capabilities.apiAi.configSource, 'empty');
  assert.equal(partialBoundary.capabilities.fileMonitor.available, true);

  const runtimeUnavailable = apiModule.providerDataRecord(providerFixture(fixtures, 'runtime-health.unavailable').payload);
  assert.equal(runtimeUnavailable.error.code, 'UNAVAILABLE_RUNTIME');
  assert.equal(runtimeUnavailable.error.reasonCode, 'unavailable');

  const projectConflict = apiModule.normalizeProjectActionResult(
    providerFixture(fixtures, 'project-runtime.conflict').payload.data,
    'switch',
  );
  assert.equal(projectConflict.action, 'switch');
  assert.equal(projectConflict.ok, false);
  assert.match(projectConflict.error, /already switching/);

  const projectTimeout = apiModule.normalizeProjectActionResult(
    providerFixture(fixtures, 'project-runtime.timeout').payload.data,
    'switch',
  );
  assert.equal(projectTimeout.action, 'start');
  assert.equal(projectTimeout.ok, false);
  assert.match(projectTimeout.error, /did not become ready/);

  const jobsQueued = apiModule.providerDataRecord(providerFixture(fixtures, 'jobs.queued').payload);
  assert.equal(jobsQueued.jobs[0].status, 'queued');
  const jobsUnavailable = apiModule.providerDataRecord(providerFixture(fixtures, 'jobs.unavailable').payload);
  assert.equal(jobsUnavailable.error.reasonCode, 'unavailable');

  const knowledge = apiModule.providerDataRecord(providerFixture(fixtures, 'knowledge.success').payload);
  assert.equal(knowledge.items[0].id, 'knowledge-alpha');

  const search = apiModule.normalizeSearchResponse(providerFixture(fixtures, 'search.success').payload);
  assert.equal(search.items[0].title, 'Boundary rule');
  assert.equal(search.mode, 'keyword');
  const searchDegraded = apiModule.normalizeSearchResponse(providerFixture(fixtures, 'search.degraded').payload);
  assert.equal(searchDegraded.total, 0);
  assert.equal(searchDegraded.mode, 'legacy-fallback');

  const guard = apiModule.providerDataRecord(providerFixture(fixtures, 'guard.success').payload);
  assert.equal(guard.summary.warnings, 1);
  const diagnostic = apiModule.providerDataRecord(providerFixture(fixtures, 'diagnostic.success').payload);
  assert.equal(diagnostic.operation, 'diagnostic.read');

  const hostManaged = apiModule.parseHostManagedUnavailable({
    success: false,
    error: { code: 'HOST_AGENT_MANAGED', message: 'Use the Codex host agent.' },
  }, 501);
  assert.equal(hostManaged.code, 'HOST_AGENT_MANAGED');
  assert.equal(hostManaged.hostManaged, true);
  assert.equal(hostManaged.unavailable, true);

  const chatEvent = apiModule.projectProviderSseMessage(providerFixture(fixtures, 'sse.ai-chat.success').payload);
  assert.equal(chatEvent.type, 'text:delta');
  assert.equal(apiModule.projectSseTextDelta(chatEvent), 'Ready');
  const scanEvent = apiModule.projectProviderSseMessage(providerFixture(fixtures, 'sse.module-scan.success').payload);
  assert.equal(scanEvent.type, 'data:progress');
  assert.equal(scanEvent.completed, 1);
  assert.equal(scanEvent.total, 3);
  const refineEvent = apiModule.projectProviderSseMessage(providerFixture(fixtures, 'sse.candidate-refine.success').payload);
  assert.equal(refineEvent.type, 'data:preview');
  assert.equal(refineEvent.candidateId, 'candidate-alpha');
});

test('dashboard replays D24 consumer scenarios with public projections and failure classification', async () => {
  const provider = await importAlembicProviderContracts();
  const apiModule = await importTranspiled('src/api/index.ts');
  const fixtures = provider.ALEMBIC_PROVIDER_FIXTURES;
  const scenarios = [
    {
      id: 'runtime-route-badge-ready',
      consumerScenario: 'Header runtime route badge renders daemon-ready capabilities',
      failureClassification: 'dashboard-adapter',
      fixtureId: 'runtime-health.ready',
      producerContract: 'I03.runtime-health.get',
      project: (payload) => apiModule.normalizeRuntimeBoundary({}, payload.data),
      expectedFields: [
        ['mode', 'daemon'],
        ['capabilities.jobs.available', true],
        ['capabilities.projectScope.available', true],
      ],
    },
    {
      id: 'project-switch-snapshot-success',
      consumerScenario: 'Project switcher consumes active project snapshot',
      failureClassification: 'dashboard-adapter',
      fixtureId: 'project-runtime.success',
      producerContract: 'I04.projects.get',
      project: (payload) => apiModule.normalizeProjectsSnapshot(payload),
      expectedFields: [
        ['state.activeProjectId', 'project-alpha'],
        ['projects.0.projectId', 'project-alpha'],
      ],
    },
    {
      id: 'job-timeline-rest-recovery',
      consumerScenario: 'Jobs timeline recovers developer-visible process events',
      failureClassification: 'dashboard-adapter',
      fixtureId: 'job-event.visible',
      producerContract: 'I07.job-events.get',
      project: (payload) => apiModule.normalizeJobProcessEventsResponse(payload, payload.jobId),
      expectedFields: [
        ['jobId', 'job-bootstrap-1'],
        ['developerViews.0.content', 'Indexed project files.'],
        ['developerViews.0.displayPolicy', 'visible'],
      ],
    },
    {
      id: 'job-display-snapshot-panel',
      consumerScenario: 'Jobs display snapshot panel consumes persisted snapshot metadata',
      failureClassification: 'dashboard-adapter',
      fixtureId: 'job-snapshot.success',
      producerContract: 'I08.job-snapshot.get',
      project: (payload) => apiModule.normalizeJobDisplaySnapshotResponse(payload, 'job-bootstrap-1'),
      expectedFields: [
        ['persisted', true],
        ['snapshot.snapshot.jobId', 'job-bootstrap-1'],
        ['snapshot.snapshot.snapshotVersion', 1],
      ],
    },
    {
      id: 'project-scope-panel',
      consumerScenario: 'Project scope panel renders accepted source folders',
      failureClassification: 'dashboard-adapter',
      fixtureId: 'project-scope.success',
      producerContract: 'I05.project-scope.get',
      project: (payload) => apiModule.normalizeProjectScopeResponse(payload),
      expectedFields: [
        ['summary.projectScopeId', 'scope-alpha'],
        ['summary.folders.0.path', 'src'],
        ['summary.folders.0.displayName', 'src'],
      ],
    },
    {
      id: 'knowledge-search-results',
      consumerScenario: 'Search and command palette consume typed search results',
      failureClassification: 'dashboard-adapter',
      fixtureId: 'search.success',
      producerContract: 'I22.search.get',
      project: (payload) => apiModule.normalizeSearchResponse(payload),
      expectedFields: [
        ['items.0.title', 'Boundary rule'],
        ['items.0.content.markdown', undefined],
        ['mode', 'keyword'],
      ],
    },
    {
      id: 'knowledge-search-degraded',
      consumerScenario: 'Search and command palette consume canonical degraded search telemetry',
      failureClassification: 'dashboard-adapter',
      fixtureId: 'search.degraded',
      producerContract: 'I22.search.get',
      project: (payload) => apiModule.normalizeSearchResponse(payload),
      expectedFields: [
        ['items.0.title', undefined],
        ['total', 0],
        ['mode', 'legacy-fallback'],
      ],
    },
    {
      id: 'guard-report-summary',
      consumerScenario: 'Guard metrics consume report summary without raw provider bags',
      failureClassification: 'dashboard-adapter',
      fixtureId: 'guard.success',
      producerContract: 'I21.guard.post',
      project: (payload) => apiModule.normalizeGuardReportResponse(payload),
      expectedFields: [
        ['summary.total', 1],
        ['summary.warnings', 1],
      ],
    },
    {
      id: 'sse-chat-delta',
      consumerScenario: 'AI chat stream consumes projected text delta events',
      failureClassification: 'dashboard-adapter',
      fixtureId: 'sse.ai-chat.success',
      producerContract: 'I22.ai-chat.sse',
      project: (payload) => apiModule.projectProviderSseMessage(payload),
      expectedFields: [
        ['type', 'text:delta'],
        ['delta', 'Ready'],
      ],
    },
  ];

  const replayResults = scenarios.map((scenario) => {
    const fixture = providerFixture(fixtures, scenario.fixtureId);
    assert.equal(fixture.contractId, scenario.producerContract, `${scenario.id} should name its producer contract`);
    const producerContract = producerContractForFixture(provider, fixture);
    assert.ok(producerContract, `${scenario.id} should be backed by the contract registry`);
    const projection = scenario.project(cloneWithForbiddenProviderFields(fixture.payload), fixture);
    assertExpectedProjectionFields(projection, scenario);
    assertNoForbiddenPublicFields(projection, scenario.id);
    return {
      consumerScenario: scenario.consumerScenario,
      failureClassification: classifyDashboardReplayFailure({ fixture, producerContract, projection }),
      fixtureId: scenario.fixtureId,
      id: scenario.id,
      producerContract: fixture.contractId,
      registryRowId: fixture.registryRowId,
    };
  });

  assert.equal(new Set(replayResults.map((result) => result.consumerScenario)).size, scenarios.length);
  assert.deepEqual(
    replayResults.map((result) => result.failureClassification),
    scenarios.map(() => 'dashboard-consumer-expectation'),
  );
  assert.deepEqual(
    [
      classifyDashboardReplayFailure({ fixture: null, producerContract: {}, projection: {} }),
      classifyDashboardReplayFailure({ fixture: {}, producerContract: null, projection: {} }),
      classifyDashboardReplayFailure({ fixture: {}, producerContract: {}, projection: null }),
    ],
    ['producer-fixture', 'contract-registry', 'dashboard-adapter'],
  );
});

test('dashboard routes D25 problem taxonomy without raw payload guessing', async () => {
  const provider = await importAlembicProviderContracts();
  const apiModule = await importTranspiled('src/api/index.ts');
  const errorUtils = await importTranspiled('src/utils/error.ts');
  const fixtures = provider.ALEMBIC_PROVIDER_FIXTURES;
  // Key order mirrors DASHBOARD_FAILURE_KINDS from the generated contract artifact
  // (minus the diagnostics-only and retired kinds), which now defines the D25 required list.
  const fixtureByKind = {
    'invalid-input': 'guard.invalid-input',
    unavailable: 'workflow.unavailable',
    'capability-mismatch': 'workflow.capability-mismatch',
    'not-found': 'route.not-found',
    conflict: 'project-runtime.conflict',
    'permission-denied': 'route.permission-denied',
    timeout: 'project-runtime.timeout',
    cancelled: 'jobs.cancelled-problem',
    partial: 'workflow.partial',
    degraded: 'workflow.degraded',
    'provider-error': 'workflow.provider-error',
    'host-failure': 'workflow.host-failure',
    'internal-error': 'workflow.internal-error',
  };

  assert.deepEqual(apiModule.DASHBOARD_D25_REQUIRED_FAILURE_KINDS, Object.keys(fixtureByKind));

  for (const [failureKind, fixtureId] of Object.entries(fixtureByKind)) {
    const fixture = providerFixture(fixtures, fixtureId);
    const projection = apiModule.normalizeDashboardErrorProblem(
      cloneWithForbiddenProviderFields(fixture.payload),
      fixture.payload.error.status,
    );
    assert.ok(projection, `${fixtureId} should project a dashboard problem`);
    assert.equal(projection.source, 'provider-taxonomy');
    assert.equal(projection.reasonCode, failureKind);
    assert.equal(projection.dashboardState, failureKind);
    assert.equal(projection.failureId, `core.failure.${failureKind}`);
    assert.equal(projection.mcpErrorCode, `core.failure.${failureKind}`);
    assert.equal(projection.mcpStatus, failureKind);
    assert.equal(projection.privateDataSafe, true);
    assert.match(projection.message, /\S/);
    assert.match(projection.refPolicy, /\S/);
    assertNoForbiddenPublicFields(projection, `d25.${failureKind}`);
  }

  const providerErrorProjection = apiModule.normalizeDashboardErrorProblem({
    ok: false,
    status: 'provider-error',
    error: {
      agentBranch: 'provider-error',
      dashboardState: 'provider-error',
      detailRefs: ['provider-log:42'],
      failureId: 'core.failure.provider-error',
      mcpErrorCode: 'core.failure.provider-error',
      mcpStatus: 'provider-error',
      message: 'MCP provider error',
      privateDataSafe: true,
      problemClass: 'provider-problem',
      reasonCode: 'provider-error',
      refPolicy: 'detailRef',
      retryPolicy: 'retryable-after-backoff',
      retryable: true,
      secretToken: 'must-not-render',
    },
  }, 502);
  assert.equal(providerErrorProjection.source, 'mcp-taxonomy');
  assert.equal(providerErrorProjection.reasonCode, 'provider-error');
  assert.deepEqual(providerErrorProjection.detailRefs, ['provider-log:42']);
  assertNoForbiddenPublicFields(providerErrorProjection, 'd25.mcp');

  const agentProjection = apiModule.normalizeDashboardErrorProblem({
    branch: 'host-failure',
    error: { message: 'raw adapter host failure', rawProviderPayload: { hidden: true } },
    failureTaxonomy: {
      agentBranch: 'host-failure',
      dashboardState: 'host-failure',
      kind: 'host-failure',
      privateDataSafe: true,
      problemClass: 'host-problem',
      publicMessage: 'Host runtime failed',
      refPolicy: 'detailRef',
      retryPolicy: 'manual-intervention',
      retryable: false,
      stableId: 'core.failure.host-failure',
      status: 'failed',
    },
  }, 424);
  assert.equal(agentProjection.source, 'agent-taxonomy');
  assert.equal(agentProjection.reasonCode, 'host-failure');
  assert.equal(agentProjection.failureId, 'core.failure.host-failure');
  assert.equal(agentProjection.message, 'Host runtime failed');
  assertNoForbiddenPublicFields(agentProjection, 'd25.agent');

  const legacyCodeOnlyProblem = apiModule.normalizeDashboardErrorProblem({
    success: false,
    error: {
      code: 'HOST_AGENT_MANAGED',
      message: 'Use the Codex host agent.',
      rawProviderPayload: { hidden: true },
    },
  }, 501);
  assert.equal(legacyCodeOnlyProblem, null);

  const capabilityMismatch = providerFixture(fixtures, 'workflow.capability-mismatch');
  assert.equal(
    apiModule.parseHostManagedUnavailable(capabilityMismatch.payload, capabilityMismatch.payload.error.status),
    null,
    'stable capability-mismatch problem must not be coerced to host-managed only because it uses HTTP 501',
  );

  const hostFailure = providerFixture(fixtures, 'workflow.host-failure');
  const hostManaged = apiModule.parseHostManagedUnavailable(hostFailure.payload, hostFailure.payload.error.status);
  assert.equal(hostManaged.hostManaged, true);
  assert.equal(hostManaged.hostAgentManaged, true);
  assert.equal(hostManaged.data.failureTaxonomy.reasonCode, 'host-failure');
  assertNoForbiddenPublicFields(hostManaged.data, 'd25.hostManaged');

  assert.equal(
    errorUtils.getErrorMessage({
      response: {
        data: {
          error: {
            failureId: 'core.failure.needs-confirmation',
            publicMessage: 'Needs confirmation',
          },
        },
      },
    }),
    'Needs confirmation',
  );
});

test('project scope panel consumes Alembic ProjectScope API without fake source folders', () => {
  const api = readApiDir();
  const types = read('src/types.ts');
  const header = read('src/components/Layout/Header.tsx');
  const panel = read('src/components/Layout/ProjectScopePanel.tsx');
  const zh = read('src/i18n/locales/zh.ts');
  const en = read('src/i18n/locales/en.ts');

  assert.match(types, /export interface ProjectScopeSummary/);
  assert.match(types, /controlRootIncludedInFolders: boolean/);
  assert.match(types, /export interface ProjectScopeFoldersResponse/);
  assert.match(types, /export interface RuntimeProjectScopeCapability/);
  assert.match(types, /projectScope\?: RuntimeProjectScopeCapability/);
  assert.match(types, /projectScope\?: ProjectScopeSummary \| null/);
  assert.match(types, /projectScopeId\?: string \| null/);

  assert.match(api, /function normalizeProjectScopeCapability/);
  assert.match(api, /function normalizeProjectScopeSummary/);
  assert.match(api, /normalizeProjectScopeStorageKind\(firstString\(record\.storageKind/);
  assert.match(api, /normalizeProjectScopeFolders\(record\.folders, controlRoot\)/);
  assert.match(api, /capabilities\.projectScope/);
  assert.match(api, /serviceProjectIdentity\?\.projectScopeId/);
  assert.match(api, /normalizeProjectScopeSummary\(serviceProjectScope\)/);
  assert.match(api, /async getProjectScope/);
  assert.match(api, /http\.get\('\/project-scope'/);
  assert.match(api, /async listProjectScopeFolders/);
  assert.match(api, /http\.get\('\/project-scope\/folders'/);
  assert.match(api, /async addProjectScopeFolder/);
  assert.match(api, /http\.post\('\/project-scope\/folders'/);
  assert.match(api, /async resolveProjectScopeFolder/);
  assert.match(api, /http\.get\('\/project-scope\/resolve-folder'/);
  assert.match(api, /http\.post\('\/project-scope\/resolve-folder'/);
  assert.doesNotMatch(api, /deleteProjectScopeFolder|removeProjectScopeFolder|disableProjectScopeFolder/);

  assert.match(header, /import \{ ProjectScopePanel \} from '\.\/ProjectScopePanel'/);
  assert.match(header, /<ProjectScopePanel runtimeBoundary=\{runtimeBoundary\} \/>/);

  assert.match(panel, /api\.getProjectScope\(\)/);
  assert.match(panel, /api\.listProjectScopeFolders\(\)/);
  assert.match(panel, /api\.addProjectScopeFolder/);
  assert.match(panel, /api\.resolveProjectScopeFolder/);
  assert.match(panel, /capability\?\.available === true/);
  assert.match(panel, /projectScopeUnavailable/);
  assert.match(panel, /sourceFoldersFor\(folders, summary\)/);
  assert.match(panel, /pathKey\(folder\.path\) !== controlRootKey/);
  assert.match(panel, /projectScopeControlRoot/);
  assert.match(panel, /projectScopeDataRoot/);
  assert.match(panel, /projectScopeStorageKind/);
  assert.match(panel, /projectScopeId/);
  assert.match(panel, /projectScopeFolders/);
  assert.match(panel, /const \[detailsOpen, setDetailsOpen\] = useState\(false\)/);
  assert.match(panel, /const displayName = summary\?\.displayName/);
  assert.match(panel, /const folderCountText = t\('header\.projectScopeFolderCount'/);
  assert.match(panel, /aria-expanded=\{detailsOpen\}/);
  assert.match(panel, /\{detailsOpen \? t\('header\.projectScopeHideDetails'\) : t\('header\.projectScopeDetails'\)\}/);
  assert.match(panel, /detailsOpen && \(/);
  assert.match(panel, /projectScopeBound/);
  assert.match(panel, /projectScopeUnbound/);
  assert.match(panel, /projectScopeManage/);
  assert.match(panel, /role: sourceFolders\.length === 0 \? 'primary-source' : 'source'/);
  assert.doesNotMatch(panel, /<ProjectScopeField[\s\S]*<ProjectScopeField[\s\S]*<div className="mt-2 rounded-\[var\(--radius-md\)\] border border-\[var\(--border-muted\)\] bg-\[var\(--bg-surface\)\] px-2\.5 py-2">/);
  assert.doesNotMatch(panel, /removeProjectScope|deleteProjectScope|disableProjectScope/i);
  assert.doesNotMatch(panel, /mock|fake/i);

  for (const key of [
    'projectScopeTitle',
    'projectScopeUnavailable',
    'projectScopeControlRoot',
    'projectScopeDataRoot',
    'projectScopeStorageKind',
    'projectScopeId',
    'projectScopeFolders',
    'projectScopeFolderCount',
    'projectScopeReady',
    'projectScopeLoading',
    'projectScopeBound',
    'projectScopeUnbound',
    'projectScopeDetails',
    'projectScopeHideDetails',
    'projectScopeManage',
    'projectScopeAddFolder',
    'projectScopeResolve',
  ]) {
    assert.match(zh, new RegExp(`${key}:`), `zh locale must define ${key}`);
    assert.match(en, new RegExp(`${key}:`), `en locale must define ${key}`);
  }
});

test('project scope panel falls back to current project folder name when scope is unbound', () => {
  const panel = read('src/components/Layout/ProjectScopePanel.tsx');

  assert.match(panel, /function projectDisplayNameFromRuntime\(runtimeBoundary\?: RuntimeBoundary\)/);
  assert.match(panel, /runtimeBoundary\?\.project\.projectRoot/);
  assert.match(panel, /folderName \|\| runtimeBoundary\?\.project\.projectId/);
  assert.match(panel, /summary\?\.displayName \?\? projectDisplayNameFromRuntime\(runtimeBoundary\)/);
  assert.doesNotMatch(panel, /summary\?\.displayName \?\? runtimeBoundary\?\.project\.projectId/);
});

test('network transport primitives stay pinned to the declared census (AD6 inflow/outflow audit)', () => {
  // Declared transport seams (docs/declared-effects.md): api/client.ts owns the
  // shared axios instance; api/modules.ts owns the SSE scan streams
  // (fetch session-start + EventSource consume, SPM-frozen methods);
  // lib/socket.ts owns the socket.io singleton. All other api families consume
  // the shared client and carry no transport primitives of their own.
  const declaredTransportModules = ['src/api/client.ts', 'src/api/modules.ts', 'src/lib/socket.ts'];
  // Known stray transport sites recorded as AD6 FINDINGS (api-consolidation
  // candidates, controller-routed): direct axios/fetch calls outside api.ts.
  // This is an exact ratchet — a NEW transport site fails the test, and
  // consolidating a stray away requires deleting its row here (explicit).
  // W7-c consolidated the last three strays (useAuth/usePermission auth calls
  // and the i18n /ai/lang round-trips) into the api layer — the list is empty.
  const knownStrayFindings = [];

  const transportPatterns = [
    /\bfetch\s*\(/,
    /\bXMLHttpRequest\b/,
    /new\s+EventSource\s*\(/,
    /new\s+WebSocket\s*\(/,
    /\bsendBeacon\b/,
    /from\s+['"]axios['"]/,
    /from\s+['"]socket\.io-client['"]/,
  ];

  const sourceDir = path.join(root, 'src');
  const sourceFilesWithTransport = [];
  const walkSrc = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walkSrc(fullPath);
      } else if (/\.(ts|tsx)$/.test(entry.name)) {
        const text = readFileSync(fullPath, 'utf8');
        if (transportPatterns.some((pattern) => pattern.test(text))) {
          sourceFilesWithTransport.push(path.relative(root, fullPath).replaceAll(path.sep, '/'));
        }
      }
    }
  };
  walkSrc(sourceDir);

  assert.deepEqual(
    sourceFilesWithTransport.sort(),
    [...declaredTransportModules, ...knownStrayFindings].sort(),
    'transport primitives appeared outside the declared census — update docs/declared-effects.md and route the finding before changing this pin',
  );
});
