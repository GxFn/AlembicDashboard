import type { JobProcessDeveloperView } from '../api';

export const JOB_PROCESS_EVENTS_CACHE_PREFIX = 'alembic.dashboard.jobProcessEvents.v1';
export const JOB_PROCESS_EVENTS_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
export const JOB_PROCESS_EVENTS_CACHE_JOB_LIMIT = 40;
export const JOB_PROCESS_EVENTS_CACHE_EVENT_LIMIT = 120;

const KEY_EVENT_KINDS = new Set([
  'llm.input',
  'llm.reflection',
  'llm.output',
  'tool',
  'artifact',
  'checkpoint',
  'error',
  'summary',
]);

const FINDINGS_PHASES = new Set(['dimension-findings', 'tier-findings']);

const SEMANTIC_NUDGE_KINDS = new Set([
  'reflection-nudge',
  'planning-nudge',
  'replan-nudge',
  'convergence-nudge',
  'transition-nudge',
  'digest-nudge',
  'continue-nudge',
]);

export type ProcessEventSemanticCategory =
  | 'error'
  | 'findings'
  | 'transition'
  | 'nudge'
  | 'reflection'
  | 'llm'
  | 'tool'
  | 'artifact'
  | 'checkpoint'
  | 'summary'
  | 'default';

export interface JobProcessEventsDisplayCache {
  jobId: string;
  updatedAt: number;
  events: JobProcessDeveloperView[];
  expandedContentEventIds: string[];
}

export function processEventStableKey(event: JobProcessDeveloperView): string {
  return event.eventId || `${event.jobId}:${event.sequence}:${event.kind}`;
}

function getStorage(): Storage | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function processEventsCacheKey(jobId: string): string {
  return `${JOB_PROCESS_EVENTS_CACHE_PREFIX}:${encodeURIComponent(jobId)}`;
}

function isCachedProcessEvent(value: unknown): value is JobProcessDeveloperView {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Partial<JobProcessDeveloperView>;
  return (
    typeof record.eventId === 'string' &&
    typeof record.jobId === 'string' &&
    typeof record.sequence === 'number' &&
    typeof record.kind === 'string' &&
    typeof record.title === 'string'
  );
}

function parseCacheEntry(value: string | null, jobId: string): JobProcessEventsDisplayCache | null {
  if (!value) {
    return null;
  }
  try {
    const parsed = JSON.parse(value) as Partial<JobProcessEventsDisplayCache>;
    if (parsed.jobId !== jobId || typeof parsed.updatedAt !== 'number') {
      return null;
    }
    const expired = Date.now() - parsed.updatedAt > JOB_PROCESS_EVENTS_CACHE_TTL_MS;
    if (expired) {
      return null;
    }
    const events = Array.isArray(parsed.events)
      ? parsed.events.filter(isCachedProcessEvent).slice(-JOB_PROCESS_EVENTS_CACHE_EVENT_LIMIT)
      : [];
    const eventKeys = new Set(events.map(processEventStableKey));
    const expandedContentEventIds = Array.isArray(parsed.expandedContentEventIds)
      ? parsed.expandedContentEventIds.filter((key): key is string => typeof key === 'string' && eventKeys.has(key))
      : [];
    return {
      jobId,
      updatedAt: parsed.updatedAt,
      events,
      expandedContentEventIds,
    };
  } catch {
    return null;
  }
}

export function readJobProcessEventsDisplayCache(jobId: string): JobProcessEventsDisplayCache | null {
  const storage = getStorage();
  if (!storage) {
    return null;
  }
  const key = processEventsCacheKey(jobId);
  const cache = parseCacheEntry(storage.getItem(key), jobId);
  if (!cache) {
    storage.removeItem(key);
  }
  return cache;
}

export function writeJobProcessEventsDisplayCache(
  jobId: string,
  events: JobProcessDeveloperView[],
  expandedContentEventIds: string[],
): void {
  const storage = getStorage();
  if (!storage) {
    return;
  }
  const retainedEvents = events.slice(-JOB_PROCESS_EVENTS_CACHE_EVENT_LIMIT);
  const eventKeys = new Set(retainedEvents.map(processEventStableKey));
  const cache: JobProcessEventsDisplayCache = {
    jobId,
    updatedAt: Date.now(),
    events: retainedEvents,
    expandedContentEventIds: expandedContentEventIds.filter((key) => eventKeys.has(key)),
  };
  try {
    cleanupJobProcessEventsDisplayCache(storage);
    storage.setItem(processEventsCacheKey(jobId), JSON.stringify(cache));
    cleanupJobProcessEventsDisplayCache(storage);
  } catch {
    // localStorage quota / privacy mode should not break live process event viewing.
  }
}

export function cleanupJobProcessEventsDisplayCache(storage: Storage | null = getStorage()): void {
  if (!storage) {
    return;
  }
  const now = Date.now();
  const entries: Array<{ key: string; updatedAt: number }> = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key?.startsWith(`${JOB_PROCESS_EVENTS_CACHE_PREFIX}:`)) {
      continue;
    }
    const raw = storage.getItem(key);
    try {
      const parsed = JSON.parse(raw || '{}') as Partial<JobProcessEventsDisplayCache>;
      if (typeof parsed.updatedAt !== 'number' || now - parsed.updatedAt > JOB_PROCESS_EVENTS_CACHE_TTL_MS) {
        storage.removeItem(key);
        index -= 1;
        continue;
      }
      entries.push({ key, updatedAt: parsed.updatedAt });
    } catch {
      storage.removeItem(key);
      index -= 1;
    }
  }
  entries
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(JOB_PROCESS_EVENTS_CACHE_JOB_LIMIT)
    .forEach((entry) => storage.removeItem(entry.key));
}

export function mergeProcessEvents(
  current: JobProcessDeveloperView[],
  incoming: JobProcessDeveloperView[],
): JobProcessDeveloperView[] {
  const byKey = new Map<string, JobProcessDeveloperView>();
  for (const event of current) {
    byKey.set(processEventStableKey(event), event);
  }
  for (const event of incoming) {
    byKey.set(processEventStableKey(event), event);
  }
  return Array.from(byKey.values()).sort((a, b) => a.sequence - b.sequence);
}

export function getLastProcessSequence(events: JobProcessDeveloperView[]): number | undefined {
  const last = events.at(-1);
  return typeof last?.sequence === 'number' ? last.sequence : undefined;
}

export function getProcessEventMetadataText(event: JobProcessDeveloperView, key: string): string | undefined {
  const value = event.metadata?.[key];
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    const items = value.filter((item): item is string => typeof item === 'string' && item.length > 0);
    return items.length > 0 ? items.join(', ') : undefined;
  }
  return undefined;
}

export function getProcessEventSemanticKind(event: JobProcessDeveloperView): string | undefined {
  return getProcessEventMetadataText(event, 'semanticKind');
}

export function getProcessEventNudgeType(event: JobProcessDeveloperView): string | undefined {
  return getProcessEventMetadataText(event, 'nudgeType');
}

export function isFindingsProcessEvent(event: JobProcessDeveloperView): boolean {
  const projection = getProcessEventMetadataText(event, 'projection');
  return (
    (event.kind === 'summary' && typeof event.phase === 'string' && FINDINGS_PHASES.has(event.phase)) ||
    projection === 'dimension-findings-digest' ||
    projection === 'tier-findings-digest'
  );
}

export function getProcessEventSemanticCategory(event: JobProcessDeveloperView): ProcessEventSemanticCategory {
  const semanticKind = getProcessEventSemanticKind(event);
  if (event.kind === 'error' || event.severity === 'error') {
    return 'error';
  }
  if (isFindingsProcessEvent(event)) {
    return 'findings';
  }
  if (semanticKind === 'transition-nudge') {
    return 'transition';
  }
  if (semanticKind && SEMANTIC_NUDGE_KINDS.has(semanticKind)) {
    return 'nudge';
  }
  if (event.kind === 'llm.reflection') {
    return 'reflection';
  }
  if (event.kind === 'llm.input' || event.kind === 'llm.output') {
    return 'llm';
  }
  if (event.kind === 'tool') {
    return 'tool';
  }
  if (event.kind === 'artifact') {
    return 'artifact';
  }
  if (event.kind === 'checkpoint') {
    return 'checkpoint';
  }
  if (event.kind === 'summary') {
    return 'summary';
  }
  return 'default';
}

export function formatProcessEventSemanticLabel(event: JobProcessDeveloperView, lang: string): string {
  const zh = lang === 'zh';
  switch (getProcessEventSemanticCategory(event)) {
    case 'error':
      return zh ? '错误' : 'Error';
    case 'findings':
      return zh ? '关键发现' : 'Findings';
    case 'transition':
      return zh ? '阶段转换' : 'Transition';
    case 'nudge':
      return 'Nudge';
    case 'reflection':
      return zh ? '反思' : 'Reflection';
    case 'llm':
      return 'LLM';
    case 'tool':
      return zh ? '工具' : 'Tool';
    case 'artifact':
      return zh ? '产物' : 'Artifact';
    case 'checkpoint':
      return zh ? '检查点' : 'Checkpoint';
    case 'summary':
      return zh ? '摘要' : 'Summary';
    default:
      return event.kind;
  }
}

export function getProcessEventSemanticPriority(event: JobProcessDeveloperView): number {
  switch (getProcessEventSemanticCategory(event)) {
    case 'error':
      return 1000;
    case 'findings':
      return 950;
    case 'transition':
      return 925;
    case 'nudge':
      return 900;
    case 'reflection':
      return 850;
    case 'llm':
      return event.kind === 'llm.output' ? 760 : 720;
    case 'artifact':
      return 680;
    case 'summary':
      return 640;
    case 'checkpoint':
      return 600;
    case 'tool':
      return 520;
    default:
      return KEY_EVENT_KINDS.has(event.kind) ? 500 : 0;
  }
}

export function getProcessEventPreviewText(event: JobProcessDeveloperView, maxLength = 220): string | undefined {
  const value = event.summary || event.content;
  if (!value) {
    return undefined;
  }
  const collapsed = value.replace(/\s+/g, ' ').trim();
  if (collapsed.length <= maxLength) {
    return collapsed;
  }
  return `${collapsed.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

export function pickKeyProcessEvents(events: JobProcessDeveloperView[], limit: number): JobProcessDeveloperView[] {
  if (limit <= 0) {
    return [];
  }
  const ranked = events
    .map((event, index) => ({ event, index, priority: getProcessEventSemanticPriority(event) }))
    .filter((item) => item.priority > 0)
    .sort((a, b) => b.priority - a.priority || b.event.sequence - a.event.sequence || b.index - a.index);
  const source = ranked.length > 0 ? ranked.slice(0, limit).map((item) => item.event) : events.slice(-limit);
  return source.sort((a, b) => a.sequence - b.sequence);
}

export function processEventSemanticSearchText(event: JobProcessDeveloperView): string {
  return [
    getProcessEventSemanticKind(event),
    getProcessEventNudgeType(event),
    getProcessEventMetadataText(event, 'projection'),
    getProcessEventMetadataText(event, 'findingSources'),
    getProcessEventMetadataText(event, 'findingCount'),
  ]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .join(' ');
}

export function processEventSearchText(event: JobProcessDeveloperView): string {
  return [
    event.kind,
    event.phase,
    event.dimensionId,
    event.targetName,
    event.title,
    event.summary,
    event.content,
    processEventSemanticSearchText(event),
    ...(event.artifactRefs ?? []).flatMap((artifact) => [artifact.kind, artifact.label, artifact.ref]),
  ]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .join(' ');
}
