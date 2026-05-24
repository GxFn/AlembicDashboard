import { useCallback, useEffect, useRef, useState } from 'react';
import api, { type JobProcessDeveloperView, type JobProcessEndpointCapability } from '../api';
import { getSocket } from '../lib/socket';
import { getLastProcessSequence, mergeProcessEvents } from '../utils/jobProcessEvents';
import { getErrorMessage } from '../utils/error';

interface JobProcessSocketPayload {
  type?: string;
  jobId?: string;
  eventId?: string;
  sequence?: number;
  event?: JobProcessDeveloperView;
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
  refresh: () => Promise<void>;
}

function normalizeSocketEvent(payload: JobProcessSocketPayload): JobProcessDeveloperView | null {
  if (!payload.event) {
    return null;
  }
  return {
    ...payload.event,
    jobId: payload.event.jobId || payload.jobId || '',
    eventId: payload.event.eventId || payload.eventId || '',
    sequence: typeof payload.event.sequence === 'number' ? payload.event.sequence : payload.sequence ?? 0,
    timestamp: payload.event.timestamp ?? payload.timestamp,
  };
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
  const eventsRef = useRef<JobProcessDeveloperView[]>([]);

  useEffect(() => {
    eventsRef.current = events;
  }, [events]);

  useEffect(() => {
    setEvents([]);
    eventsRef.current = [];
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

  return {
    events,
    loading,
    refreshing,
    error,
    hiddenCount,
    retainedCount,
    endpointCapability,
    refresh: () => fetchEvents('manual'),
  };
}
