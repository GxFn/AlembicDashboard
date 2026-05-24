import type { JobProcessDeveloperView } from '../api';

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

function processEventStableKey(event: JobProcessDeveloperView): string {
  return event.eventId || `${event.jobId}:${event.sequence}:${event.kind}`;
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
