/**
 * jobs — /jobs 路由族：任务列表/过程事件/展示快照/工件与其归一化投影
 * （W7-f 自 api.ts 拆出；类型与归一化按"就近唯一消费族"归此）。
 */

import {
  asRuntimeRecord,
  contentTextOrUndefined,
  dashboardPublicRecord,
  firstBoolean,
  firstNumber,
  firstString,
  http,
  numberOrUndefined,
  providerDataRecord,
  recordArray,
  stringArray,
  stringOrUndefined,
  stripPrivateProviderFields,
} from './client';


function processArtifactRefs(value: unknown): JobProcessArtifactRef[] {
  return recordArray(value)
    .map((record): JobProcessArtifactRef | null => {
      const kind = firstString(record.kind);
      const ref = firstString(record.ref);
      if (!kind || !ref) {
        return null;
      }
      const artifact: JobProcessArtifactRef = {
        kind,
        ref,
      };
      const label = stringOrUndefined(record.label);
      const mimeType = stringOrUndefined(record.mimeType);
      if (label) {
        artifact.label = label;
      }
      if (mimeType) {
        artifact.mimeType = mimeType;
      }
      return artifact;
    })
    .filter((item): item is JobProcessArtifactRef => item !== null);
}

export function normalizeProcessDeveloperView(value: unknown, fallbackJobId?: string): JobProcessDeveloperView | null {
  const record = asRuntimeRecord(value);
  if (!record) {
    return null;
  }

  const eventId = firstString(record.eventId, record.id);
  const jobId = firstString(record.jobId, fallbackJobId);
  const sequence = firstNumber(record.sequence);
  const kind = firstString(record.kind, record.type, record.eventName, record.phase) ?? 'workflow';
  const content = contentTextOrUndefined(record.content);
  const title = firstString(record.title, record.summary, kind);
  if (!eventId || !jobId || sequence === null || !kind || !title) {
    return null;
  }

  const metadata = dashboardPublicRecord(record.metadata);
  return {
    eventId,
    jobId,
    sequence,
    kind,
    phase: stringOrUndefined(record.phase),
    title,
    summary: stringOrUndefined(record.summary),
    content,
    severity: stringOrUndefined(record.severity),
    sourceClass: stringOrUndefined(record.sourceClass),
    displayPolicy: stringOrUndefined(record.displayPolicy),
    dimensionId: stringOrUndefined(record.dimensionId),
    targetName: stringOrUndefined(record.targetName),
    parentEventId: stringOrUndefined(record.parentEventId),
    artifactRefs: processArtifactRefs(record.artifactRefs),
    metadata,
    timestamp: numberOrUndefined(record.timestamp) ?? stringOrUndefined(record.timestamp),
  };
}

function normalizeProcessEndpointCapability(value: unknown): JobProcessEndpointCapability | undefined {
  const record = asRuntimeRecord(value);
  if (!record) {
    return undefined;
  }
  return {
    available: record.available !== false,
    endpoint: stringOrUndefined(record.endpoint),
    supportedKinds: stringArray(record.supportedKinds),
    supportedSourceClasses: stringArray(record.supportedSourceClasses),
    supportedDisplayPolicies: stringArray(record.supportedDisplayPolicies),
    supportedRetentionPolicies: stringArray(record.supportedRetentionPolicies),
  };
}

export function normalizeJobProcessEventsResponse(value: unknown, fallbackJobId: string): JobProcessEventsResponse {
  const record = providerDataRecord(value);
  const jobId = firstString(record.jobId, fallbackJobId) ?? fallbackJobId;
  const eventRecords = [
    ...recordArray(record.developerViews),
    ...recordArray(record.events),
    ...(record.event === undefined ? [] : [record.event]),
  ];
  const developerViews = eventRecords
    .map((item) => normalizeProcessDeveloperView(item, jobId))
    .filter((item): item is JobProcessDeveloperView => item !== null)
    .sort((a, b) => a.sequence - b.sequence);

  return {
    jobId,
    count: firstNumber(record.count) ?? developerViews.length,
    retainedCount: firstNumber(record.retainedCount) ?? developerViews.length,
    nextSequence: firstNumber(record.nextSequence) ?? ((developerViews.at(-1)?.sequence ?? 0) + 1),
    hiddenCount: firstNumber(record.hiddenCount) ?? 0,
    developerViews,
    endpointCapability: normalizeProcessEndpointCapability(record.endpointCapability),
  };
}

export function normalizeJobDisplaySnapshotSummaryRef(value: unknown): JobDisplaySnapshotSummaryRef | null {
  const record = asRuntimeRecord(value);
  if (!record) {
    return null;
  }
  return {
    available: firstBoolean(record.available) ?? Boolean(firstString(record.ref)),
    checksum: stringOrUndefined(record.checksum),
    checksumAlgorithm: stringOrUndefined(record.checksumAlgorithm),
    evidenceIncompleteCount: numberOrUndefined(record.evidenceIncompleteCount),
    jobId: stringOrUndefined(record.jobId),
    reason: stringOrUndefined(record.reason),
    ref: stringOrUndefined(record.ref),
    snapshotId: stringOrUndefined(record.snapshotId),
    snapshotVersion: numberOrUndefined(record.snapshotVersion),
    updatedAt: stringOrUndefined(record.updatedAt),
    warningCount: numberOrUndefined(record.warningCount),
  };
}

export function normalizeJobDisplaySnapshotResponse(value: unknown, fallbackJobId: string): JobDisplaySnapshotResponse {
  const record = providerDataRecord(value);
  return {
    persisted: firstBoolean(record.persisted) ?? false,
    snapshot: normalizeJobDisplaySnapshot(record.snapshot, fallbackJobId),
    snapshotPath: firstString(record.snapshotPath),
    validation: dashboardPublicRecord(record.validation),
  };
}

function normalizeJobDisplaySnapshot(value: unknown, fallbackJobId: string): JobDisplaySnapshot {
  const record = asRuntimeRecord(value) ?? {};
  const snapshotMeta = asRuntimeRecord(record.snapshot) ??
    (record.snapshotId || record.snapshotVersion || record.ref || record.jobId ? record : {});
  const jobRecord = asRuntimeRecord(record.job) ?? {};
  const summary = asRuntimeRecord(record.summary) ?? {};
  const manifest = asRuntimeRecord(record.manifest) ?? {};
  const llmIo = asRuntimeRecord(record.llmIo) ?? {};
  const developerViews = recordArray(record.developerViews)
    .map((item) => normalizeProcessDeveloperView(item, fallbackJobId))
    .filter((item): item is JobProcessDeveloperView => item !== null)
    .sort((a, b) => a.sequence - b.sequence);
  const events = recordArray(record.events)
    .map((item) => normalizeProcessDeveloperView(item, fallbackJobId))
    .filter((item): item is JobProcessDeveloperView => item !== null)
    .sort((a, b) => a.sequence - b.sequence);

  return {
    artifacts: normalizeJobDisplaySnapshotArtifactRefs(record.artifacts),
    candidates: normalizeJobDisplaySnapshotEvidenceItems(record.candidates),
    contractVersion: numberOrUndefined(record.contractVersion),
    developerViews,
    events,
    evidenceIncomplete: normalizeJobDisplaySnapshotEvidenceIncomplete(record.evidenceIncomplete),
    findings: normalizeJobDisplaySnapshotEvidenceItems(record.findings),
    job: {
      bootstrapSessionId: stringOrUndefined(jobRecord.bootstrapSessionId),
      completedAt: stringOrUndefined(jobRecord.completedAt),
      createdAt: stringOrUndefined(jobRecord.createdAt),
      dataRoot: stringOrUndefined(jobRecord.dataRoot),
      id: firstString(jobRecord.id, fallbackJobId) ?? fallbackJobId,
      kind: stringOrUndefined(jobRecord.kind),
      projectId: stringOrUndefined(jobRecord.projectId),
      projectRoot: stringOrUndefined(jobRecord.projectRoot),
      startedAt: stringOrUndefined(jobRecord.startedAt),
      status: stringOrUndefined(jobRecord.status),
      updatedAt: stringOrUndefined(jobRecord.updatedAt),
    },
    llmIo: {
      entries: normalizeJobDisplaySnapshotLlmIoEntries(llmIo.entries),
      evidenceIncomplete: normalizeJobDisplaySnapshotEvidenceIncomplete(llmIo.evidenceIncomplete),
    },
    manifest: {
      artifactCount: numberOrUndefined(manifest.artifactCount) ?? 0,
      developerViewCount: numberOrUndefined(manifest.developerViewCount) ?? developerViews.length,
      eventCount: numberOrUndefined(manifest.eventCount) ?? events.length,
      llmIoEntryCount: numberOrUndefined(manifest.llmIoEntryCount) ?? recordArray(llmIo.entries).length,
      retainedArtifactCount: numberOrUndefined(manifest.retainedArtifactCount) ?? 0,
      warningCount: numberOrUndefined(manifest.warningCount) ?? recordArray(record.warnings).length,
    },
    phaseTimeline: normalizeJobDisplaySnapshotPhaseTimeline(record.phaseTimeline),
    producer: dashboardPublicRecord(record.producer),
    snapshot: {
      checksum: stringOrUndefined(snapshotMeta.checksum),
      checksumAlgorithm: stringOrUndefined(snapshotMeta.checksumAlgorithm),
      createdAt: stringOrUndefined(snapshotMeta.createdAt),
      jobId: firstString(snapshotMeta.jobId, fallbackJobId) ?? fallbackJobId,
      ref: stringOrUndefined(snapshotMeta.ref),
      snapshotId: stringOrUndefined(snapshotMeta.snapshotId),
      snapshotVersion: numberOrUndefined(snapshotMeta.snapshotVersion),
      sourceJobUpdatedAt: stringOrUndefined(snapshotMeta.sourceJobUpdatedAt),
      updatedAt: stringOrUndefined(snapshotMeta.updatedAt),
    },
    sourceRefs: normalizeJobDisplaySnapshotEvidenceItems(record.sourceRefs),
    summary: {
      message: stringOrUndefined(summary.message),
      phase: stringOrUndefined(summary.phase),
      progress: numberOrUndefined(summary.progress),
      statusText: stringOrUndefined(summary.statusText),
      title: stringOrUndefined(summary.title),
    },
    warnings: normalizeJobDisplaySnapshotWarnings(record.warnings),
  };
}

function normalizeJobDisplaySnapshotArtifactRefs(value: unknown): JobDisplaySnapshotArtifactRef[] {
  return recordArray(value)
    .map((record): JobDisplaySnapshotArtifactRef | null => {
      const ref = firstString(record.ref);
      if (!ref) {
        return null;
      }
      return {
        checksum: stringOrUndefined(record.checksum),
        kind: firstString(record.kind) ?? 'artifact',
        label: stringOrUndefined(record.label),
        mimeType: stringOrUndefined(record.mimeType),
        originalChars: numberOrUndefined(record.originalChars),
        redactionState: stringOrUndefined(record.redactionState),
        ref,
        retained: firstBoolean(record.retained) ?? undefined,
        retainedChars: numberOrUndefined(record.retainedChars),
        storageKind: stringOrUndefined(record.storageKind),
        truncated: firstBoolean(record.truncated) ?? undefined,
      };
    })
    .filter((item): item is JobDisplaySnapshotArtifactRef => item !== null);
}

function normalizeJobDisplaySnapshotEvidenceItems(value: unknown): JobDisplaySnapshotEvidenceItem[] {
  return recordArray(value)
    .map((record): JobDisplaySnapshotEvidenceItem | null => {
      const id = firstString(record.id, record.sourceRef, record.title);
      const title = stringOrUndefined(record.title);
      const summary = stringOrUndefined(record.summary);
      const sourceRef = stringOrUndefined(record.sourceRef);
      if (!id && !title && !summary && !sourceRef) {
        return null;
      }
      return {
        artifactRefs: normalizeJobDisplaySnapshotArtifactRefs(record.artifactRefs),
        id: id ?? sourceRef ?? title ?? 'snapshot-evidence',
        metadata: dashboardPublicRecord(record.metadata),
        sourceRef,
        summary,
        title,
      };
    })
    .filter((item): item is JobDisplaySnapshotEvidenceItem => item !== null);
}

function normalizeJobDisplaySnapshotEvidenceIncomplete(value: unknown): JobDisplaySnapshotEvidenceIncomplete[] {
  return recordArray(value)
    .map((record): JobDisplaySnapshotEvidenceIncomplete | null => {
      const reason = firstString(record.reason);
      const message = firstString(record.message, reason);
      if (!reason && !message) {
        return null;
      }
      return {
        artifactRef: stringOrUndefined(record.artifactRef),
        createdAt: stringOrUndefined(record.createdAt),
        eventId: stringOrUndefined(record.eventId),
        message: message ?? '',
        reason: reason ?? 'unknown',
        section: stringOrUndefined(record.section),
        severity: stringOrUndefined(record.severity) ?? 'warning',
      };
    })
    .filter((item): item is JobDisplaySnapshotEvidenceIncomplete => item !== null);
}

function normalizeJobDisplaySnapshotLlmIoEntries(value: unknown): JobDisplaySnapshotLlmIoEntry[] {
  return recordArray(value)
    .map((record): JobDisplaySnapshotLlmIoEntry | null => {
      const sequence = firstNumber(record.sequence);
      const kind = firstString(record.kind);
      const title = firstString(record.title, record.summary, kind);
      if (sequence === null || !kind || !title) {
        return null;
      }
      return {
        artifactRefs: normalizeJobDisplaySnapshotArtifactRefs(record.artifactRefs),
        content: stripPrivateProviderFields(record.content),
        eventId: stringOrUndefined(record.eventId),
        kind,
        metadata: dashboardPublicRecord(record.metadata),
        phase: stringOrUndefined(record.phase),
        redaction: dashboardPublicRecord(record.redaction),
        sequence,
        summary: stringOrUndefined(record.summary),
        title,
        truncation: dashboardPublicRecord(record.truncation),
      };
    })
    .filter((item): item is JobDisplaySnapshotLlmIoEntry => item !== null)
    .sort((a, b) => a.sequence - b.sequence);
}

function normalizeJobDisplaySnapshotPhaseTimeline(value: unknown): JobDisplaySnapshotPhaseTimelineItem[] {
  return recordArray(value)
    .map((record): JobDisplaySnapshotPhaseTimelineItem | null => {
      const phase = firstString(record.phase);
      if (!phase) {
        return null;
      }
      return {
        completedAt: stringOrUndefined(record.completedAt),
        eventIds: stringArray(record.eventIds),
        phase,
        startedAt: stringOrUndefined(record.startedAt),
        status: stringOrUndefined(record.status),
        summary: stringOrUndefined(record.summary),
        title: stringOrUndefined(record.title),
      };
    })
    .filter((item): item is JobDisplaySnapshotPhaseTimelineItem => item !== null);
}

function normalizeJobDisplaySnapshotWarnings(value: unknown): JobDisplaySnapshotWarning[] {
  return recordArray(value)
    .map((record): JobDisplaySnapshotWarning | null => {
      const message = firstString(record.message, record.evidenceIncompleteReason, record.code);
      if (!message) {
        return null;
      }
      return {
        code: stringOrUndefined(record.code),
        evidenceIncompleteReason: stringOrUndefined(record.evidenceIncompleteReason),
        message,
        section: stringOrUndefined(record.section),
        severity: stringOrUndefined(record.severity) ?? 'warning',
      };
    })
    .filter((item): item is JobDisplaySnapshotWarning => item !== null);
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
  error?: { message?: unknown; stack?: string } | string | null;
  bootstrapSessionId?: string;
  displaySnapshot?: JobDisplaySnapshotSummaryRef | null;
  displaySnapshotUrl?: string;
  eventsUrl?: string;
  compact?: boolean;
  progress?: {
    activeTaskEventCount?: number;
    activeTaskId?: string;
    activeTaskLabel?: string;
    activeTaskStartedAt?: number;
    activeTaskStatus?: string;
    activeTaskUpdatedAt?: number;
    completed?: number;
    failed?: number;
    filling?: number;
    percent?: number;
    sessionId?: string;
    skeleton?: number;
    status: string;
    total?: number;
    totalToolCalls?: number;
    updatedAt?: string;
  };
  summary?: DaemonJobSummary;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
}

export type JobProcessEventKind =
  | 'workflow'
  | 'llm.input'
  | 'llm.reflection'
  | 'llm.output'
  | 'tool'
  | 'artifact'
  | 'checkpoint'
  | 'error'
  | 'summary'
  | string;

export type JobProcessSourceClass =
  | 'developer-facing'
  | 'machine-only'
  | 'raw-provider'
  | 'secret'
  | 'hidden-reasoning'
  | string;

export type JobProcessDisplayPolicy = 'full' | 'summary' | 'hidden' | string;

export type JobProcessSeverity = 'info' | 'warning' | 'error' | 'success' | string;

export interface JobProcessArtifactRef {
  kind: string;
  ref: string;
  label?: string;
  mimeType?: string;
}

export interface JobProcessArtifactContent {
  jobId: string;
  ref: string;
  content: string;
  mimeType?: string;
}

export interface JobProcessDeveloperView {
  eventId: string;
  jobId: string;
  sequence: number;
  kind: JobProcessEventKind;
  phase?: string;
  title: string;
  summary?: string;
  content?: string;
  severity?: JobProcessSeverity;
  sourceClass?: JobProcessSourceClass;
  displayPolicy?: JobProcessDisplayPolicy;
  dimensionId?: string;
  targetName?: string;
  parentEventId?: string;
  artifactRefs?: JobProcessArtifactRef[];
  metadata?: Record<string, unknown>;
  timestamp?: number | string;
}

export interface JobProcessEndpointCapability {
  available: boolean;
  endpoint?: string;
  supportedKinds?: string[];
  supportedSourceClasses?: string[];
  supportedDisplayPolicies?: string[];
  supportedRetentionPolicies?: string[];
}

export interface JobProcessEventsResponse {
  jobId: string;
  count: number;
  retainedCount: number;
  nextSequence: number;
  hiddenCount: number;
  developerViews: JobProcessDeveloperView[];
  endpointCapability?: JobProcessEndpointCapability;
}

export interface JobDisplaySnapshotRef {
  checksum?: string;
  checksumAlgorithm?: string;
  jobId?: string;
  ref?: string;
  snapshotId?: string;
  snapshotVersion?: number;
}

export interface JobDisplaySnapshotSummaryRef extends JobDisplaySnapshotRef {
  available: boolean;
  evidenceIncompleteCount?: number;
  reason?: string;
  updatedAt?: string;
  warningCount?: number;
}

export interface JobDisplaySnapshotMetadata extends JobDisplaySnapshotRef {
  createdAt?: string;
  sourceJobUpdatedAt?: string;
  updatedAt?: string;
}

export interface JobDisplaySnapshotJobIdentity {
  bootstrapSessionId?: string;
  completedAt?: string;
  createdAt?: string;
  dataRoot?: string;
  id: string;
  kind?: string;
  projectId?: string;
  projectRoot?: string;
  startedAt?: string;
  status?: string;
  updatedAt?: string;
}

export interface JobDisplaySnapshotSummary {
  message?: string;
  phase?: string;
  progress?: number;
  statusText?: string;
  title?: string;
}

export interface JobDisplaySnapshotPhaseTimelineItem {
  completedAt?: string;
  eventIds?: string[];
  phase: string;
  startedAt?: string;
  status?: string;
  summary?: string;
  title?: string;
}

export interface JobDisplaySnapshotArtifactRef extends JobProcessArtifactRef {
  checksum?: string;
  originalChars?: number;
  redactionState?: string;
  retained?: boolean;
  retainedChars?: number;
  storageKind?: string;
  truncated?: boolean;
}

export interface JobDisplaySnapshotEvidenceIncomplete {
  artifactRef?: string;
  createdAt?: string;
  eventId?: string;
  message: string;
  reason: string;
  section?: string;
  severity?: string;
}

export interface JobDisplaySnapshotLlmIoEntry {
  artifactRefs?: JobDisplaySnapshotArtifactRef[];
  content?: unknown;
  eventId?: string;
  kind: string;
  metadata?: Record<string, unknown>;
  phase?: string;
  redaction?: Record<string, unknown>;
  sequence: number;
  summary?: string;
  title: string;
  truncation?: Record<string, unknown>;
}

export interface JobDisplaySnapshotLlmIoSection {
  entries: JobDisplaySnapshotLlmIoEntry[];
  evidenceIncomplete: JobDisplaySnapshotEvidenceIncomplete[];
}

export interface JobDisplaySnapshotEvidenceItem {
  artifactRefs?: JobDisplaySnapshotArtifactRef[];
  id: string;
  metadata?: Record<string, unknown>;
  sourceRef?: string;
  summary?: string;
  title?: string;
}

export interface JobDisplaySnapshotWarning {
  code?: string;
  evidenceIncompleteReason?: string;
  message: string;
  section?: string;
  severity?: string;
}

export interface JobDisplaySnapshotManifest {
  artifactCount: number;
  developerViewCount: number;
  eventCount: number;
  llmIoEntryCount: number;
  retainedArtifactCount: number;
  warningCount: number;
}

export interface JobDisplaySnapshot {
  artifacts: JobDisplaySnapshotArtifactRef[];
  candidates: JobDisplaySnapshotEvidenceItem[];
  contractVersion?: number;
  developerViews: JobProcessDeveloperView[];
  events: JobProcessDeveloperView[];
  evidenceIncomplete: JobDisplaySnapshotEvidenceIncomplete[];
  findings: JobDisplaySnapshotEvidenceItem[];
  job: JobDisplaySnapshotJobIdentity;
  llmIo: JobDisplaySnapshotLlmIoSection;
  manifest: JobDisplaySnapshotManifest;
  phaseTimeline: JobDisplaySnapshotPhaseTimelineItem[];
  producer?: Record<string, unknown>;
  snapshot: JobDisplaySnapshotMetadata;
  sourceRefs: JobDisplaySnapshotEvidenceItem[];
  summary: JobDisplaySnapshotSummary;
  warnings: JobDisplaySnapshotWarning[];
}

export interface JobDisplaySnapshotResponse {
  persisted: boolean;
  snapshot: JobDisplaySnapshot;
  snapshotPath: string | null;
  validation?: Record<string, unknown>;
}

export function normalizeJobProcessArtifactRequestPath(jobId: string, ref: string): string {
  const trimmed = ref.trim();
  let path = trimmed;
  try {
    const parsed = new URL(trimmed, 'http://alembic.local');
    path = parsed.pathname;
  } catch {
    path = trimmed;
  }

  const apiPrefix = '/api/v1';
  if (path === apiPrefix) {
    path = '/';
  } else if (path.startsWith(`${apiPrefix}/`)) {
    path = path.slice(apiPrefix.length);
  }

  const routeMatch = path.match(/^\/jobs\/([^/]+)\/artifacts\/([^/?#]+)$/);
  if (routeMatch) {
    const routeJobId = decodeURIComponent(routeMatch[1]);
    if (routeJobId !== jobId) {
      throw new Error('Artifact ref points to a different job.');
    }
    return `/jobs/${encodeURIComponent(routeJobId)}/artifacts/${routeMatch[2]}`;
  }

  if (/^[a-zA-Z0-9._-]{1,180}$/.test(trimmed)) {
    return `/jobs/${encodeURIComponent(jobId)}/artifacts/${encodeURIComponent(trimmed)}`;
  }

  throw new Error('Unsupported job artifact ref.');
}

export interface AgentGateFailure {
  action?: string;
  reason?: unknown;
  stage?: string;
  [key: string]: unknown;
}

export interface AgentDiagnostics extends Record<string, unknown> {
  blockedTools?: unknown[];
  cancelReason?: string;
  degraded?: boolean;
  forcedSummary?: boolean;
  gateFailures?: AgentGateFailure[];
  issues?: Array<{ taskId?: string; status?: string; reason?: string }>;
  statuses?: Record<string, number>;
  timedOutStages?: string[];
}

export interface AgentEfficiencySummary {
  toolCalls?: number;
  duplicateToolCalls?: number;
  cacheHits?: number;
  cacheMisses?: number;
  tokenUsage?: {
    input?: number;
    output?: number;
    reasoning?: number;
    cacheHit?: number;
  };
  maxCompactionLevel?: number;
  totalCompactedItems?: number;
  nudgeCount?: number;
  replanCount?: number;
  emptyRetries?: number;
  forcedSummary?: boolean;
  cancelReason?: string;
}

export interface DaemonJobSummary extends Record<string, unknown> {
  aborted?: boolean;
  efficiency?: AgentEfficiencySummary | null;
  reason?: string;
  status?: string;
}

export const jobsApi = {
  async listJobs(opts?: {
    kind?: 'bootstrap' | 'rescan';
    status?: DaemonJobRecord['status'];
    limit?: number;
    compact?: boolean;
  }): Promise<DaemonJobRecord[]> {
    const res = await http.get('/jobs', { params: opts || {} });
    return res.data?.data?.jobs || [];
  },

  async getJobProcessEvents(jobId: string, opts?: {
    afterSequence?: number;
    limit?: number;
  }): Promise<JobProcessEventsResponse> {
    const res = await http.get(`/jobs/${encodeURIComponent(jobId)}/events`, { params: opts || {} });
    return normalizeJobProcessEventsResponse(res.data?.data, jobId);
  },

  async getJobDisplaySnapshot(jobId: string): Promise<JobDisplaySnapshotResponse> {
    const res = await http.get(`/jobs/${encodeURIComponent(jobId)}/display-snapshot`);
    return normalizeJobDisplaySnapshotResponse(res.data?.data, jobId);
  },

  async getJobProcessArtifact(jobId: string, artifactRef: JobProcessArtifactRef): Promise<JobProcessArtifactContent> {
    const requestPath = normalizeJobProcessArtifactRequestPath(jobId, artifactRef.ref);
    const res = await http.get<string>(requestPath, {
      responseType: 'text',
      transformResponse: [(data) => data],
    });
    const contentType = res.headers['content-type'];
    return {
      jobId,
      ref: artifactRef.ref,
      content: typeof res.data === 'string' ? res.data : String(res.data ?? ''),
      mimeType: typeof contentType === 'string' ? contentType : artifactRef.mimeType,
    };
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
};
