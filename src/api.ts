/**
 * Alembic Dashboard API Client
 *
 * 直接调用 V3 RESTful API（/api/v1/*）。
 * 前端统一使用 V3 KnowledgeEntry 类型，不做字段映射。
 *
 * SSE 架构: Session + EventSource（POST 创建会话 → GET EventSource 消费事件）
 */

import axios from 'axios';
import type {
  Recipe,
  RecipeStats,
  ProjectData,
  SPMTarget,
  ExtractedRecipe,
  ScannedFile,
  KnowledgeEntry,
  KnowledgeContent,
  KnowledgeQuality,
  KnowledgeStats,
  KnowledgePaginatedResponse,
  KnowledgeStatsResponse,
  KnowledgeLifecycle,
  KnowledgeKind,
  ProposalRecord,
  DashboardProjectActionResult,
  DashboardProjectConnectionState,
  DashboardProjectRuntimeControlState,
  DashboardProjectRuntimeDaemonSummary,
  DashboardProjectRuntimeFlags,
  DashboardProjectRuntimeHandoff,
  DashboardProjectRuntimeScopeSummary,
  DashboardProjectsSnapshot,
  RuntimeBoundary,
  WarningRecord,
} from './types';

// ═══════════════════════════════════════════════════════
//  Base HTTP Client
// ═══════════════════════════════════════════════════════

const http = axios.create({ baseURL: '/api/v1' });

// ═══════════════════════════════════════════════════════
//  Type Mappers
// ═══════════════════════════════════════════════════════

/** API 返回的 raw 知识条目（可能含别名字段如 name/statistics/status） */
type RawKnowledgeRecord = Partial<KnowledgeEntry> & {
  name?: string;
  statistics?: Record<string, number>;
  status?: string;
  version?: string;
};

/** 候选条目输入类型 — 兼容 ExtractedRecipe 和 KnowledgeEntry 字段 */
type CandidateInput = Partial<ExtractedRecipe & KnowledgeEntry> & {
  isMarked?: boolean;
};

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asRuntimeRecord(value: unknown): UnknownRecord | null {
  return isRecord(value) ? value : null;
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }
  }
  return null;
}

function firstRecord(...values: unknown[]): UnknownRecord | null {
  for (const value of values) {
    const record = asRuntimeRecord(value);
    if (record) {
      return record;
    }
  }
  return null;
}

function firstBoolean(...values: unknown[]): boolean | null {
  for (const value of values) {
    if (typeof value === 'boolean') {
      return value;
    }
  }
  return null;
}

function booleanOrNull(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function firstStringArray(...values: unknown[]): string[] {
  for (const value of values) {
    const strings = stringArray(value);
    if (strings.length > 0) {
      return strings;
    }
  }
  return [];
}

function stringRecord(value: unknown): Record<string, string> | undefined {
  const record = asRuntimeRecord(value);
  if (!record) {
    return undefined;
  }
  const entries = Object.entries(record).filter((entry): entry is [string, string] =>
    typeof entry[1] === 'string'
  );
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function firstNumber(...values: unknown[]): number | null {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }
  return null;
}

function booleanOrFalse(value: unknown): boolean {
  return value === true;
}

function recordArray(value: unknown): UnknownRecord[] {
  return Array.isArray(value) ? value.map(asRuntimeRecord).filter((item): item is UnknownRecord => item !== null) : [];
}

function fallbackDisplayName(projectRoot: string): string {
  const parts = projectRoot.split('/').filter(Boolean);
  return parts[parts.length - 1] || projectRoot || 'Alembic';
}

function normalizeProjectRuntimeControlState(value: unknown): DashboardProjectRuntimeControlState {
  const record = asRuntimeRecord(value) ?? {};
  return {
    activeProjectId: firstString(record.activeProjectId),
    activeProjectRoot: firstString(record.activeProjectRoot),
    schemaVersion: firstNumber(record.schemaVersion),
    selectedAt: firstString(record.selectedAt),
    selectedProjectId: firstString(record.selectedProjectId),
    selectedProjectRoot: firstString(record.selectedProjectRoot),
    updatedAt: firstString(record.updatedAt),
  };
}

function normalizeProjectRuntimeDaemon(value: unknown): DashboardProjectRuntimeDaemonSummary {
  const record = asRuntimeRecord(value) ?? {};
  return {
    dashboardUrl: firstString(record.dashboardUrl),
    message: firstString(record.message),
    pid: firstNumber(record.pid),
    pidAlive: booleanOrNull(record.pidAlive),
    ready: booleanOrNull(record.ready),
    status: firstString(record.status) ?? 'unknown',
    url: firstString(record.url),
  };
}

function normalizeProjectRuntimeFlags(value: unknown): DashboardProjectRuntimeFlags {
  const record = asRuntimeRecord(value) ?? {};
  return {
    activeRuntime: booleanOrFalse(record.activeRuntime),
    missing: booleanOrFalse(record.missing),
    selected: booleanOrFalse(record.selected),
    stale: booleanOrFalse(record.stale),
    unavailable: booleanOrFalse(record.unavailable),
  };
}

function normalizeProjectRuntimeScope(value: unknown): DashboardProjectRuntimeScopeSummary | null {
  const record = asRuntimeRecord(value);
  if (!record) {
    return null;
  }

  const daemon = normalizeProjectRuntimeDaemon(record.daemon);
  const projectRoot = firstString(record.projectRoot) ?? '';
  const ghost = booleanOrFalse(record.ghost);
  return {
    cacheKey: firstString(record.cacheKey, record.projectId, projectRoot) ?? '',
    dashboardUrl: firstString(record.dashboardUrl, daemon.dashboardUrl),
    dataRoot: firstString(record.dataRoot, projectRoot) ?? '',
    dataRootSource: firstString(record.dataRootSource, ghost ? 'ghost-registry' : null) ?? 'unknown',
    daemon,
    displayName: firstString(record.displayName) ?? fallbackDisplayName(projectRoot),
    flags: normalizeProjectRuntimeFlags(record.flags),
    ghost,
    mode: firstString(record.mode, ghost ? 'ghost' : null) ?? 'unknown',
    projectExists: booleanOrFalse(record.projectExists),
    projectId: firstString(record.projectId),
    projectRealpath: firstString(record.projectRealpath, projectRoot) ?? '',
    projectRoot,
    registered: booleanOrFalse(record.registered),
    runtimeDir: firstString(record.runtimeDir) ?? '',
    status: firstString(record.status) ?? 'unknown',
    workspaceExists: booleanOrFalse(record.workspaceExists),
  };
}

function normalizeNullableProjectRuntimeScope(value: unknown): DashboardProjectRuntimeScopeSummary | null {
  return value === null || value === undefined ? null : normalizeProjectRuntimeScope(value);
}

function normalizeProjectsSnapshot(value: unknown): DashboardProjectsSnapshot {
  const record = asRuntimeRecord(value) ?? {};
  return {
    activeRuntimeProject: normalizeNullableProjectRuntimeScope(record.activeRuntimeProject),
    generatedAt: firstString(record.generatedAt),
    projects: recordArray(record.projects)
      .map(normalizeProjectRuntimeScope)
      .filter((project): project is DashboardProjectRuntimeScopeSummary => project !== null),
    selectedProject: normalizeNullableProjectRuntimeScope(record.selectedProject),
    state: normalizeProjectRuntimeControlState(record.state),
  };
}

function normalizeProjectHandoff(value: unknown): DashboardProjectRuntimeHandoff | null {
  const record = asRuntimeRecord(value);
  if (!record) {
    return null;
  }
  return {
    apiBaseUrl: firstString(record.apiBaseUrl),
    dashboardUrl: firstString(record.dashboardUrl),
    projectId: firstString(record.projectId),
    projectRoot: firstString(record.projectRoot) ?? '',
    status: firstString(record.status) ?? 'unknown',
  };
}

function normalizeProjectActionResult(value: unknown, fallbackAction: DashboardProjectActionResult['action']): DashboardProjectActionResult {
  const record = asRuntimeRecord(value) ?? {};
  return {
    action: firstString(record.action) ?? fallbackAction,
    error: firstString(record.error),
    deferredStopProject: normalizeNullableProjectRuntimeScope(record.deferredStopProject),
    handoff: normalizeProjectHandoff(record.handoff),
    ok: booleanOrFalse(record.ok),
    previousActiveProject: normalizeNullableProjectRuntimeScope(record.previousActiveProject),
    snapshot: normalizeProjectsSnapshot(record.snapshot),
    stoppedProject: normalizeNullableProjectRuntimeScope(record.stoppedProject),
    targetProject: normalizeNullableProjectRuntimeScope(record.targetProject),
  };
}

async function postProjectAction(
  projectId: string,
  action: 'open-dashboard' | 'switch' | 'stop',
): Promise<DashboardProjectActionResult> {
  const res = await http.post(
    `/projects/${encodeURIComponent(projectId)}/${action}`,
    { waitUntilReadyMs: 10000 },
    { validateStatus: (status) => status < 500 },
  );
  const result = normalizeProjectActionResult(res.data?.data, action);
  if (res.data?.success === false && !result.error) {
    return { ...result, ok: false, error: firstString(res.data?.error) ?? 'Project action failed' };
  }
  return result;
}

function normalizeRuntimeBoundary(projectInfoValue: unknown, daemonHealthValue: unknown): RuntimeBoundary {
  const projectInfo = asRuntimeRecord(projectInfoValue) ?? {};
  const daemon = asRuntimeRecord(daemonHealthValue) ?? {};
  const daemonCapabilities = asRuntimeRecord(daemon.capabilities);
  const projectInfoCapabilities = asRuntimeRecord(projectInfo.capabilities);
  const enhancement = asRuntimeRecord(daemon.enhancement) ?? asRuntimeRecord(projectInfo.enhancement) ?? {};
  const capabilities = daemonCapabilities ?? projectInfoCapabilities ?? {};
  const daemonRuntimeBoundary = asRuntimeRecord(daemon.runtimeBoundary);
  const daemonCapabilityRuntimeBoundary = asRuntimeRecord(daemonCapabilities?.runtimeBoundary);
  const projectInfoRuntimeBoundary = asRuntimeRecord(projectInfo.runtimeBoundary);
  const projectInfoCapabilityRuntimeBoundary = asRuntimeRecord(projectInfoCapabilities?.runtimeBoundary);
  const runtimeBoundary = firstRecord(
    daemonRuntimeBoundary,
    daemonCapabilityRuntimeBoundary,
    projectInfoRuntimeBoundary,
    projectInfoCapabilityRuntimeBoundary
  );
  const runtimeBoundarySource = daemonRuntimeBoundary
    ? 'data.runtimeBoundary'
    : daemonCapabilityRuntimeBoundary
      ? 'capabilities.runtimeBoundary'
      : projectInfoRuntimeBoundary
        ? 'projectInfo.runtimeBoundary'
        : projectInfoCapabilityRuntimeBoundary
          ? 'projectInfo.capabilities.runtimeBoundary'
          : null;
  const runtimeWorkspace = asRuntimeRecord(runtimeBoundary?.workspace);
  const runtimeDaemon = asRuntimeRecord(runtimeBoundary?.daemon);
  const runtimeDashboard = asRuntimeRecord(runtimeBoundary?.dashboard);
  const runtimeFileMonitor = asRuntimeRecord(runtimeBoundary?.fileMonitor);
  const runtimeJobs = asRuntimeRecord(runtimeBoundary?.jobs);
  const runtimeInternalAi = asRuntimeRecord(runtimeBoundary?.internalAi);
  const apiCapability = asRuntimeRecord(capabilities.api);
  const dashboardCapability = asRuntimeRecord(capabilities.dashboard);
  const fileMonitorCapability = asRuntimeRecord(capabilities.fileMonitor);
  const jobsCapability = asRuntimeRecord(capabilities.jobs);
  const internalAiCapability = asRuntimeRecord(capabilities.internalAi);
  const hostAgentRoute =
    asRuntimeRecord(daemon.hostAgentRoute) ??
    asRuntimeRecord(enhancement.hostAgentRoute) ??
    asRuntimeRecord(projectInfo.hostAgentRoute);

  const workspaceMode = firstString(runtimeWorkspace?.mode);
  const projectRoot = firstString(daemon.projectRoot, runtimeWorkspace?.projectRoot, projectInfo.projectRoot) ?? '';
  const dataRoot = firstString(daemon.dataRoot, runtimeWorkspace?.dataRoot, projectInfo.dataRoot, projectRoot) ?? '';
  const dataRootSource = firstString(
    daemon.dataRootSource,
    runtimeWorkspace?.dataRootSource,
    projectInfo.dataRootSource,
    workspaceMode === 'ghost' ? 'ghost-registry' : null,
    workspaceMode === 'standard' ? 'project-root' : null
  ) ?? 'unknown';

  return {
    owner: firstString(runtimeBoundary?.owner),
    source: runtimeBoundarySource,
    mode: firstString(daemon.mode, runtimeDaemon?.mode, projectInfo.runtimeMode) ?? 'unknown',
    route: firstString(enhancement.route, runtimeBoundary?.route, daemon.route, projectInfo.route) ?? 'unknown',
    apiVersion: firstString(enhancement.apiVersion),
    packageName: firstString(enhancement.packageName),
    version: firstString(enhancement.version, daemon.version, projectInfo.version),
    dashboardUrl: firstString(daemon.dashboardUrl, dashboardCapability?.url, runtimeDashboard?.url),
    daemon: runtimeDaemon
      ? {
          apiBaseUrl: firstString(runtimeDaemon.apiBaseUrl),
          owner: firstString(runtimeDaemon.owner),
          stateContract: firstString(runtimeDaemon.stateContract),
        }
      : undefined,
    project: {
      projectRoot,
      dataRoot,
      projectId: firstString(daemon.projectId, runtimeWorkspace?.projectId, projectInfo.projectId),
      dataRootSource,
      runtimeDir: firstString(daemon.runtimeDir, runtimeWorkspace?.runtimeDir, projectInfo.runtimeDir),
      databasePath: firstString(daemon.databasePath, runtimeWorkspace?.databasePath, projectInfo.databasePath),
      schemaMigrationVersion: firstString(daemon.schemaMigrationVersion, projectInfo.schemaMigrationVersion),
      workspaceMode: workspaceMode ?? 'unknown',
      workspaceContract: firstString(runtimeWorkspace?.contract),
    },
    capabilities: {
      api: apiCapability || runtimeDaemon
        ? {
            available: booleanOrNull(apiCapability?.available),
            baseUrl: firstString(apiCapability?.baseUrl, runtimeDaemon?.apiBaseUrl),
            healthPath: firstString(apiCapability?.healthPath),
          }
        : undefined,
      dashboard: dashboardCapability || runtimeDashboard
        ? {
            available: firstBoolean(dashboardCapability?.available),
            url: firstString(dashboardCapability?.url, runtimeDashboard?.url),
            frontendOwner: firstString(runtimeDashboard?.frontendOwner),
            handoff: firstString(runtimeDashboard?.handoff),
            serverOwner: firstString(runtimeDashboard?.serverOwner),
          }
        : undefined,
      fileMonitor: fileMonitorCapability || runtimeFileMonitor
        ? {
            available: firstBoolean(fileMonitorCapability?.available, runtimeFileMonitor?.available),
            mode: firstString(fileMonitorCapability?.mode, runtimeFileMonitor?.mode, runtimeFileMonitor?.source),
            endpoint: firstString(fileMonitorCapability?.endpoint, runtimeFileMonitor?.endpoint),
            acceptedEventSources: firstStringArray(
              fileMonitorCapability?.acceptedEventSources,
              runtimeFileMonitor?.acceptedEventSources
            ),
            compatibilityAliases: stringRecord(fileMonitorCapability?.compatibilityAliases),
            dispatcher: firstString(runtimeFileMonitor?.dispatcher),
            longLivedOwner: firstString(runtimeFileMonitor?.longLivedOwner),
          }
        : undefined,
      jobs: jobsCapability || runtimeJobs
        ? {
            available: firstBoolean(jobsCapability?.available),
            kinds: firstStringArray(jobsCapability?.kinds, runtimeJobs?.kinds),
            endpoints: stringRecord(jobsCapability?.endpoints) ?? stringRecord(runtimeJobs?.endpoints),
            owner: firstString(runtimeJobs?.owner),
            store: firstString(runtimeJobs?.store),
          }
        : undefined,
      internalAi: internalAiCapability || runtimeInternalAi
        ? {
            available: firstBoolean(internalAiCapability?.available, runtimeInternalAi?.available),
            configSource: firstString(internalAiCapability?.configSource, runtimeInternalAi?.configSource) ?? 'unknown',
            provider: firstString(internalAiCapability?.provider, runtimeInternalAi?.provider),
            model: firstString(internalAiCapability?.model, runtimeInternalAi?.model),
            owner: firstString(runtimeInternalAi?.owner),
            runtimeOwner: firstString(runtimeInternalAi?.runtimeOwner),
          }
        : undefined,
    },
    hostAgentRoute: hostAgentRoute
      ? {
          available: booleanOrNull(hostAgentRoute.available),
          owner: firstString(hostAgentRoute.owner),
          source: firstString(hostAgentRoute.source),
        }
      : undefined,
  };
}

function watcherStatusFromRuntime(boundary: RuntimeBoundary): string {
  const available = boundary.capabilities.fileMonitor?.available;
  if (available === true) {
    return 'active';
  }
  if (available === false) {
    return 'unavailable';
  }
  return 'unknown';
}

export interface HostManagedUnavailableDetails {
  code: 'HOST_AI_MANAGED';
  message: string;
  hostManaged: true;
  unavailable?: boolean;
  status?: number;
  data?: unknown;
}

export class HostManagedUnavailableError extends Error {
  readonly code = 'HOST_AI_MANAGED';
  readonly hostManaged = true;
  readonly unavailable?: boolean;
  readonly status?: number;
  readonly data?: unknown;

  constructor(details: HostManagedUnavailableDetails) {
    super(details.message);
    this.name = 'HostManagedUnavailableError';
    this.unavailable = details.unavailable;
    this.status = details.status;
    this.data = details.data;
    Object.setPrototypeOf(this, HostManagedUnavailableError.prototype);
  }
}

export function isHostManagedUnavailable(err: unknown): err is HostManagedUnavailableError {
  return err instanceof HostManagedUnavailableError ||
    (typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      (err as { code?: unknown }).code === 'HOST_AI_MANAGED');
}

export interface DaemonJobRecord {
  id: string;
  kind: 'bootstrap' | 'rescan';
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  source: 'codex' | 'dashboard' | 'http' | 'system';
  projectRoot: string;
  dataRoot: string;
  projectId: string | null;
  request: Record<string, unknown>;
  result?: unknown;
  error?: { message: string; stack?: string };
  bootstrapSessionId?: string;
  progress?: {
    activeTaskId?: string;
    activeTaskLabel?: string;
    completed?: number;
    failed?: number;
    filling?: number;
    percent?: number;
    sessionId?: string;
    skeleton?: number;
    status: string;
    total?: number;
    totalToolCalls?: number;
  };
  summary?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
}

/** V3 KnowledgeEntry → 前端 Recipe 视图类型 */
function toRecipe(r: RawKnowledgeRecord): Recipe {
  const quality = r.quality || {} as KnowledgeQuality;
  const statistics = r.stats || r.statistics || {} as KnowledgeStats;
  const contentObj = r.content || {} as KnowledgeContent;

  const trigger =
    r.trigger ||
    '@' + (r.title || '').replace(/[\s_-]+(.)?/g, (_: string, c: string) => (c ? c.toUpperCase() : ''));

  const stats: RecipeStats = {
    authority: statistics.authority || Math.round((quality.overall || 0) * 5) || 0,
    authorityScore: statistics.authority || Math.round((quality.overall || 0) * 5) || 0,
    guardUsageCount: statistics.applications || 0,
    humanUsageCount: statistics.adoptions || 0,
    aiUsageCount: 0,
    lastUsedAt: (r.updatedAt ?? null) as string | null,
  };

  return {
    id: r.id,
    name: (r.title || r.name || r.id || '') + '.md',
    content: contentObj,
    category: r.category || '',
    language: r.language || '',
    description: r.description || '',
    status: r.lifecycle || r.status || 'pending',
    kind: r.kind || undefined,
    knowledgeType: r.knowledgeType || undefined,
    // v2Content removed — content is now the V3 structured object
    relations: (r.relations ?? null) as Recipe['relations'],
    constraints: (r.constraints ?? null) as Recipe['constraints'],
    tags: r.tags || [],
    stats,
    trigger,
    source: r.source || '',
    createdBy: r.createdBy || '',
    sourceFile: r.sourceFile || '',
    moduleName: r.moduleName || '',
    usageGuide: contentObj.markdown || r.doClause || '',
    reasoning: (r.reasoning ?? null) as Recipe['reasoning'],
    quality: (r.quality ?? null) as Recipe['quality'],
    scope: r.scope || '',
    complexity: r.complexity || '',
    difficulty: r.difficulty || r.complexity || '',
    version: r.version || '',
    doClause: r.doClause || '',
    dontClause: r.dontClause || '',
    whenClause: r.whenClause || '',
    coreCode: r.coreCode || contentObj.pattern || '',
    topicHint: r.topicHint || '',
    aiInsight: r.aiInsight || null,
    lifecycleHistory: r.lifecycleHistory,
    headers: r.headers || [],
    createdAt: r.createdAt || null,
    updatedAt: r.updatedAt || null,
  };
}

const CANDIDATE_DIMENSION_ALIASES: Record<string, string> = {
  architecture: 'architecture',
  'architecture & design': 'architecture',
  'architecture patterns': 'architecture',
};

const CANDIDATE_DIMENSION_KEYS = new Set([
  'architecture',
  'coding-standards',
  'design-patterns',
  'error-resilience',
  'concurrency-async',
  'data-event-flow',
  'networking-api',
  'ui-interaction',
  'testing-quality',
  'security-auth',
  'performance-optimization',
  'observability-logging',
  'agent-guidelines',
  'swift-objc-idiom',
  'ts-js-module',
  'python-structure',
  'jvm-annotation',
  'go-module',
  'rust-ownership',
  'csharp-dotnet',
  'react-patterns',
  'vue-patterns',
  'spring-patterns',
  'swiftui-patterns',
  'django-fastapi',
  'bootstrap',
]);

function normalizeCandidateDimensionKey(raw?: string | null): string {
  if (!raw) return '';
  const trimmed = String(raw).trim();
  if (!trimmed) return '';
  const lower = trimmed.toLowerCase();
  const dimensionKey = CANDIDATE_DIMENSION_ALIASES[lower] || lower;
  return CANDIDATE_DIMENSION_KEYS.has(dimensionKey) ? dimensionKey : '';
}

function candidateGroupKey(entry: KnowledgeEntry): string {
  const dimensionKey =
    normalizeCandidateDimensionKey(entry.dimensionId) ||
    normalizeCandidateDimensionKey(entry.topicHint) ||
    normalizeCandidateDimensionKey(entry.category);
  return dimensionKey || entry.category || entry.language || '_pending';
}

// ═══════════════════════════════════════════════════════
//  Frontmatter Parser (client-side)
// ═══════════════════════════════════════════════════════

function parseFrontmatter(markdownContent: string) {
  let language = '',
    category = 'general',
    title = '',
    trigger = '',
    summary = '';
  let summaryEn = '',
    knowledgeType = '',
    complexity = '',
    scope = '';
  let tags: string[] = [],
    headers: string[] = [],
    difficulty = '',
    authority = 0,
    version = '1.0.0';
  let usageGuide = '',
    usageGuideEn = '',
    rationaleText = '',
    bestPracticesText = '',
    standardsText = '';
  let kind = '', doClause = '', dontClause = '', whenClause = '', topicHint = '';
  let codePattern = markdownContent;

  const fmMatch = markdownContent.match(/^---\n([\s\S]*?)\n---/);
  if (fmMatch) {
    const fm = fmMatch[1];
    const getField = (key: string): string | null => {
      const m = fm.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'));
      return m ? m[1].trim() : null;
    };
    language = getField('language') || language;
    category = getField('category') || category;
    title = getField('title') || title;
    trigger = getField('trigger') || '';
    summary = getField('summary_cn') || getField('summary') || getField('description') || summary;
    summaryEn = getField('summary_en') || '';
    knowledgeType = getField('knowledge_type') || getField('knowledgeType') || '';
    complexity = getField('complexity') || '';
    scope = getField('scope') || '';
    difficulty = getField('difficulty') || '';
    version = getField('version') || '1.0.0';
    const authStr = getField('authority');
    if (authStr) authority = parseInt(authStr) || 0;
    const tagsStr = getField('tags');
    if (tagsStr) {
      try {
        tags = JSON.parse(tagsStr);
      } catch {
        tags = tagsStr.split(',').map((t) => t.trim()).filter(Boolean);
      }
    }
    const headersStr = getField('headers');
    if (headersStr) {
      try {
        headers = JSON.parse(headersStr);
      } catch {
        headers = [headersStr];
      }
    }
    kind = getField('kind') || '';
    doClause = getField('doClause') || '';
    dontClause = getField('dontClause') || '';
    whenClause = getField('whenClause') || '';
    topicHint = getField('topicHint') || '';

    // Extract code block
    const codeBlock = markdownContent.match(/```[\w]*\n([\s\S]*?)```/);
    if (codeBlock) codePattern = codeBlock[1].trim();

    // Extract body sections
    const bodyAfterFm = markdownContent.replace(/^---\n[\s\S]*?\n---/, '').trim();
    const usageMatch = bodyAfterFm.match(
      /## (?:AI Context \/ )?Usage Guide(?:\s*\(CN\))?\n\n([\s\S]*?)(?=\n## |$)/,
    );
    if (usageMatch) usageGuide = usageMatch[1].trim();
    const usageEnMatch = bodyAfterFm.match(
      /## (?:AI Context \/ )?Usage Guide\s*\(EN\)\n\n([\s\S]*?)(?=\n## |$)/,
    );
    if (usageEnMatch) usageGuideEn = usageEnMatch[1].trim();
    const archMatch = bodyAfterFm.match(/## Architecture Usage\n\n([\s\S]*?)(?=\n## |$)/);
    if (archMatch) rationaleText = archMatch[1].trim();
    const bpMatch = bodyAfterFm.match(/## Best Practices\n\n([\s\S]*?)(?=\n## |$)/);
    if (bpMatch) bestPracticesText = bpMatch[1].trim();
    const stdMatch = bodyAfterFm.match(/## Standards\n\n([\s\S]*?)(?=\n## |$)/);
    if (stdMatch) standardsText = stdMatch[1].trim();
  }

  return {
    title,
    language,
    category,
    trigger,
    summary,
    summaryEn,
    knowledgeType,
    complexity,
    scope,
    tags,
    headers,
    difficulty,
    authority,
    version,
    codePattern,
    usageGuide,
    usageGuideEn,
    rationaleText,
    bestPracticesText,
    standardsText,
    kind,
    doClause,
    dontClause,
    whenClause,
    topicHint,
  };
}

// ═══════════════════════════════════════════════════════
//  Request Payload Builders
// ═══════════════════════════════════════════════════════

/** 构建 POST /knowledge 请求体（从前端 item 转为 API payload） */
function toCandidatePayload(item: CandidateInput, targetName: string, source: string) {
  const categoryVal = Array.isArray(item.category) ? item.category[0] : item.category || targetName || 'general';
  return {
    // ── POST /api/v1/knowledge 必填字段 ──
    title: item.title || 'Untitled',
    content: item.content || { pattern: '', markdown: '', rationale: '' },
    // ── 候选元数据 ──
    description: item.description || '',
    trigger: item.trigger || '',
    language: item.language || '',
    category: categoryVal,
    kind: item.kind || 'pattern',
    knowledgeType: item.knowledgeType || 'code-pattern',
    complexity: item.complexity || 'intermediate',
    source: source || 'manual',
    lifecycle: 'pending',
    tags: item.tags || [],
    sourceFile: item.sourceFile || '',
    moduleName: item.moduleName || '',
    headers: item.headers || [],
    headerPaths: item.headerPaths || [],
    reasoning: {
      whyStandard: item.description || item.title || 'Extracted from project',
      sources: [source || 'unknown'],
      confidence: 0.6,
    },
    metadata: {
      targetName: targetName || '',
      title: item.title || '',
      trigger: item.trigger || '',
      description: item.description || '',
      category: categoryVal,
      headers: item.headers || [],
      headerPaths: item.headerPaths || [],
      moduleName: item.moduleName || '',
      isMarked: item.isMarked || false,
    },
  };
}

// ═══════════════════════════════════════════════════════
//  Helpers
// ═══════════════════════════════════════════════════════

/** 从 idOrName 解析 knowledge ID：如果看起来像 UUID/hash 则直接用，否则按标题搜索 */
async function resolveKnowledgeId(idOrName: string): Promise<string> {
  const cleaned = idOrName.replace(/\.md$/i, '');
  // 如果已经是 ID 格式（UUID 或 hash-like），直接返回
  if (/^[a-f0-9-]{8,}$/i.test(cleaned)) return cleaned;
  // 搜索 knowledge 条目
  const res = await http.get(`/knowledge?limit=1000`);
  const items = res.data?.data?.data || res.data?.data || [];
  const found = items.find((r: { title?: string; name?: string; id?: string }) => {
    const title = r.title || r.name || '';
    return title === cleaned || title + '.md' === idOrName;
  });
  if (found?.id) return found.id;
  throw new Error(`Knowledge entry not found: ${idOrName}`);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : null;
}

function readString(record: Record<string, unknown> | null, key: string): string | undefined {
  const value = record?.[key];
  return typeof value === 'string' ? value : undefined;
}

function parseHostManagedUnavailable(
  payload: unknown,
  status?: number,
  fallbackMessage = 'This AI capability is managed by the host environment.',
): HostManagedUnavailableDetails | null {
  const root = asRecord(payload);
  const data = asRecord(root?.data);
  const error = asRecord(root?.error);
  const code = readString(error, 'code') || readString(root, 'code') || readString(data, 'reason');
  const message =
    readString(error, 'message') ||
    readString(root, 'message') ||
    readString(data, 'message') ||
    fallbackMessage;
  const hostManaged =
    code === 'HOST_AI_MANAGED' ||
    root?.hostManaged === true ||
    data?.hostManaged === true ||
    status === 501 ||
    status === 410;

  if (!hostManaged) {
    return null;
  }

  return {
    code: 'HOST_AI_MANAGED',
    message,
    hostManaged: true,
    unavailable: root?.unavailable === true || data?.unavailable === true || status === 501 || status === 410,
    status,
    data: data || root || payload,
  };
}

function throwHostManagedIfPayload(payload: unknown, status?: number, fallbackMessage?: string): void {
  const details = parseHostManagedUnavailable(payload, status, fallbackMessage);
  if (details) {
    throw new HostManagedUnavailableError(details);
  }
}

function throwHostManagedFromError(err: unknown, fallbackMessage?: string): never {
  const maybeAxios = asRecord(err);
  const response = asRecord(maybeAxios?.response);
  const status = typeof response?.status === 'number' ? response.status : undefined;
  const data = response?.data;
  throwHostManagedIfPayload(data, status, fallbackMessage);
  throw err;
}

async function readJsonSafely(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════
//  SSE Stream Consumer — 统一协议 v2
// ═══════════════════════════════════════════════════════

/** SSE 统一协议事件类型 */
export type SSEEventType =
  | 'stream:start' | 'stream:done' | 'stream:error'
  | 'step:start' | 'step:end'
  | 'tool:start' | 'tool:end'
  | 'text:start' | 'text:delta' | 'text:end'
  | 'data:progress' | 'data:preview'
  | 'ping';

export interface SSEEvent {
  type: SSEEventType;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SSE events have dynamic payloads
  [key: string]: any;
}

/** AI 工具调用 */
export interface ToolCall {
  tool: string;
  args: Record<string, unknown>;
  result?: unknown;
}

/** 知识图谱边 */
export interface GraphEdge {
  id: number;
  fromId: string;
  fromType: string;
  toId: string;
  toType: string;
  relation: string;
  weight: number;
  metadata: Record<string, unknown>;
  [key: string]: unknown;
}

/** 搜索结果条目 */
export interface SearchResultItem {
  title: string;
  content: KnowledgeContent;
  score: number;
  qualityScore?: number;
  usageCount?: number;
  authorityScore?: number;
  matchType?: string;
  [key: string]: unknown;
}

/** 模型能力声明 */
export interface ModelCapabilities {
  toolCalling: boolean;
  vision: boolean;
  embedding: boolean;
  jsonMode: boolean;
  streaming: boolean;
}

/** 模型推理能力声明 */
export interface ModelReasoning {
  supported: boolean;
  mode?: string;
  defaultEffort?: string;
  effortLevels?: string[];
}

/** AI 模型信息 */
export interface AiProviderModelInfo {
  id: string;
  name: string;
  contextWindow: number;
  maxOutputTokens?: number;
  deprecated?: boolean;
  capabilities?: ModelCapabilities;
  reasoning?: ModelReasoning;
}

/** AI 服务商信息 */
export interface AiProviderInfo {
  id: string;
  label: string;
  defaultModel: string;
  hasKey?: boolean;
  isActive?: boolean;
  keyEnvVar?: string;
  baseUrl?: string;
  models?: AiProviderModelInfo[];
  [key: string]: unknown;
}

/** /ai/providers 接口返回 */
export interface AiProvidersResponse {
  providers: AiProviderInfo[];
  active: { provider: string; model: string };
}

/** /ai/probe 探测结果 */
export interface AiProbeResult {
  provider: string;
  status: 'connected' | 'error';
  latencyMs?: number;
  model?: string;
  error?: string;
  statusCode?: number;
}

/** Skill 元信息 */
export interface SkillInfo {
  name: string;
  source: 'builtin' | 'project';
  summary: string;
  useCase: string | null;
  createdBy: string | null;
  createdAt: string | null;
  description?: string;
  [key: string]: unknown;
}

/** 搜索 API 返回的原始结果条目 */
interface RawSearchResult {
  name?: string;
  content?: unknown;
  similarity?: number;
  qualityScore?: number;
  usageCount?: number;
  authority?: number;
  matchType?: string;
  [key: string]: unknown;
}

/**
 * 统一 SSE 流消费器 — 从 fetch Response 中逐行读取 SSE events
 *
 * 支持统一协议的所有事件类型:
 *   stream:start — 会话开始
 *   step:start   — 推理步骤开始
 *   tool:start   — 工具调用开始
 *   tool:end     — 工具调用结束
 *   text:start   — 文本流开始
 *   text:delta   — 文本分块
 *   text:end     — 文本流结束
 *   step:end     — 推理步骤结束
 *   data:progress — 进度事件（润色等场景）
 *   stream:done  — 会话完成
 *   stream:error — 会话错误
 *
 * @param response   fetch 返回的 Response（body 为 ReadableStream）
 * @param onEvent    收到任意事件时的完整回调
 * @returns          通过 text:delta 拼接的完整文本（chat 场景使用）
 */
async function _consumeSSE(
  response: Response,
  onEvent: (evt: SSEEvent) => void,
): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('ReadableStream not available');

  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';
  let chunkCount = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    chunkCount++;
    const text = decoder.decode(value, { stream: true });

    buffer += text;
    const lines = buffer.split('\n');
    // 保留最后一个不完整行
    buffer = lines.pop() || '';

    for (const line of lines) {
      // 心跳 :ping 注释 — 忽略
      if (line.startsWith(':')) continue;
      if (!line.startsWith('data: ')) continue;
      const payload = line.slice(6).trim();
      if (!payload || payload === '[DONE]') continue;

      try {
        const evt: SSEEvent = JSON.parse(payload);
        onEvent(evt);

        // text:delta — 拼接完整文本
        if (evt.type === 'text:delta' && evt.delta) {
          fullText += evt.delta;
        }
        // stream:done — 如果携带 text 则覆盖
        else if (evt.type === 'stream:done' && evt.text) {
          fullText = evt.text;
        }
        // stream:error — 抛出错误
        else if (evt.type === 'stream:error') {
          throw new Error(evt.message || 'Stream error');
        }
      } catch (e) {
        if (e instanceof SyntaxError) continue; // 非 JSON 行忽略
        throw e;
      }
    }
  }

  return fullText;
}

// ═══════════════════════════════════════════════════════
//  API Methods  (v2 — EventSource architecture)
// ═══════════════════════════════════════════════════════
export const api = {
  // ── Data (bulk fetch) ──────

  async fetchData(): Promise<ProjectData> {
    const [knowledgeRes, aiConfigRes, projectInfoRes, daemonHealthRes] = await Promise.all([
      http.get('/knowledge?limit=1000').catch(() => ({ data: { success: true, data: { data: [] } } })),
      http.get('/ai/config').catch(() => ({ data: { success: true, data: { provider: '', model: '' } } })),
      http.get('/modules/project-info').catch(() => ({ data: { success: true, data: { projectRoot: '' } } })),
      http.get('/daemon/health').catch(() => null),
    ]);

    // All knowledge entries from V3 backend
    const allEntries: KnowledgeEntry[] = knowledgeRes.data?.data?.data || knowledgeRes.data?.data?.items || [];

    // Recipes = active + evolving lifecycle entries
    const activeEntries = allEntries.filter((e) => e.lifecycle === 'active' || e.lifecycle === 'evolving');
    const recipes = activeEntries.map(toRecipe);

    // Candidates = pending + staging（两者都需要人工审核）
    const CANDIDATE_STATES = new Set(['pending', 'staging']);
    const rawEntries = allEntries.filter((e) => CANDIDATE_STATES.has(e.lifecycle));
    const candidates: ProjectData['candidates'] = {};
    for (const entry of rawEntries) {
      const target = candidateGroupKey(entry);
      if (!candidates[target]) {
        candidates[target] = { targetName: target, scanTime: entry.createdAt, items: [] };
      }
      candidates[target].items.push(entry);
    }

    // AI Config
    const aiConfig = aiConfigRes.data?.data || { provider: '', model: '' };

    // 全局 ID→标题 查找表 (将 UUID 关联解析为可读标题)
    const idTitleMap: Record<string, string> = {};
    for (const e of allEntries) {
      if (e.id && e.title) idTitleMap[e.id] = e.title;
    }

    // Project/runtime identity comes from backend contracts. Dashboard only normalizes it for display.
    const projectInfo = projectInfoRes.data?.data || {};
    const runtimeBoundary = normalizeRuntimeBoundary(projectInfo, daemonHealthRes?.data?.data);
    const projectRoot = runtimeBoundary.project.projectRoot || '';
    const projectName = firstString(projectInfo.projectName) || '';

    return {
      rootSpec: {},
      recipes,
      candidates,
      projectRoot,
      projectName,
      watcherStatus: watcherStatusFromRuntime(runtimeBoundary),
      runtimeBoundary,
      aiConfig: { provider: aiConfig.provider || '', model: aiConfig.model || '' },
      idTitleMap,
    };
  },

  // ── Projects runtime control (Alembic-owned HTTP contract) ──────

  async getProjectsSnapshot(): Promise<DashboardProjectsSnapshot> {
    const res = await http.get('/projects');
    return normalizeProjectsSnapshot(res.data?.data);
  },

  async getCurrentProjectSnapshot(): Promise<DashboardProjectsSnapshot> {
    const res = await http.get('/projects/current');
    const data = res.data?.data ?? {};
    return normalizeProjectsSnapshot({
      ...data,
      projects: [],
      generatedAt: null,
    });
  },

  async openProjectDashboard(projectId: string): Promise<DashboardProjectActionResult> {
    return postProjectAction(projectId, 'open-dashboard');
  },

  async switchProject(projectId: string): Promise<DashboardProjectActionResult> {
    return postProjectAction(projectId, 'switch');
  },

  async stopProject(projectId: string): Promise<DashboardProjectActionResult> {
    return postProjectAction(projectId, 'stop');
  },

  // ── Modules (多语言统一模块扫描) ───────

  async fetchTargets(): Promise<SPMTarget[]> {
    const res = await http.get('/modules/targets');
    const data = res.data?.data || {};
    return data.targets || [];
  },

  async getTargetFiles(target: SPMTarget, signal?: AbortSignal) {
    const res = await http.post('/modules/target-files', { target }, { signal });
    const data = res.data?.data || {};
    return { files: data.files || [], count: data.total || data.files?.length || 0 };
  },

  async scanTarget(target: SPMTarget, signal?: AbortSignal): Promise<{ recipes: ExtractedRecipe[]; scannedFiles: ScannedFile[]; message: string; noAi: boolean }> {
    const res = await http.post('/modules/scan', { target }, { signal, timeout: 600000 });
    const data = res.data?.data || {};
    const recipes = data.recipes || data.result || [];
    return { recipes, scannedFiles: (data.scannedFiles || []) as ScannedFile[], message: data.message || '', noAi: !!data.noAi };
  },

  /**
   * 流式 Target 扫描 — SSE Session + EventSource 架构
   * POST 创建 session → EventSource 消费进度事件 → scan:result 携带最终结果
   */
  async scanTargetStream(
    target: SPMTarget,
    onEvent: (event: Record<string, unknown>) => void,
    signal?: AbortSignal,
  ): Promise<{ recipes: ExtractedRecipe[]; scannedFiles: ScannedFile[]; message: string; noAi?: boolean }> {
    // Step 1: POST 创建流式扫描会话
    let sessionId: string;
    const startRes = await fetch('/api/v1/modules/scan/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target }),
      signal,
    });
    if (!startRes.ok) throw new Error(`Scan stream start failed: ${startRes.status}`);
    const startData = await startRes.json();
    sessionId = startData.sessionId;
    if (!sessionId) throw new Error(`No sessionId returned`);

    // Step 2: EventSource 消费 SSE 事件
    return new Promise((resolve, reject) => {
      const esUrl = `/api/v1/modules/scan/events/${sessionId}`;
      const es = new EventSource(esUrl);
      let resolved = false;
      let finalResult = { recipes: [] as ExtractedRecipe[], scannedFiles: [] as ScannedFile[], message: '', noAi: false };

      function cleanup() { es.close(); }

      es.onmessage = (e) => {
        try {
          const evt = JSON.parse(e.data);
          onEvent(evt);

          if (evt.type === 'scan:result') {
            finalResult = {
              recipes: evt.recipes || [],
              scannedFiles: (evt.scannedFiles || []) as ScannedFile[],
              message: evt.message || '',
              noAi: !!evt.noAi,
            };
          }

          if (evt.type === 'stream:done') {
            cleanup();
            resolved = true;
            resolve(finalResult);
          }

          if (evt.type === 'stream:error') {
            cleanup();
            resolved = true;
            reject(new Error(evt.message || 'Scan stream error'));
          }
        } catch { /* ignore JSON parse errors */ }
      };

      es.onerror = () => {
        if (!resolved) {
          cleanup();
          resolved = true;
          // If we already have results, resolve with them
          if (finalResult.recipes.length > 0) {
            resolve(finalResult);
          } else {
            reject(new Error('EventSource connection failed'));
          }
        }
      };

      if (signal) {
        const onAbort = () => {
          if (!resolved) {
            cleanup();
            resolved = true;
            reject(new DOMException('The operation was aborted.', 'AbortError'));
          }
        };
        if (signal.aborted) { onAbort(); return; }
        signal.addEventListener('abort', onAbort, { once: true });
      }
    });
  },

  /** 全项目扫描：AI 提取 + Guard 审计 */
  async scanProject(signal?: AbortSignal): Promise<{
    targets: string[];
    recipes: ExtractedRecipe[];
    guardAudit: import('./types').GuardAuditResult | null;
    scannedFiles: ScannedFile[];
    partial: boolean;
  }> {
    const res = await http.post('/modules/scan-project', {}, { signal, timeout: 600000 });
    const data = res.data?.data || {};
    return {
      targets: data.targets || [],
      recipes: data.recipes || [],
      guardAudit: data.guardAudit || null,
      scannedFiles: (data.scannedFiles || []) as ScannedFile[],
      partial: data.partial || false,
    };
  },

  /**
   * 浏览项目目录结构 — 供目录选择器使用
   */
  async browseDirectories(basePath = '', depth = 3): Promise<import('./types').ProjectDirectory[]> {
    const params = new URLSearchParams();
    if (basePath) params.set('path', basePath);
    if (depth) params.set('depth', String(depth));
    const res = await http.get(`/modules/browse-dirs?${params.toString()}`);
    return res.data?.data?.directories || [];
  },

  /**
   * 流式扫描任意目录 — SSE Session 架构
   * 复用已有 scan-events SSE 通道
   */
  async scanFolderStream(
    folderPath: string,
    onEvent: (event: Record<string, unknown>) => void,
    signal?: AbortSignal,
  ): Promise<{ recipes: ExtractedRecipe[]; scannedFiles: ScannedFile[]; message: string; noAi?: boolean }> {
    // Step 1: POST 创建流式扫描会话
    const startRes = await fetch('/api/v1/modules/scan-folder/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: folderPath }),
      signal,
    });
    if (!startRes.ok) throw new Error(`Scan folder start failed: ${startRes.status}`);
    const startData = await startRes.json();
    const sessionId = startData.sessionId;
    if (!sessionId) throw new Error('No sessionId returned');

    // Step 2: EventSource 消费 SSE 事件（复用已有通道）
    return new Promise((resolve, reject) => {
      const esUrl = `/api/v1/modules/scan/events/${sessionId}`;
      const es = new EventSource(esUrl);
      let resolved = false;
      let finalResult = { recipes: [] as ExtractedRecipe[], scannedFiles: [] as ScannedFile[], message: '', noAi: false };

      function cleanup() { es.close(); }

      es.onmessage = (e) => {
        try {
          const evt = JSON.parse(e.data);
          onEvent(evt);

          if (evt.type === 'scan:result') {
            finalResult = {
              recipes: evt.recipes || [],
              scannedFiles: (evt.scannedFiles || []) as ScannedFile[],
              message: evt.message || '',
              noAi: !!evt.noAi,
            };
          }

          if (evt.type === 'stream:done') {
            cleanup();
            resolved = true;
            resolve(finalResult);
          }

          if (evt.type === 'stream:error') {
            cleanup();
            resolved = true;
            reject(new Error(evt.message || 'Scan folder stream error'));
          }
        } catch { /* ignore */ }
      };

      es.onerror = () => {
        if (!resolved) {
          cleanup();
          resolved = true;
          if (finalResult.recipes.length > 0) {
            resolve(finalResult);
          } else {
            reject(new Error('EventSource connection failed'));
          }
        }
      };

      if (signal) {
        const onAbort = () => {
          if (!resolved) {
            cleanup();
            resolved = true;
            reject(new DOMException('The operation was aborted.', 'AbortError'));
          }
        };
        if (signal.aborted) { onAbort(); return; }
        signal.addEventListener('abort', onAbort, { once: true });
      }
    });
  },

  /** 冷启动：快速骨架 + 异步逐维度填充（v5） */
  async bootstrap(signal?: AbortSignal) {
    const res = await http.post('/modules/bootstrap', {}, { signal, timeout: 300000 });
    const data = res.data?.data || {};
    return {
      report: data.report || {},
      targets: data.targets || [],
      filesByTarget: data.filesByTarget || {},
      dependencyGraph: data.dependencyGraph || null,
      languageStats: data.languageStats || {},
      primaryLanguage: data.primaryLanguage || '',
      guardSummary: data.guardSummary || null,
      guardViolationFiles: data.guardViolationFiles || [],
      bootstrapCandidates: data.bootstrapCandidates || { created: 0, failed: 0 },
      bootstrapSession: data.bootstrapSession || null,
      asyncFill: data.asyncFill || false,
      job: data.job || null,
      jobId: data.jobId || data.job?.id || '',
      message: data.message || '',
    };
  },

  /** 查询 bootstrap 异步填充进度（Socket.io 不可用时的 fallback） */
  async getBootstrapStatus() {
    const res = await http.get('/modules/bootstrap/status');
    return res.data?.data || { status: 'idle' };
  },

  async listJobs(opts?: {
    kind?: 'bootstrap' | 'rescan';
    status?: DaemonJobRecord['status'];
    limit?: number;
  }): Promise<DaemonJobRecord[]> {
    const res = await http.get('/jobs', { params: opts || {} });
    return res.data?.data?.jobs || [];
  },

  async getJob(jobId: string): Promise<DaemonJobRecord | null> {
    const res = await http.get(`/jobs/${encodeURIComponent(jobId)}`);
    return res.data?.data?.job || null;
  },

  async cancelJob(jobId: string, reason?: string): Promise<DaemonJobRecord | null> {
    const res = await http.post(`/jobs/${encodeURIComponent(jobId)}/cancel`, { reason });
    return res.data?.data?.job || null;
  },

  async enqueueBootstrapJob(opts?: {
    contentMaxLines?: number;
    maxFiles?: number;
    skipGuard?: boolean;
  }): Promise<DaemonJobRecord> {
    const res = await http.post('/jobs/bootstrap', opts || {});
    return res.data?.data?.job;
  },

  async enqueueRescanJob(opts?: {
    dimensions?: string[];
    reason?: string;
  }): Promise<DaemonJobRecord> {
    const res = await http.post('/jobs/rescan', opts || {});
    return res.data?.data?.job;
  },

  /** 查询当前测试模式配置 */
  async getTestModeConfig(): Promise<{
    enabled: boolean;
    bootstrapDims: string[];
    rescanDims: string[];
    terminal: { enabled: boolean; toolset: string };
    sandbox: { mode: string; available: boolean };
  }> {
    const res = await http.get('/modules/test-mode');
    return res.data?.data || {
      enabled: false,
      bootstrapDims: [],
      rescanDims: [],
      terminal: { enabled: false, toolset: 'baseline' },
      sandbox: { mode: 'enforce', available: false },
    };
  },

  /** 取消正在运行的 bootstrap / rescan 异步填充 */
  async cancelBootstrap(reason?: string): Promise<{ success: boolean }> {
    const res = await http.post('/modules/bootstrap/cancel', { reason });
    return res.data || { success: true };
  },

  /** 增量扫描：保留已有 Recipe，重新分析项目，内部 AI 补齐缺失知识 */
  async rescan(opts?: { reason?: string; dimensions?: string[] }, signal?: AbortSignal) {
    const res = await http.post('/modules/rescan', opts || {}, { signal, timeout: 300000 });
    const data = res.data?.data || {};
    return {
      rescan: data.rescan || {},
      relevanceAudit: data.relevanceAudit || {},
      gapAnalysis: data.gapAnalysis || {},
      bootstrapSession: data.bootstrapSession || null,
      asyncFill: data.asyncFill || false,
      job: data.job || null,
      jobId: data.jobId || data.job?.id || '',
      status: data.status || 'complete',
      message: res.data?.message || '',
    };
  },

  async getDepGraph(level: string) {
    const res = await http.get(`/modules/dep-graph?level=${level}`);
    return res.data?.data || {};
  },

  /** 获取项目信息（检测到的语言、框架等） */
  async getProjectInfo() {
    try {
      const res = await http.get('/modules/project-info');
      return res.data?.data || {};
    } catch {
      return { primaryLanguage: 'unknown', discoverers: [], hasSpm: false };
    }
  },

  // ── Commands ────────────────────────────────────────

  async refreshProject(): Promise<void> {
    try {
      await http.post('/modules/update-map');
    } catch {
      await http.post('/commands/spm-map');
    }
  },

  // ── Extract ─────────────────────────────────────────

  async extractFromPath(
    relativePath: string,
  ): Promise<{ result: ExtractedRecipe[]; isMarked: boolean }> {
    const res = await http.post('/extract/path', { relativePath });
    const data = res.data?.data || {};
    return { result: data.result || [], isMarked: data.isMarked || false };
  },

  async extractFromText(
    text: string,
    relativePath?: string,
  ): Promise<ExtractedRecipe> {
    const res = await http.post('/extract/text', {
      text,
      ...(relativePath ? { relativePath } : {}),
    });
    const data = res.data?.data || {};
    // API returns {result: [], source} — take first item or the whole object
    if (Array.isArray(data.result) && data.result.length > 0) {
      return data.result[0];
    }
    // fallback: might return the item directly
    return data as ExtractedRecipe;
  },

  // ── Recipes ─────────────────────────────────────────

  /**
   * Save recipe from markdown content.
   * Parses frontmatter → structured data, creates or updates.
   */
  async saveRecipe(name: string, markdownContent: string): Promise<void> {
    const parsed = parseFrontmatter(markdownContent);
    const title = parsed.title || name.replace(/\.md$/, '');

    const dimensions = {
      trigger: parsed.trigger,
      headers: parsed.headers,
      difficulty: parsed.difficulty,
      authority: parsed.authority,
      version: parsed.version,
    };

    const contentObj = {
      pattern: parsed.codePattern || '',
      rationale: parsed.rationaleText || '',
      steps: parsed.bestPracticesText ? [parsed.bestPracticesText] : [],
      codeChanges: [],
      verification: null,
      markdown: parsed.usageGuide || '',
    };

    // 解析 Standards 文本为结构化 constraints
    const constraintsObj: Record<string, unknown> = {};
    if (parsed.standardsText) {
      // 解析 "**Preconditions:**\n- item1\n- item2" 格式
      const lines = parsed.standardsText.split('\n').map((l: string) => l.trim()).filter(Boolean);
      const preconditions = lines
        .filter((l: string) => l.startsWith('- '))
        .map((l: string) => l.slice(2).trim());
      if (preconditions.length > 0) {
        constraintsObj.preconditions = preconditions;
      }
      // 非列表内容保留为 boundaries
      const nonList = lines.filter((l: string) => !l.startsWith('- ') && !l.startsWith('**'));
      if (nonList.length > 0) {
        constraintsObj.boundaries = nonList;
      }
    }

    const recipeData: Record<string, unknown> = {
      title,
      language: parsed.language,
      category: parsed.category,
      description: parsed.summary,
      knowledgeType: parsed.knowledgeType || 'code-pattern',
      complexity: parsed.complexity || 'intermediate',
      scope: parsed.scope || null,
      tags: parsed.tags || [],
      content: contentObj,
      constraints: constraintsObj,
      dimensions,
    };
    if (parsed.kind) recipeData.kind = parsed.kind;
    if (parsed.doClause) recipeData.doClause = parsed.doClause;
    if (parsed.dontClause) recipeData.dontClause = parsed.dontClause;
    if (parsed.whenClause) recipeData.whenClause = parsed.whenClause;
    if (parsed.topicHint) recipeData.topicHint = parsed.topicHint;

    // Try to find existing recipe by ID or title → update
    try {
      const knowledgeId = await resolveKnowledgeId(name);
      await http.patch(`/knowledge/${knowledgeId}`, recipeData);
      return;
    } catch {
      /* create new */
    }

    await http.post('/knowledge', recipeData);
  },

  async deleteRecipe(idOrName: string): Promise<void> {
    // 优先用 ID（V3），否则按名称搜索
    const knowledgeId = await resolveKnowledgeId(idOrName);
    await http.delete(`/knowledge/${knowledgeId}`);
  },

  async getRecipeByName(
    name: string,
  ): Promise<{ name: string; content: string }> {
    const knowledgeId = await resolveKnowledgeId(name);
    const res = await http.get(`/knowledge/${knowledgeId}`);
    const r = res.data?.data;
    if (!r) throw new Error('Recipe not found');
    const c = r.content || {};
    return { name, content: c.pattern || c.markdown || '' };
  },

  async setRecipeAuthority(idOrName: string, authority: number): Promise<void> {
    const knowledgeId = await resolveKnowledgeId(idOrName);
    await http.patch(`/knowledge/${knowledgeId}/quality`, {
      codeCompleteness: authority,
      projectAdaptation: authority,
      documentationClarity: authority,
    });
  },

  async updateRecipeRelations(idOrName: string, relations: Record<string, unknown[]>): Promise<void> {
    const knowledgeId = await resolveKnowledgeId(idOrName);
    await http.patch(`/knowledge/${knowledgeId}`, { relations });
  },

  // searchRecipes — removed, use search() instead

  // ── Candidates (via V3 Knowledge API) ──────────────────────────────────────

  /** 获取单个知识条目详情 */
  async getCandidate(candidateId: string): Promise<KnowledgeEntry> {
    const res = await http.get(`/knowledge/${candidateId}`);
    const raw = res.data?.data;
    if (!raw) throw new Error('Knowledge entry not found');
    return raw as KnowledgeEntry;
  },

  async deleteCandidate(candidateId: string): Promise<void> {
    await http.delete(`/knowledge/${candidateId}`);
  },

  /** 一键将 Candidate 发布为 Recipe (V3: publish → active) */
  async promoteCandidateToRecipe(candidateId: string, _overrides?: Record<string, unknown>): Promise<{ recipe: KnowledgeEntry; candidate: KnowledgeEntry }> {
    const res = await http.patch(`/knowledge/${candidateId}/publish`);
    const entry = res.data?.data;
    return { recipe: entry, candidate: entry };
  },

  /** AI 语义字段补全 — 对候选批量补充缺失字段 */
  async enrichCandidates(candidateIds: string[]): Promise<{
    enriched: number;
    total: number;
    results: Array<{ id: string; enriched: boolean; filledFields?: string[]; skipped?: boolean; reason?: string }>;
    hostManaged?: boolean;
    unavailable?: boolean;
    message?: string;
  }> {
    try {
      const res = await http.post('/candidates/enrich', { candidateIds });
      const fallback = { enriched: 0, total: 0, results: [] };
      const data = (res.data?.data || fallback) as typeof fallback & {
        hostManaged?: boolean;
        unavailable?: boolean;
        message?: string;
      };
      const hostManaged = parseHostManagedUnavailable(res.data, res.status, data.message);
      return {
        ...data,
        hostManaged: data.hostManaged === true || Boolean(hostManaged),
        unavailable: data.unavailable === true || hostManaged?.unavailable,
        message: data.message || hostManaged?.message,
      };
    } catch (err: unknown) {
      throwHostManagedFromError(err, 'Candidate enrichment is managed by the host environment.');
    }
  },

  /** ② 内容润色 — 对 Bootstrap 候选进行 AI 精炼（支持自定义提示词） */
  async bootstrapRefine(candidateIds?: string[], userPrompt?: string, dryRun?: boolean): Promise<{ refined: number; total: number; errors: unknown[]; results: unknown[] }> {
    try {
      const res = await http.post('/candidates/bootstrap-refine', { candidateIds, userPrompt, dryRun }, { timeout: 300000 });
      throwHostManagedIfPayload(res.data, res.status, 'Candidate refinement is managed by the host environment.');
      return res.data?.data || { refined: 0, total: 0, errors: [], results: [] };
    } catch (err: unknown) {
      throwHostManagedFromError(err, 'Candidate refinement is managed by the host environment.');
    }
  },

  /** 对话式润色 — 预览：单条候选 dryRun，返回 before/after 对比 */
  async refinePreview(candidateId: string, userPrompt?: string): Promise<{ candidateId: string; before: Record<string, unknown>; after: Record<string, unknown>; preview: Record<string, unknown> }> {
    try {
      const res = await http.post('/candidates/refine-preview', { candidateId, userPrompt }, { timeout: 120000 });
      throwHostManagedIfPayload(res.data, res.status, 'Candidate refine preview is managed by the host environment.');
      return res.data?.data || {};
    } catch (err: unknown) {
      throwHostManagedFromError(err, 'Candidate refine preview is managed by the host environment.');
    }
  },

  /** 对话式润色 — 应用：确认写入变更（优先传 preview 避免二次 AI 调用） */
  async refineApply(candidateId: string, userPrompt?: string, preview?: Record<string, unknown>): Promise<{ refined: number; total: number; candidate: KnowledgeEntry }> {
    try {
      const res = await http.post('/candidates/refine-apply', { candidateId, userPrompt, preview }, { timeout: 120000 });
      throwHostManagedIfPayload(res.data, res.status, 'Candidate refine apply requires a host-generated preview.');
      return res.data?.data || {};
    } catch (err: unknown) {
      throwHostManagedFromError(err, 'Candidate refine apply requires a host-generated preview.');
    }
  },

  /** 获取全量知识图谱（边 + 节点标签） */
  async getKnowledgeGraph(limit = 500): Promise<{ edges: GraphEdge[]; nodeLabels: Record<string, string>; nodeTypes: Record<string, string>; nodeCategories: Record<string, string> }> {
    const res = await http.get(`/search/graph/all?limit=${limit}`);
    return res.data?.data || { edges: [], nodeLabels: {}, nodeTypes: {}, nodeCategories: {} };
  },

  /** 获取知识图谱统计 */
  async getGraphStats(): Promise<{ totalEdges: number; byRelation: Record<string, number>; nodeTypes: unknown[] }> {
    const res = await http.get('/search/graph/stats');
    return res.data?.data || { totalEdges: 0, byRelation: {}, nodeTypes: [] };
  },

  /** AI 批量发现 Recipe 知识图谱关系（异步启动） */
  async discoverRelations(batchSize = 20): Promise<{ status: string; startedAt?: string; message?: string; error?: string }> {
    const res = await http.post('/recipes/discover-relations', { batchSize });
    if (!res.data?.success) throw new Error(res.data?.error?.message || '启动失败');
    return res.data?.data || { status: 'unknown' };
  },

  /** 查询关系发现任务状态 */
  async getDiscoverRelationsStatus(): Promise<{ status: string; discovered?: number; totalPairs?: number; batchErrors?: number; error?: string; elapsed?: number; message?: string; startedAt?: string }> {
    const res = await http.get('/recipes/discover-relations/status');
    return res.data?.data || { status: 'idle' };
  },

  async deleteAllCandidatesInTarget(targetName: string): Promise<{ deleted: number }> {
    // V3: list all entries with this category then delete individually
    const res = await http.get(`/knowledge?category=${encodeURIComponent(targetName)}&limit=1000`);
    const items = res.data?.data?.data || [];
    let deleted = 0;
    for (const item of items) {
      try {
        await http.delete(`/knowledge/${item.id}`);
        deleted++;
      } catch { /* skip */ }
    }
    return { deleted };
  },

  async promoteToCandidate(
    item: CandidateInput,
    targetName: string,
  ): Promise<{ ok: boolean; candidateId: string }> {
    const data = toCandidatePayload(item, targetName, 'review-promote');
    const res = await http.post('/knowledge', data);
    return { ok: true, candidateId: res.data?.data?.id || '' };
  },

  // ── AI ──────────────────────────────────────────────

  async getAiProviders(): Promise<AiProviderInfo[]> {
    const res = await http.get('/ai/providers');
    const data = res.data?.data;
    if (data?.providers) {
      return data.providers;
    }
    return Array.isArray(data) ? data : [];
  },

  async getAiProvidersEnhanced(): Promise<AiProvidersResponse> {
    const res = await http.get('/ai/providers');
    const data = res.data?.data;
    if (data?.providers) {
      return data;
    }
    return { providers: Array.isArray(data) ? data : [], active: { provider: '', model: '' } };
  },

  async probeProvider(provider: string, apiKey?: string): Promise<AiProbeResult> {
    const res = await http.post('/ai/probe', { provider, apiKey });
    return res.data?.data || { provider, status: 'error', error: 'Unknown error' };
  },

  async setAiConfig(
    provider: string,
    model: string,
  ): Promise<{ provider: string; model: string }> {
    const res = await http.post('/ai/config', { provider, model });
    return res.data?.data || { provider, model };
  },

  async cleanupMockData(): Promise<{ deleted: number }> {
    const res = await http.post('/ai/mock/cleanup');
    return res.data?.data || { deleted: 0 };
  },

  async chat(
    prompt: string,
    history: Array<{ role: string; content: string }>,
    signal?: AbortSignal,
  ): Promise<{ text: string; hasContext?: boolean }> {
    const res = await http.post('/ai/chat', { prompt, history }, { signal });
    const data = res.data?.data || {};
    return { text: data.reply || data.text || '', hasContext: data.hasContext };
  },

  /**
   * 流式 AI 对话 (SSE) — 统一协议 v2
   *
   * 事件类型（按时间顺序）:
   *   - stream:start  — 会话开始
   *   - step:start    — 新推理步骤 { step, maxSteps, phase }
   *   - tool:start    — 工具调用开始 { id, tool, args }
   *   - tool:end      — 工具调用结束 { tool, status, resultSize?, duration?, error? }
   *   - text:start    — 文本流开始 { id, role }
   *   - text:delta    — 文本分块 { id, delta }  ← 逐块推送，前端可逐字渲染
   *   - text:end      — 文本流结束 { id }
   *   - step:end      — 推理步骤结束 { step }
   *   - stream:done   — 全部完成 { text, toolCalls, hasContext }
   *   - stream:error  — 错误 { message }
   *
   * @param prompt       用户消息
   * @param history      对话历史
   * @param onEvent      每收到一个 SSE 事件的回调（前端根据 type 分别处理）
   * @param signal       可选 AbortSignal
   * @returns            { text, toolCalls, hasContext }
   */
  async chatStream(
    prompt: string,
    history: Array<{ role: string; content: string }>,
    onEvent: (event: SSEEvent) => void,
    signal?: AbortSignal,
    /** UI language preference — forwarded to Agent for reply language control */
    lang?: 'zh' | 'en',
  ): Promise<{ text: string; toolCalls?: ToolCall[]; hasContext?: boolean }> {

    // ── Step 1: POST 启动对话 ──
    const startRes = await fetch('/api/v1/ai/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, history, ...(lang ? { lang } : {}) }),
      signal,
    });
    const contentType = startRes.headers.get('content-type') || '';

    if (!startRes.ok) {
      const errorData = contentType.includes('application/json') ? await readJsonSafely(startRes) : null;
      throwHostManagedIfPayload(errorData, startRes.status, 'AI chat is managed by the host environment.');
      throw new Error(`Chat start failed: ${startRes.status}`);
    }

    // ── 兼容检测: 旧后端返回 text/event-stream, 新后端返回 JSON ──
    if (contentType.includes('text/event-stream')) {
      // 旧后端 — 直接用 fetch ReadableStream 消费 SSE（降级模式）
      let finalResult: { text: string; toolCalls?: ToolCall[]; hasContext?: boolean } = { text: '' };
      const fullText = await _consumeSSE(startRes, (evt) => {
        onEvent(evt);
        if (evt.type === 'stream:done') {
          if (evt.text) finalResult.text = evt.text;
          finalResult.toolCalls = evt.toolCalls;
          finalResult.hasContext = evt.hasContext;
        }
      });
      if (!finalResult.text && fullText) finalResult.text = fullText;
      return finalResult;
    }

    // ── 新后端: 获取 sessionId → EventSource ──
    const startData = await readJsonSafely(startRes);
    throwHostManagedIfPayload(startData, startRes.status, 'AI chat is managed by the host environment.');
    const startRecord = asRecord(startData);
    const startPayload = asRecord(startRecord?.data) || startRecord;
    const sessionId = readString(startPayload, 'sessionId');
    if (!sessionId) throw new Error(`No sessionId returned: ${JSON.stringify(startData)}`);

    // ── Step 2: 通过 EventSource 消费 SSE 事件 ──
    return new Promise<{ text: string; toolCalls?: ToolCall[]; hasContext?: boolean }>((resolve, reject) => {
      const esUrl = `/api/v1/ai/chat/events/${sessionId}`;
      const es = new EventSource(esUrl);
      let fullText = '';
      let finalResult: { text: string; toolCalls?: ToolCall[]; hasContext?: boolean } = { text: '' };
      let resolved = false;

      function cleanup() {
        es.close();
      }

      es.onmessage = (e) => {
        try {
          const evt: SSEEvent = JSON.parse(e.data);

          // 跳过内部的 stream:start（EventSource 基础设施事件）
          if (evt.type === 'stream:start') return;

          // 交付事件给上层回调
          onEvent(evt);

          // 累积 text:delta 文本
          if (evt.type === 'text:delta' && evt.delta) {
            fullText += evt.delta;
          }

          // 会话完成
          if (evt.type === 'stream:done') {
            finalResult = {
              text: evt.text || fullText,
              toolCalls: evt.toolCalls,
              hasContext: evt.hasContext,
            };
            cleanup();
            resolved = true;
            resolve(finalResult);
          }

          // 会话错误
          if (evt.type === 'stream:error') {
            cleanup();
            resolved = true;
            reject(new Error(evt.message || 'Stream error'));
          }
        } catch {
          // 忽略 JSON 解析错误
        }
      };

      es.onerror = () => {
        if (!resolved) {
          cleanup();
          if (fullText) {
            resolved = true;
            resolve({ text: fullText });
          } else {
            resolved = true;
            reject(new Error('EventSource connection failed'));
          }
        }
      };

      // 处理 AbortSignal
      if (signal) {
        const onAbort = () => {
          if (!resolved) {
            cleanup();
            resolved = true;
            reject(new DOMException('The operation was aborted.', 'AbortError'));
          }
        };
        if (signal.aborted) {
          onAbort();
        } else {
          signal.addEventListener('abort', onAbort, { once: true });
        }
      }
    });
  },

  /**
   * 润色预览 (SSE) — 统一协议 v2
   * 不再推送 JSON 碎片，改为进度事件 + 最终结构化结果
   *
   * 事件类型:
   *   - stream:start   — 会话开始
   *   - data:progress   — AI 润色进度 { stage, message }
   *   - stream:done     — 完成 { candidateId, before, after, preview }
   *   - stream:error    — 错误 { message }
   *
   * @param candidateId  候选条目 ID
   * @param userPrompt   用户润色指令
   * @param onEvent      每收到一个 SSE 事件的回调（前端根据 type 处理进度 UI）
   * @param signal       可选 AbortSignal
   * @returns            { candidateId, before, after, preview }
   */
  async refinePreviewStream(
    candidateId: string,
    userPrompt: string,
    onEvent: (event: SSEEvent) => void,
    signal?: AbortSignal,
  ): Promise<{ candidateId: string; before: Record<string, unknown>; after: Record<string, unknown>; preview: Record<string, unknown> | null }> {
    // Step 1: POST 创建流式润色会话
    const startRes = await fetch('/api/v1/candidates/refine-preview-stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidateId, userPrompt }),
      signal,
    });
    const contentType = startRes.headers.get('content-type') || '';
    if (!startRes.ok) {
      const errorData = contentType.includes('application/json') ? await readJsonSafely(startRes) : null;
      throwHostManagedIfPayload(errorData, startRes.status, 'Candidate refine preview is managed by the host environment.');
      throw new Error(`Refine stream start failed: ${startRes.status}`);
    }
    const startData = await readJsonSafely(startRes);
    throwHostManagedIfPayload(startData, startRes.status, 'Candidate refine preview is managed by the host environment.');
    const startRecord = asRecord(startData);
    const startPayload = asRecord(startRecord?.data) || startRecord;
    const sessionId = readString(startPayload, 'sessionId');
    if (!sessionId) throw new Error(`No sessionId returned: ${JSON.stringify(startData)}`);

    // Step 2: EventSource 消费 SSE 事件
    return new Promise((resolve, reject) => {
      const esUrl = `/api/v1/candidates/refine-preview/events/${sessionId}`;
      const es = new EventSource(esUrl);
      let resolved = false;

      function cleanup() { es.close(); }

      // 如果外部 signal 触发 abort，关闭 EventSource
      if (signal) {
        signal.addEventListener('abort', () => {
          cleanup();
          if (!resolved) {
            resolved = true;
            reject(new DOMException('Aborted', 'AbortError'));
          }
        }, { once: true });
      }

      es.onmessage = (e) => {
        try {
          const evt: SSEEvent = JSON.parse(e.data);
          onEvent(evt);

          if (evt.type === 'stream:done') {
            cleanup();
            resolved = true;
            resolve({
              candidateId: (evt.candidateId as string) || candidateId,
              before: (evt.before as Record<string, unknown>) || {},
              after: (evt.after as Record<string, unknown>) || {},
              preview: (evt.preview as Record<string, unknown>) || null,
            });
          }

          if (evt.type === 'stream:error') {
            cleanup();
            resolved = true;
            reject(new Error((evt.message as string) || 'Refine stream error'));
          }
        } catch {
          // ignore parse errors
        }
      };

      es.onerror = () => {
        cleanup();
        if (!resolved) {
          resolved = true;
          reject(new Error('Refine EventSource connection lost'));
        }
      };
    });
  },

  async summarizeCode(code: string, language: string): Promise<Record<string, unknown>> {
    const res = await http.post('/ai/summarize', { code, language });
    return res.data?.data || res.data || {};
  },

  async translate(
    summary: string,
    usageGuide: string,
  ): Promise<{ summaryEn: string; usageGuideEn: string; warning?: string }> {
    const res = await http.post('/ai/translate', { summary, usageGuide });
    const data = res.data?.data || { summaryEn: '', usageGuideEn: '' };
    if (res.data?.warning) data.warning = res.data.warning;
    return data;
  },

  // ── Search (统一入口) ─────────────────────────────────

  /**
   * 统一搜索 — 合并 keyword/weighted/semantic/auto/context-aware 全场景
   *
   * - 无 context → GET /search (keyword/weighted/semantic/auto)
   * - 有 context → POST /search/context-aware (FieldWeighted + Ranking + ContextBoost)
   *
   * 返回的 items 中 content 已从 JSON 字符串解析为对象。
   */
  async search(
    query: string,
    options: {
      mode?: 'keyword' | 'weighted' | 'bm25' | 'semantic' | 'auto';
      type?: string;
      limit?: number;
      signal?: AbortSignal;
      context?: { language?: string; sessionHistory?: unknown[]; [key: string]: unknown };
    } = {},
  ): Promise<{ items: SearchResultItem[]; total: number; mode?: string; ranked?: boolean }> {
    const { mode = 'auto', type, limit = 20, signal, context } = options;

    // 解析 content JSON 字符串为对象
    const parseContent = (raw: unknown): KnowledgeContent => {
      if (!raw) return {} as KnowledgeContent;
      if (typeof raw === 'object') return raw as KnowledgeContent;
      try { return JSON.parse(String(raw)) as KnowledgeContent; } catch { return { markdown: String(raw) }; }
    };

    // ── 有 context: POST /search/context-aware ──
    if (context) {
      const res = await http.post('/search/context-aware', {
        keyword: query, limit,
        language: context.language,
        sessionHistory: context.sessionHistory || [],
      }, { signal }).catch(() => ({ data: { data: {} } }));
      const data = res.data?.data || {};
      const items: SearchResultItem[] = (data.results || []).map((r: RawSearchResult) => {
        const content = parseContent(r.content);
        return {
          title: (r.name || '').replace(/\.md$/, ''),
          content,
          score: r.similarity || 0,
          qualityScore: r.qualityScore || 0,
          usageCount: r.usageCount || 0,
          authorityScore: r.authority || 0,
          matchType: r.matchType,
        };
      });
      return { items, total: data.total || items.length, mode: 'weighted', ranked: true };
    }

    // ── 无 context: GET /search ──
    const params = new URLSearchParams({ q: query, mode, limit: String(limit) });
    if (type) params.set('type', type);
    const res = await http.get(`/search?${params}`, { signal });
    const data = res.data?.data || {};
    const items: SearchResultItem[] = (data.items || []).map((r: RawSearchResult) => ({
      ...r,
      content: parseContent(r.content),
    }));
    return {
      items,
      total: data.totalResults || data.total || items.length,
      mode: data.mode,
      ranked: data.ranked,
    };
  },

  // ── Guard ───────────────────────────────────────────

  async getGuardRules(): Promise<{ rules: Record<string, any>; projectLanguages: string[] }> {
    const res = await http.get('/rules?limit=100');
    const data = res.data?.data || {};
    const items: Array<{ id: string; [key: string]: unknown }> = data.data || data.items || [];
    const rules: Record<string, Record<string, unknown>> = {};
    for (const r of items) {
      rules[r.id] = r;
    }
    return { rules, projectLanguages: data.projectLanguages || [] };
  },

  async getGuardViolations(): Promise<{ runs: any[] }> {
    const res = await http.get('/violations');
    const data = res.data?.data || {};
    return { runs: data.data || data.items || [] };
  },

  async clearViolations(): Promise<void> {
    await http.post('/violations/clear', { all: true });
  },

  async saveGuardRule(ruleData: Record<string, unknown>): Promise<Record<string, unknown>> {
    const res = await http.post('/rules', ruleData);
    return res.data?.data || {};
  },

  // ── Misc ────────────────────────────────────────────

  /** Stub — not fully implemented */
  async insertAtSearchMark(_data: Record<string, unknown>): Promise<{ success: boolean }> {
    return { success: false };
  },

  // ── Skills ──────────────────────────────────────────

  /** 获取所有 Skills 列表 */
  async listSkills(): Promise<{ skills: SkillInfo[]; total: number; hint?: string }> {
    const res = await http.get('/skills');
    return res.data?.data || { skills: [], total: 0 };
  },

  /** 加载指定 Skill 完整内容 */
  async loadSkill(name: string, section?: string): Promise<{
    skillName: string; source: string; content: string; charCount: number;
    useCase: string | null; relatedSkills: string[]; createdBy: string | null; createdAt: string | null;
  }> {
    const params = section ? `?section=${encodeURIComponent(section)}` : '';
    const res = await http.get(`/skills/${encodeURIComponent(name)}${params}`);
    return res.data?.data || {};
  },

  /** 创建项目级 Skill */
  async createSkill(data: { name: string; description: string; content: string; overwrite?: boolean; createdBy?: string }): Promise<Record<string, unknown>> {
    const res = await http.post('/skills', data);
    return res.data?.data || {};
  },

  /** 更新项目级 Skill */
  async updateSkill(name: string, data: { description?: string; content?: string }): Promise<Record<string, unknown>> {
    const res = await http.put(`/skills/${encodeURIComponent(name)}`, data);
    return res.data?.data || {};
  },

  /** 删除项目级 Skill */
  async deleteSkill(name: string): Promise<Record<string, unknown>> {
    const res = await http.delete(`/skills/${encodeURIComponent(name)}`);
    return res.data?.data || {};
  },

  /** AI 生成 Skill 内容（通过 ChatAgent 对话） */
  async aiGenerateSkill(prompt: string): Promise<{ reply: string; hasContext?: boolean }> {
    const systemPrompt = `你是一个 Alembic Skill 文档生成助手。用户会描述他们想创建的 Skill，你需要生成完整的 SKILL.md 内容。

Skill 文档格式要求：
1. 开头用 Markdown 标题说明 Skill 的目的
2. 包含清晰的使用场景说明
3. 列出具体的操作步骤和指南
4. 如有必要，包含代码示例
5. 使用中文撰写

请严格按以下格式输出（不要用代码块包裹 JSON）：

第一行：一个 JSON 对象，包含 name（kebab-case，3-64 字符）和 description（一句话中文描述）
第二行：空行
第三行起：Skill 文档正文内容（Markdown 格式，不含 frontmatter）

示例输出：
{"name": "swiftui-animation-guide", "description": "SwiftUI 动画最佳实践指南"}

# SwiftUI 动画最佳实践

## 使用场景
...`;

    const res = await http.post('/ai/chat', {
      prompt: `${systemPrompt}\n\n用户需求：${prompt}`,
      history: [],
    });
    return res.data?.data || { reply: '' };
  },

  // ── LLM workspace settings ─────────────────────────

  /** 读取 Alembic 工作区中的 LLM 配置 */
  async getLlmEnvConfig(): Promise<{
    vars: Record<string, string>;
    hasSettingsFile?: boolean;
    hasSecretsFile?: boolean;
    settingsPath?: string;
    secretsPath?: string;
    configSource?: 'workspace-settings' | 'process-env' | 'empty';
    llmReady: boolean;
  }> {
    const res = await http.get('/ai/env-config');
    return res.data?.data || { vars: {}, llmReady: false };
  },

  /** 近 7 日 Token 消耗报告 */
  async getTokenUsage7Days(): Promise<{
    daily: Array<{ date: string; input_tokens: number; output_tokens: number; total_tokens: number; call_count: number }>;
    bySource: Array<{ source: string; input_tokens: number; output_tokens: number; total_tokens: number; call_count: number }>;
    summary: { input_tokens: number; output_tokens: number; total_tokens: number; call_count: number; avg_per_call: number };
  }> {
    const res = await http.get('/ai/token-usage');
    return res.data?.data || { daily: [], bySource: [], summary: { input_tokens: 0, output_tokens: 0, total_tokens: 0, call_count: 0, avg_per_call: 0 } };
  },

  /** 写入 / 更新 Alembic 工作区中的 LLM 配置 */
  async saveLlmEnvConfig(config: {
    provider: string;
    model?: string;
    apiKey?: string;
    proxy?: string;
    reasoningEffort?: string;
    embedProvider?: string;
    embedModel?: string;
    embedBaseUrl?: string;
    embedApiKey?: string;
    providerKeys?: Record<string, string>;
  }): Promise<{
    vars: Record<string, string>;
    hasSettingsFile?: boolean;
    hasSecretsFile?: boolean;
    settingsPath?: string;
    secretsPath?: string;
    configSource?: 'workspace-settings' | 'process-env' | 'empty';
    llmReady: boolean;
  }> {
    const res = await http.post('/ai/env-config', config);
    return res.data?.data || { vars: {}, llmReady: false };
  },

  // ═══════════════════════════════════════════════════════
  //  V3 Knowledge API — 统一知识条目（直通 wire format，无映射）
  // ═══════════════════════════════════════════════════════

  /** 获取知识条目列表（V3 统一 API） */
  async knowledgeList(params: {
    page?: number;
    limit?: number;
    lifecycle?: KnowledgeLifecycle;
    kind?: KnowledgeKind;
    category?: string;
    language?: string;
    keyword?: string;
    tag?: string;
    source?: string;
  } = {}): Promise<KnowledgePaginatedResponse> {
    const query = new URLSearchParams();
    if (params.page) query.set('page', String(params.page));
    if (params.limit) query.set('limit', String(params.limit));
    if (params.lifecycle) query.set('lifecycle', params.lifecycle);
    if (params.kind) query.set('kind', params.kind);
    if (params.category) query.set('category', params.category);
    if (params.language) query.set('language', params.language);
    if (params.keyword) query.set('keyword', params.keyword);
    if (params.tag) query.set('tag', params.tag);
    if (params.source) query.set('source', params.source);
    const qs = query.toString();
    const res = await http.get(`/knowledge${qs ? `?${qs}` : ''}`);
    return res.data?.data || { data: [], pagination: { page: 1, pageSize: 20, total: 0 } };
  },

  /** 获取知识条目统计 */
  async knowledgeStats(): Promise<KnowledgeStatsResponse> {
    const res = await http.get('/knowledge/stats');
    return res.data?.data || { total: 0, pending: 0, active: 0, deprecated: 0, rules: 0, patterns: 0, facts: 0 };
  },

  /** 获取知识条目详情 */
  async knowledgeGet(id: string): Promise<KnowledgeEntry> {
    const res = await http.get(`/knowledge/${id}`);
    return res.data?.data;
  },

  /** 创建知识条目 */
  async knowledgeCreate(data: Partial<KnowledgeEntry>): Promise<KnowledgeEntry> {
    const res = await http.post('/knowledge', data);
    return res.data?.data;
  },

  /** 更新知识条目 */
  async knowledgeUpdate(id: string, data: Partial<KnowledgeEntry>): Promise<KnowledgeEntry> {
    const res = await http.patch(`/knowledge/${id}`, data);
    return res.data?.data;
  },

  /** 删除知识条目 */
  async knowledgeDelete(id: string): Promise<void> {
    await http.delete(`/knowledge/${id}`);
  },

  /** 知识条目生命周期操作 */
  async knowledgeLifecycle(id: string, action: string, reason?: string): Promise<KnowledgeEntry> {
    const res = await http.patch(`/knowledge/${id}/${action}`, reason ? { reason } : {});
    return res.data?.data;
  },

  /** 批量发布 */
  async knowledgeBatchPublish(ids: string[]): Promise<{ published: KnowledgeEntry[]; failed: Array<{ id: string; error: string }>; successCount: number; failureCount: number }> {
    const res = await http.post('/knowledge/batch-publish', { ids });
    return res.data?.data || { published: [], failed: [], successCount: 0, failureCount: 0 };
  },

  /** 批量删除 */
  async knowledgeBatchDelete(ids: string[]): Promise<{ deletedCount: number; failureCount: number; failed: Array<{ id: string; error: string }> }> {
    const res = await http.post('/knowledge/batch-delete', { ids });
    return res.data?.data || { deletedCount: 0, failureCount: 0, failed: [] };
  },

  /** 批量废弃 */
  async knowledgeBatchDeprecate(ids: string[], reason?: string): Promise<{ deprecated: KnowledgeEntry[]; failed: Array<{ id: string; error: string }>; successCount: number; failureCount: number }> {
    const res = await http.post('/knowledge/batch-deprecate', { ids, reason });
    return res.data?.data || { deprecated: [], failed: [], successCount: 0, failureCount: 0 };
  },

  /** 记录使用 */
  async knowledgeRecordUsage(id: string, type: string = 'adoption', feedback?: string): Promise<void> {
    await http.post(`/knowledge/${id}/usage`, { type, feedback });
  },

  /** 重新计算质量评分 */
  async knowledgeUpdateQuality(id: string): Promise<{ quality: KnowledgeQuality }> {
    const res = await http.patch(`/knowledge/${id}/quality`);
    return res.data?.data || { quality: {} };
  },

  // ── Wiki ──────────────────────────────────────────────

  /** 触发 Wiki 全量生成 */
  async wikiGenerate(): Promise<void> {
    await http.post('/wiki/generate');
  },

  /** 触发 Wiki 增量更新 */
  async wikiUpdate(): Promise<void> {
    await http.post('/wiki/update');
  },

  /** 中止 Wiki 生成 */
  async wikiAbort(): Promise<void> {
    await http.post('/wiki/abort');
  },

  /** 获取 Wiki 状态 */
  async wikiStatus(): Promise<{
    task: {
      status: 'idle' | 'running' | 'done' | 'error';
      phase?: string;
      progress?: number;
      message?: string;
      startedAt?: number;
      finishedAt?: number;
      result?: any;
      error?: string;
    };
    wiki?: {
      exists: boolean;
      generatedAt?: string;
      filesCount?: number;
      version?: string;
      hasChanges?: boolean;
    };
  }> {
    const res = await http.get('/wiki/status');
    return res.data?.data || { task: { status: 'idle' } };
  },

  /** 列出 Wiki 文件 */
  async wikiFiles(): Promise<{ files: Array<{ path: string; name: string; size: number; modifiedAt: string }>; exists: boolean }> {
    const res = await http.get('/wiki/files');
    return res.data?.data || { files: [], exists: false };
  },

  /** 读取 Wiki 文件内容 */
  async wikiFileContent(filePath: string): Promise<{ path: string; content: string; size: number }> {
    const res = await http.get(`/wiki/file/${filePath}`);
    return res.data?.data || { path: filePath, content: '', size: 0 };
  },

  // ── Language preference ──────

  /** 获取服务端默认 UI 语言 */
  async getLang(): Promise<'zh' | 'en'> {
    const res = await http.get('/ai/lang');
    return res.data?.data?.lang || 'zh';
  },

  /** 同步 UI 语言偏好到服务端 */
  async setLang(lang: 'zh' | 'en'): Promise<void> {
    await http.post('/ai/lang', { lang });
  },

  // ── Panorama ──────────────────

  /** 获取项目全景概览 */
  async getPanoramaOverview(refresh = false): Promise<{
    projectRoot: string;
    moduleCount: number;
    layerCount: number;
    totalFiles: number;
    totalRecipes: number;
    overallCoverage: number;
    layers: {
      level: number;
      name: string;
      modules: { name: string; role: string; fileCount: number; recipeCount: number }[];
    }[];
    cycleCount: number;
    gapCount: number;
    healthRadar: {
      dimensions: {
        id: string;
        name: string;
        description: string;
        recipeCount: number;
        score: number;
        status: string;
        level: string;
        topRecipes: string[];
      }[];
      overallScore: number;
      totalRecipes: number;
      coveredDimensions: number;
      totalDimensions: number;
      dimensionCoverage: number;
    };
    computedAt: number;
    stale: boolean;
  }> {
    const res = await http.get('/panorama', refresh ? { params: { refresh: 'true' } } : undefined);
    return res.data?.data;
  },

  /** 获取全景健康度 */
  async getPanoramaHealth(refresh = false): Promise<{
    healthRadar: {
      dimensions: {
        id: string;
        name: string;
        description: string;
        recipeCount: number;
        score: number;
        status: string;
        level: string;
        topRecipes: string[];
      }[];
      overallScore: number;
      totalRecipes: number;
      coveredDimensions: number;
      totalDimensions: number;
      dimensionCoverage: number;
    };
    avgCoupling: number;
    cycleCount: number;
    gapCount: number;
    highPriorityGaps: number;
    moduleCount: number;
    healthScore: number;
  }> {
    const res = await http.get('/panorama/health', refresh ? { params: { refresh: 'true' } } : undefined);
    return res.data?.data;
  },

  /** 获取知识空白区 */
  async getPanoramaGaps(refresh = false): Promise<{
    dimension: string;
    dimensionName: string;
    recipeCount: number;
    status: string;
    priority: string;
    suggestedTopics: string[];
    affectedRoles: string[];
  }[]> {
    const res = await http.get('/panorama/gaps', refresh ? { params: { refresh: 'true' } } : undefined);
    return res.data?.data ?? [];
  },

  // ── Audit Log ─────────────────

  /** 查询审计日志 */
  async getAuditLogs(filters?: {
    actor?: string;
    action?: string;
    result?: string;
    startDate?: number;
    endDate?: number;
    offset?: number;
    limit?: number;
  }): Promise<{
    logs: {
      timestamp: string;
      actor: string;
      action: string;
      result: string;
      target: string;
      details?: string;
    }[];
    total: number;
  }> {
    const res = await http.get('/audit', { params: filters });
    return res.data?.data ?? { logs: [], total: 0 };
  },

  // ── Logs ──────────────────────

  /** 读取日志文件 */
  async getLogs(filters?: {
    file?: 'combined' | 'error' | 'audit';
    limit?: number;
    level?: string;
    search?: string;
  }): Promise<{
    file: string;
    total: number;
    entries: {
      timestamp?: string;
      level?: string;
      message?: string;
      tag?: string;
      raw: string;
    }[];
  }> {
    const res = await http.get('/logs', { params: filters });
    return res.data?.data ?? { file: 'combined', total: 0, entries: [] };
  },

  // ── Guard Report ──────────────

  /** 获取合规性报告 */
  async getGuardReport(options?: {
    minScore?: number;
    maxErrors?: number;
    maxFiles?: number;
  }): Promise<any> {
    const res = await http.get('/guard/report', { params: options });
    return res.data?.data;
  },

  /** 获取模块知识覆盖率热力图 */
  async getPanoramaCoverage(): Promise<{
    modules: { name: string; layer: string; fileCount: number; recipeCount: number; coverage: number }[];
    gapsByDimension: Record<string, number>;
    overallCoverage: number;
    totalFiles: number;
    totalRecipes: number;
  }> {
    const res = await http.get('/panorama/coverage');
    return res.data?.data;
  },

  /** 获取六态生命周期统计 + 各过渡态条目 */
  async getKnowledgeLifecycle(): Promise<{
    counts: Record<string, number>;
    entries: Record<string, unknown[]>;
  }> {
    const res = await http.get('/knowledge/lifecycle');
    return res.data?.data;
  },

  // ═══════════════════════════════════════════════════════
  //  Signal & Report API
  // ═══════════════════════════════════════════════════════

  /** 查询信号留痕 */
  async getSignalTrace(opts?: {
    type?: string[];
    source?: string;
    target?: string;
    from?: number;
    to?: number;
    limit?: number;
    offset?: number;
  }): Promise<{ signals: SignalEntry[]; total: number }> {
    const params: Record<string, string> = {};
    if (opts?.type?.length) { params.type = opts.type.join(','); }
    if (opts?.source) { params.source = opts.source; }
    if (opts?.target) { params.target = opts.target; }
    if (opts?.from) { params.from = String(opts.from); }
    if (opts?.to) { params.to = String(opts.to); }
    if (opts?.limit) { params.limit = String(opts.limit); }
    if (opts?.offset) { params.offset = String(opts.offset); }
    const res = await http.get('/signals/trace', { params });
    return res.data?.data;
  },

  /** 信号统计 */
  async getSignalStats(opts?: {
    from?: number;
    to?: number;
  }): Promise<{ total: number; byType: Record<string, number>; bySource: Record<string, number> }> {
    const params: Record<string, string> = {};
    if (opts?.from) { params.from = String(opts.from); }
    if (opts?.to) { params.to = String(opts.to); }
    const res = await http.get('/signals/stats', { params });
    return res.data?.data;
  },

  /** 查询管道报告 */
  async getReports(opts?: {
    category?: string[];
    type?: string;
    from?: number;
    to?: number;
    limit?: number;
    offset?: number;
  }): Promise<{ reports: ReportEntry[]; total: number }> {
    const params: Record<string, string> = {};
    if (opts?.category?.length) { params.category = opts.category.join(','); }
    if (opts?.type) { params.type = opts.type; }
    if (opts?.from) { params.from = String(opts.from); }
    if (opts?.to) { params.to = String(opts.to); }
    if (opts?.limit) { params.limit = String(opts.limit); }
    if (opts?.offset) { params.offset = String(opts.offset); }
    const res = await http.get('/signals/reports', { params });
    return res.data?.data;
  },

  async listBootstrapReports(): Promise<{ reports: BootstrapReportSummary[] }> {
    const res = await http.get('/modules/bootstrap/reports');
    const data = res.data?.data || { reports: [] };
    return {
      ...data,
      reports: Array.isArray(data.reports)
        ? data.reports.filter((report: BootstrapReportSummary) => !!report.sessionId)
        : [],
    };
  },

  async getBootstrapReportLatest(): Promise<BootstrapReport | null> {
    const res = await http.get('/modules/bootstrap/report/latest');
    return res.data?.data || null;
  },

  async getBootstrapReport(sessionId: string): Promise<BootstrapReport | null> {
    const res = await http.get(`/modules/bootstrap/reports/${encodeURIComponent(sessionId)}`);
    return res.data?.data || null;
  },

  async diffBootstrapReports(sessionId: string, baseSessionId: string): Promise<Record<string, unknown> | null> {
    const res = await http.get(
      `/modules/bootstrap/reports/${encodeURIComponent(sessionId)}/diff`,
      { params: { base: baseSessionId } },
    );
    return res.data?.data || null;
  },

  /* ════════════════════════════════════════════════════════
   *  Evolution — Proposals & Warnings
   * ════════════════════════════════════════════════════════ */

  /** 查询 Proposals */
  async getProposals(filter?: {
    status?: string;
    type?: string;
    targetRecipeId?: string;
    source?: string;
    limit?: number;
  }): Promise<ProposalRecord[]> {
    const params: Record<string, string> = {};
    if (filter?.status) { params.status = filter.status; }
    if (filter?.type) { params.type = filter.type; }
    if (filter?.targetRecipeId) { params.targetRecipeId = filter.targetRecipeId; }
    if (filter?.source) { params.source = filter.source; }
    if (filter?.limit) { params.limit = String(filter.limit); }
    const res = await http.get('/evolution/proposals', { params });
    return res.data?.data ?? [];
  },

  /** 查询指定 Recipe 的 Proposals */
  async getProposalsByRecipe(recipeId: string): Promise<ProposalRecord[]> {
    return this.getProposals({ targetRecipeId: recipeId });
  },

  /** Proposal 统计 */
  async getProposalStats(): Promise<{ pending: number; observing: number; total: number }> {
    const res = await http.get('/evolution/proposals/stats');
    return res.data?.data;
  },

  /** 执行 Proposal */
  async executeProposal(id: string): Promise<unknown> {
    const res = await http.post(`/evolution/proposals/${encodeURIComponent(id)}/execute`);
    return res.data?.data;
  },

  /** 开始观察 Proposal（pending → observing） */
  async observeProposal(id: string): Promise<void> {
    await http.post(`/evolution/proposals/${encodeURIComponent(id)}/observe`);
  },

  /** 拒绝 Proposal */
  async rejectProposal(id: string, reason?: string): Promise<void> {
    await http.post(`/evolution/proposals/${encodeURIComponent(id)}/reject`, { reason });
  },

  /** 查询 Warnings */
  async getWarnings(filter?: {
    status?: string;
    type?: string;
    targetRecipeId?: string;
    limit?: number;
  }): Promise<WarningRecord[]> {
    const params: Record<string, string> = {};
    if (filter?.status) { params.status = filter.status; }
    if (filter?.type) { params.type = filter.type; }
    if (filter?.targetRecipeId) { params.targetRecipeId = filter.targetRecipeId; }
    if (filter?.limit) { params.limit = String(filter.limit); }
    const res = await http.get('/evolution/warnings', { params });
    return res.data?.data ?? [];
  },

  /** 查询指定 Recipe 的 Warnings */
  async getWarningsByRecipe(recipeId: string): Promise<WarningRecord[]> {
    return this.getWarnings({ targetRecipeId: recipeId });
  },

  /** Warning 统计 */
  async getWarningStats(): Promise<{ contradiction: number; redundancy: number; total: number }> {
    const res = await http.get('/evolution/warnings/stats');
    return res.data?.data;
  },

  /** 解决 Warning */
  async resolveWarning(id: string, resolution?: string): Promise<void> {
    await http.post(`/evolution/warnings/${encodeURIComponent(id)}/resolve`, { resolution });
  },

  /** 忽略 Warning */
  async dismissWarning(id: string, reason?: string): Promise<void> {
    await http.post(`/evolution/warnings/${encodeURIComponent(id)}/dismiss`, { reason });
  },

};

/** 信号留痕条目 */
export interface SignalEntry {
  type: string;
  source: string;
  value: number;
  target?: string;
  metadata?: Record<string, unknown>;
  timestamp: number;
}

/** 管道报告条目 */
export interface ReportEntry {
  id: string;
  category: string;
  type: string;
  producer: string;
  data: Record<string, unknown>;
  timestamp: number;
  duration_ms?: number;
}

export interface BootstrapReportSummary {
  sessionId: string;
  timestamp: string;
  project?: Record<string, unknown>;
  mode?: string | null;
  terminalCapability?: string;
  durationMs?: number;
  candidates?: number;
  toolCalls?: number;
  terminalEnabled?: boolean;
  terminalSuccessRate?: number;
}

export interface BootstrapReport {
  version?: string;
  timestamp?: string;
  session?: Record<string, unknown>;
  project?: Record<string, unknown>;
  duration?: Record<string, unknown>;
  totals?: Record<string, unknown>;
  stageToolsets?: Array<Record<string, unknown>>;
  toolUsage?: Record<string, unknown>;
  terminal?: Record<string, unknown>;
  dimensions?: Record<string, Record<string, unknown>>;
  comparisonHints?: Record<string, unknown>;
  [key: string]: unknown;
}

export default api;
