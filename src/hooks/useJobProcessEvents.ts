import { useCallback, useEffect, useRef, useState } from 'react';
import api, {
  normalizeProcessDeveloperView,
  type JobProcessDeveloperView,
  type JobProcessEndpointCapability,
} from '../api';
import { getSocket } from '../lib/socket';
import {
  getLastProcessSequence,
  mergeProcessEvents,
  readJobProcessEventsDisplayCache,
  writeJobProcessEventsDisplayCache,
} from '../utils/JobProcessEvents';
import { getErrorMessage } from '../utils/error';

interface JobProcessSocketPayload {
  type?: string;
  jobId?: string;
  eventId?: string;
  sequence?: number;
  event?: unknown;
  timestamp?: number;
}

interface UseJobProcessEventsOptions {
  enabled?: boolean;
  active?: boolean;
  limit?: number;
}

interface UseJobProcessEventsResult {
  events: JobProcessDeveloperView[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  hiddenCount: number;
  retainedCount: number;
  endpointCapability?: JobProcessEndpointCapability;
  expandedContentEventIds: Set<string>;
  refresh: () => Promise<void>;
  setContentExpanded: (eventId: string, expanded: boolean) => void;
}

function normalizeSocketEvent(payload: JobProcessSocketPayload): JobProcessDeveloperView | null {
  if (!payload.event) {
    return null;
  }
  if (typeof payload.event !== 'object' || payload.event === null) {
    return normalizeProcessDeveloperView(payload.event, payload.jobId);
  }
  const event = payload.event as Record<string, unknown>;
  const eventRecord = {
    ...event,
    eventId: event.eventId ?? payload.eventId,
    jobId: event.jobId ?? payload.jobId,
    sequence: event.sequence ?? payload.sequence,
    timestamp: event.timestamp ?? payload.timestamp,
  };
  return normalizeProcessDeveloperView(eventRecord, payload.jobId);
}

export function useJobProcessEvents(
  jobId: string | null | undefined,
  options: UseJobProcessEventsOptions = {},
): UseJobProcessEventsResult {
  const { enabled = true, active = false, limit = 80 } = options;
  const [events, setEvents] = useState<JobProcessDeveloperView[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hiddenCount, setHiddenCount] = useState(0);
  const [retainedCount, setRetainedCount] = useState(0);
  const [endpointCapability, setEndpointCapability] = useState<JobProcessEndpointCapability | undefined>();
  const [expandedContentEventIds, setExpandedContentEventIds] = useState<Set<string>>(() => new Set());
  const eventsRef = useRef<JobProcessDeveloperView[]>([]);
  const expandedContentEventIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    eventsRef.current = events;
  }, [events]);

  useEffect(() => {
    const cache = jobId ? readJobProcessEventsDisplayCache(jobId) : null;
    const cachedEvents = cache?.events ?? [];
    const cachedExpandedIds = new Set(cache?.expandedContentEventIds ?? []);
    setEvents(cachedEvents);
    eventsRef.current = cachedEvents;
    setExpandedContentEventIds(cachedExpandedIds);
    expandedContentEventIdsRef.current = cachedExpandedIds;
    setError(null);
    setHiddenCount(0);
    setRetainedCount(0);
    setEndpointCapability(undefined);
  }, [jobId]);

  const fetchEvents = useCallback(async (mode: 'initial' | 'incremental' | 'manual' = 'incremental') => {
    if (!jobId || !enabled) {
      return;
    }
    const afterSequence = mode === 'initial' ? undefined : getLastProcessSequence(eventsRef.current);
    if (mode === 'initial') {
      setLoading(true);
    } else {
      setRefreshing(true);
    }
    try {
      const response = await api.getJobProcessEvents(jobId, { afterSequence, limit });
      setEvents((prev) => {
        const merged = mergeProcessEvents(prev, response.developerViews);
        eventsRef.current = merged;
        writeJobProcessEventsDisplayCache(jobId, merged, Array.from(expandedContentEventIdsRef.current));
        return merged;
      });
      setHiddenCount(response.hiddenCount);
      setRetainedCount(response.retainedCount);
      setEndpointCapability(response.endpointCapability);
      setError(null);
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Process events unavailable'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [enabled, jobId, limit]);

  useEffect(() => {
    if (!jobId || !enabled) {
      return;
    }
    fetchEvents('initial');
  }, [enabled, fetchEvents, jobId]);

  useEffect(() => {
    if (!jobId || !enabled) {
      return;
    }
    const socket = getSocket();
    const onProcessEvent = (payload: JobProcessSocketPayload) => {
      const event = normalizeSocketEvent(payload);
      if (!event || event.jobId !== jobId) {
        return;
      }
      setEvents((prev) => {
        const merged = mergeProcessEvents(prev, [event]);
        eventsRef.current = merged;
        writeJobProcessEventsDisplayCache(jobId, merged, Array.from(expandedContentEventIdsRef.current));
        return merged;
      });
      setError(null);
    };
    const recover = () => fetchEvents('incremental');

    socket.on('job:process-event', onProcessEvent);
    socket.on('connect', recover);
    socket.io.on('reconnect', recover);
    return () => {
      socket.off('job:process-event', onProcessEvent);
      socket.off('connect', recover);
      socket.io.off('reconnect', recover);
    };
  }, [enabled, fetchEvents, jobId]);

  useEffect(() => {
    if (!jobId || !enabled || !active) {
      return;
    }
    const timer = setInterval(() => fetchEvents('incremental'), 5000);
    return () => clearInterval(timer);
  }, [active, enabled, fetchEvents, jobId]);

  const setContentExpanded = useCallback((eventId: string, expanded: boolean) => {
    if (!jobId) {
      return;
    }
    setExpandedContentEventIds((prev) => {
      const next = new Set(prev);
      if (expanded) {
        next.add(eventId);
      } else {
        next.delete(eventId);
      }
      expandedContentEventIdsRef.current = next;
      writeJobProcessEventsDisplayCache(jobId, eventsRef.current, Array.from(next));
      return next;
    });
  }, [jobId]);

  return {
    events,
    loading,
    refreshing,
    error,
    hiddenCount,
    retainedCount,
    endpointCapability,
    expandedContentEventIds,
    refresh: () => fetchEvents('manual'),
    setContentExpanded,
  };
}
