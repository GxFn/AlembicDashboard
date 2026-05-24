import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

function read(relativePath) {
  return readFileSync(path.join(root, relativePath), 'utf8');
}

test('package exposes real local quality gates', () => {
  const pkg = JSON.parse(read('package.json'));
  for (const scriptName of ['lint', 'test', 'typecheck', 'build', 'check']) {
    assert.equal(typeof pkg.scripts?.[scriptName], 'string', `${scriptName} script is required`);
    assert.doesNotMatch(pkg.scripts[scriptName], /echo|exit\s+0|true/, `${scriptName} must not be a placeholder`);
  }
  assert.match(pkg.scripts.lint, /lint-dashboard\.mjs/);
  assert.match(pkg.scripts.test, /dashboard-contract\.test\.mjs/);
});

test('mock cleanup path reports success and failure through notifications', () => {
  const header = read('src/components/Layout/Header.tsx');
  const start = header.indexOf('const handleSelectAi');
  const end = header.indexOf('const loadProviders');
  assert.ok(start >= 0 && end > start, 'AI provider switch handler should be present');

  const block = header.slice(start, end);
  assert.match(block, /api\.cleanupMockData\(\)/);
  assert.match(block, /notify\(t\('header\.mockCleanupSuccessBody'/);
  assert.match(block, /notify\(getErrorMessage\(err, t\('header\.mockCleanupFailedBody'\)\)/);
  assert.doesNotMatch(block, /console\.(log|error)\([^)]*cleanup/i);

  const zh = read('src/i18n/locales/zh.ts');
  const en = read('src/i18n/locales/en.ts');
  for (const key of [
    'mockCleanupSuccessTitle',
    'mockCleanupSuccessBody',
    'mockCleanupFailedTitle',
    'mockCleanupFailedBody',
  ]) {
    assert.match(zh, new RegExp(`${key}:`), `zh locale must define ${key}`);
    assert.match(en, new RegExp(`${key}:`), `en locale must define ${key}`);
  }
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
  assert.match(api, /developerViews: JobProcessDeveloperView\[\]/);
  assert.match(api, /getJobProcessEvents\(jobId: string/);
  assert.match(api, /`\/jobs\/\$\{encodeURIComponent\(jobId\)\}\/events`/);
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
  assert.match(jobs, /artifactRefs/);
  assert.match(jobs, /ProcessEventItem/);
  assert.match(jobs, /formatProcessEventSemanticLabel\(event, text\.lang\)/);
  assert.match(jobs, /getLlmOutputCompletenessHints\(event, text\.lang\)/);
  assert.match(jobs, /getProcessEventSemanticKind\(event\)/);
  assert.match(jobs, /getProcessEventNudgeType\(event\)/);
  assert.match(jobs, /getProcessEventMetadataText\(event, 'findingCount'\)/);
  assert.match(jobs, /selectedTimelineJobId/);
  assert.match(jobs, /selectedTimelineJob && \(/);
  assert.match(jobs, /onOpenTimeline=\{\(\) => setSelectedTimelineJobId\(job\.id\)\}/);
  assert.match(jobs, /type TimelineDisplayMode = 'default' \| 'compact'/);
  assert.match(jobs, /const \[timelineDisplayMode, setTimelineDisplayMode\] = useState<TimelineDisplayMode>\('default'\)/);
  assert.match(jobs, /role="group"[\s\S]*aria-label=\{text\.timelineModeTitle\}/);
  assert.match(jobs, /aria-pressed=\{timelineDisplayMode === mode\}/);
  assert.match(jobs, /displayMode=\{timelineDisplayMode\}/);
  assert.match(jobs, /const timelineSubtitleParts = \[/);
  assert.match(jobs, /subtitle=\{timelineSubtitleParts\.join\(' · '\)\}/);
  assert.match(jobs, /<Drawer open=\{open\} onClose=\{onClose\} size="full">/);
  assert.match(jobs, /<Drawer\.Body padded=\{false\} className="min-h-0 overflow-hidden">/);
  assert.match(jobs, /ref=\{timelineListRef\}/);
  assert.match(jobs, /scrollTimelineToBottom\(timelineListRef\.current\)/);
  assert.match(jobs, /className="h-full overflow-y-auto overflow-x-hidden px-5 py-4 text-\[#0f172a\] overscroll-contain dark:text-\[#e2e8f0\]"/);
  assert.match(jobs, /const contentToggle = event\.content && contentShouldCollapse \? \(/);
  assert.match(jobs, /items-start justify-between/);
  assert.match(jobs, /event\.content && effectiveContentExpanded && \(/);
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
