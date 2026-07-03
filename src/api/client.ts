/**
 * Alembic Dashboard API Client
 *
 * 直接调用 V3 RESTful API（/api/v1/*）。
 * 前端统一使用 V3 KnowledgeEntry 类型；跨 provider 的响应差异只允许在
 * 本文件的显式 adapter/view projection 中收束，不能在 UI 组件里散落猜字段。
 *
 * SSE 架构: Session + EventSource（POST 创建会话 → GET EventSource 消费事件）
 */

import axios from 'axios';


// ═══════════════════════════════════════════════════════
//  Base HTTP Client
// ═══════════════════════════════════════════════════════

export const http = axios.create({ baseURL: '/api/v1' });

export type UnknownRecord = Record<string, unknown>;

export type DashboardProviderSurface =
  | 'runtime-project'
  | 'project-scope'
  | 'jobs-events'
  | 'knowledge-search'
  | 'guard'
  | 'diagnostics'
  | 'ai-host-managed-unavailable'
  | 'artifacts'
  | 'sse';

export type DashboardAdapterDisposition =
  | 'necessary-adapter'
  | 'diagnostic-extension'
  | 'deletion-candidate';

export interface DashboardAdapterPolicy {
  id: string;
  surface: DashboardProviderSurface;
  disposition: DashboardAdapterDisposition;
  currentConsumer: string;
  providerBranch: string;
  cleanupTrigger: string;
  fixtureRefs: string[];
}

export const DASHBOARD_PROVIDER_ADAPTER_POLICIES: DashboardAdapterPolicy[] = [
  {
    id: 'providerDataRecord',
    surface: 'runtime-project',
    disposition: 'necessary-adapter',
    currentConsumer: 'route normalizers that consume D20 envelopes with success/data wrapping',
    providerBranch: 'D20 closed route payloads with named data extension points',
    cleanupTrigger: 'Remove only after every consumed route returns the direct provider payload without the success/data envelope.',
    fixtureRefs: ['project-runtime.success', 'project-scope.success', 'job-snapshot.success', 'knowledge.success', 'search.success'],
  },
  {
    id: 'firstString',
    surface: 'jobs-events',
    disposition: 'necessary-adapter',
    currentConsumer: 'typed view-model normalizers for job events, runtime identity, project scope, and diagnostics',
    providerBranch: 'D20 normalized payloads plus socket/rest recovery events that may omit optional view labels',
    cleanupTrigger: 'Remove individual fallback keys only when accepted fixtures prove the canonical field is always present for that provider surface.',
    fixtureRefs: ['job-event.visible', 'job-event.partial', 'project-runtime.success', 'diagnostic.success'],
  },
  {
    id: 'firstRecord',
    surface: 'runtime-project',
    disposition: 'necessary-adapter',
    currentConsumer: 'runtime boundary reader while daemon and project-info expose boundary details at different nesting points',
    providerBranch: 'runtimeBoundary from daemon health or project-info capability metadata',
    cleanupTrigger: 'Collapse to one field path after Alembic provider fixtures expose only one runtimeBoundary location.',
    fixtureRefs: ['runtime-health.ready', 'runtime-health.partial'],
  },
  {
    id: 'projectRuntimeDiagnostic.extraFields',
    surface: 'diagnostics',
    disposition: 'diagnostic-extension',
    currentConsumer: 'RuntimeSourceOfTruthPanel diagnostic extra rows',
    providerBranch: 'D20 named diagnostic extension fields outside the known source-of-truth keys',
    cleanupTrigger: 'Keep as long as backend diagnostic providers expose named extension fields for troubleshooting.',
    fixtureRefs: ['diagnostic.success', 'project-runtime.success'],
  },
  {
    id: 'knowledgeSearchResponse',
    surface: 'knowledge-search',
    disposition: 'necessary-adapter',
    currentConsumer: 'Recipes, candidates, command palette search, and knowledge graph entry displays',
    providerBranch: 'D20 knowledge/search payloads with items, searchMeta, and canonical degraded telemetry',
    cleanupTrigger: 'Keep as the typed search view-model projector; remove only duplicated inline search parsing.',
    fixtureRefs: ['knowledge.success', 'search.success', 'search.degraded'],
  },
  {
    id: 'guardProviderRecords',
    surface: 'guard',
    disposition: 'necessary-adapter',
    currentConsumer: 'GuardView rules, violation records, and report status tabs',
    providerBranch: 'D20 guard report/rules/violations payloads and typed problem responses',
    cleanupTrigger: 'Keep as long as GuardView needs stable rule/run defaults for empty or invalid-input provider states.',
    fixtureRefs: ['guard.success', 'guard.invalid-input'],
  },
  {
    id: 'jobArtifactRefs',
    surface: 'artifacts',
    disposition: 'necessary-adapter',
    currentConsumer: 'Jobs timeline details and persisted display snapshot artifact panels',
    providerBranch: 'D20 job artifact refs and artifact-missing problem payloads',
    cleanupTrigger: 'Keep; artifact refs are intentionally projected before the UI requests retained artifact content.',
    fixtureRefs: ['job-snapshot.success', 'job-artifact.missing'],
  },
  {
    id: 'hostManagedUnavailable',
    surface: 'ai-host-managed-unavailable',
    disposition: 'necessary-adapter',
    currentConsumer: 'host-managed unavailable UI states',
    providerBranch: 'D20 typed problem objects plus host-managed boundary flags',
    cleanupTrigger: 'Delete legacy flag readers after provider fixtures emit only canonical HOST_* problem codes.',
    fixtureRefs: ['workflow.unavailable'],
  },
  {
    id: 'sseProjection',
    surface: 'sse',
    disposition: 'necessary-adapter',
    currentConsumer: 'module scan stream consumers',
    providerBranch: 'D20 SSE fixtures where event payload is dynamic at transport ingress only',
    cleanupTrigger: 'Keep; UI components must consume projected primitives/view models rather than raw event payload bags.',
    fixtureRefs: ['sse.module-scan.success'],
  },
];

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function asRuntimeRecord(value: unknown): UnknownRecord | null {
  return isRecord(value) ? value : null;
}

export function providerDataRecord(value: unknown): UnknownRecord {
  const record = asRuntimeRecord(value) ?? {};
  const data = asRuntimeRecord(record.data);
  return record.success === true && data ? data : record;
}

const DASHBOARD_PRIVATE_PROVIDER_FIELD_KEYS = new Set([
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

function normalizedProviderFieldKey(key: string): string {
  return key.replace(/[^a-z0-9]/gi, '').toLowerCase();
}

export function isPrivateProviderFieldKey(key: string): boolean {
  return DASHBOARD_PRIVATE_PROVIDER_FIELD_KEYS.has(normalizedProviderFieldKey(key));
}

export function stripPrivateProviderFields(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripPrivateProviderFields);
  }
  const record = asRuntimeRecord(value);
  if (!record) {
    return value;
  }

  // 普通 UI projection 不应把 provider 私有字段继续带给组件；诊断扩展字段会在专门的 extraFields 中显式处理。
  return Object.fromEntries(
    Object.entries(record)
      .filter(([key]) => !isPrivateProviderFieldKey(key))
      .map(([key, nestedValue]) => [key, stripPrivateProviderFields(nestedValue)]),
  );
}

export function dashboardPublicRecord(value: unknown): UnknownRecord | undefined {
  return asRuntimeRecord(stripPrivateProviderFields(value)) ?? undefined;
}

export function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }
  }
  return null;
}

export function firstRecord(...values: unknown[]): UnknownRecord | null {
  for (const value of values) {
    const record = asRuntimeRecord(value);
    if (record) {
      return record;
    }
  }
  return null;
}

export function firstBoolean(...values: unknown[]): boolean | null {
  for (const value of values) {
    if (typeof value === 'boolean') {
      return value;
    }
  }
  return null;
}

export function booleanOrNull(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

export function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

export function firstStringArray(...values: unknown[]): string[] {
  for (const value of values) {
    const strings = stringArray(value);
    if (strings.length > 0) {
      return strings;
    }
  }
  return [];
}

export function stringRecord(value: unknown): Record<string, string> | undefined {
  const record = asRuntimeRecord(value);
  if (!record) {
    return undefined;
  }
  const entries = Object.entries(record).filter((entry): entry is [string, string] =>
    typeof entry[1] === 'string'
  );
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

export function firstNumber(...values: unknown[]): number | null {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }
  return null;
}

export function booleanOrFalse(value: unknown): boolean {
  return value === true;
}

export function recordArray(value: unknown): UnknownRecord[] {
  return Array.isArray(value) ? value.map(asRuntimeRecord).filter((item): item is UnknownRecord => item !== null) : [];
}

export function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function contentTextOrUndefined(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value.length > 0 ? value : undefined;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  const record = asRuntimeRecord(value);
  const structuredText = record ? stringOrUndefined(record.text) : undefined;
  if (structuredText) {
    return structuredText;
  }

  if (Array.isArray(value) || record) {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function fallbackDisplayName(projectRoot: string): string {
  const parts = projectRoot.split('/').filter(Boolean);
  return parts[parts.length - 1] || projectRoot || 'Alembic';
}
