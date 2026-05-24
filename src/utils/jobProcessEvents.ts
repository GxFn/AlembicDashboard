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

export function pickKeyProcessEvents(events: JobProcessDeveloperView[], limit: number): JobProcessDeveloperView[] {
  if (limit <= 0) {
    return [];
  }
  const keyEvents = events.filter((event) =>
    event.severity === 'error' ||
    event.kind === 'error' ||
    KEY_EVENT_KINDS.has(event.kind)
  );
  const source = keyEvents.length > 0 ? keyEvents : events;
  return source.slice(-limit);
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
    ...(event.artifactRefs ?? []).flatMap((artifact) => [artifact.kind, artifact.label, artifact.ref]),
  ]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .join(' ');
}
