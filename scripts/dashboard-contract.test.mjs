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

test('jobs process timeline consumes typed events contract', () => {
  const api = read('src/api.ts');
  const hook = read('src/hooks/useJobProcessEvents.ts');
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

  assert.match(jobs, /JobProcessTimeline/);
  assert.match(jobs, /artifactRefs/);
  assert.match(jobs, /ProcessEventItem/);
  assert.doesNotMatch(jobs, /raw\s*log/i);

  assert.match(bootstrap, /BootstrapProcessSummary/);
  assert.match(bootstrap, /onOpenJobDetails/);
  assert.match(bootstrap, /pickKeyProcessEvents/);
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
  assert.match(jobs, /sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6/);
  assert.match(jobs, /getCurrentDimensionLabel\(job\)/);
  assert.match(jobs, /block text-\[11px\] leading-4/);
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
  assert.doesNotMatch(jobs, /overscroll-contain/);
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
});
