import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import ts from 'typescript';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

function read(relativePath) {
  return readFileSync(path.join(root, relativePath), 'utf8');
}

async function importTranspiled(relativePath) {
  const source = read(relativePath);
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  const tempDir = path.join(root, 'node_modules', '.tmp', 'dashboard-contract');
  mkdirSync(tempDir, { recursive: true });
  const tempFile = path.join(tempDir, `${relativePath.replace(/[^A-Za-z0-9._-]+/g, '-')}-${Date.now()}.mjs`);
  writeFileSync(tempFile, output);
  return import(pathToFileURL(tempFile).href);
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
  const api = read('src/api.ts');
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
  assert.match(runtimeBlock, /t\('bootstrap\.terminalCapability'\)/);
  assert.match(runtimeBlock, /terminalCapability\.toolset/);
  assert.match(runtimeBlock, /SandboxStatusIcon sandbox=\{sandboxStatus\}/);
  assert.match(runtimeBlock, /t\(sandboxLabelKey\(sandboxStatus\)\)/);
  assert.match(runtimeBlock, /t\(sandboxHintKey\(sandboxStatus\)\)/);

  assert.match(testModeBlock, /t\('bootstrap\.testMode'\)/);
  assert.doesNotMatch(testModeBlock, /terminalCapability/);
  assert.doesNotMatch(testModeBlock, /sandbox\./);
});

test('dashboard consumes API AI runtime contract naming', () => {
  const types = read('src/types.ts');
  const api = read('src/api.ts');
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
  const api = read('src/api.ts');
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
  const { normalizeProjectsSnapshot } = await importTranspiled('src/api.ts');
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
  const { buildRuntimeDiagnosticExtraRows, buildRuntimeDiagnosticsFieldRows } = await importTranspiled('src/runtimeDiagnosticsPanelModel.ts');
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
  const hook = read('src/hooks/useBootstrapSocket.ts');

  assert.match(app, /bootstrap\.isAllDone[\s\S]*fetchData\(\)/);
  assert.doesNotMatch(app, /candidateCreatedTick/);
  assert.doesNotMatch(app, /setTimeout\(\(\) => fetchData\(\), 2000\)/);
  assert.doesNotMatch(hook, /candidateCreatedTick/);
  assert.doesNotMatch(hook, /setCandidateCreatedTick/);
});

test('jobs process timeline consumes typed events contract', () => {
  const api = read('src/api.ts');
  const hook = read('src/hooks/useJobProcessEvents.ts');
  const eventUtils = read('src/utils/jobProcessEvents.ts');
  const jobs = read('src/components/Views/JobsView.tsx');
  const bootstrap = read('src/components/Views/BootstrapProgressView.tsx');

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
  const eventUtils = read('src/utils/jobProcessEvents.ts');
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
  const api = read('src/api.ts');
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

test('socket process events share REST content normalization', () => {
  const api = read('src/api.ts');
  const hook = read('src/hooks/useJobProcessEvents.ts');

  assert.match(api, /function contentTextOrUndefined\(value: unknown\)/);
  assert.match(api, /stringOrUndefined\(record\.text\)/);
  assert.match(api, /JSON\.stringify\(value, null, 2\)/);
  assert.match(api, /content: contentTextOrUndefined\(record\.content\)/);

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

test('project scope panel consumes Alembic ProjectScope API without fake source folders', () => {
  const api = read('src/api.ts');
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
