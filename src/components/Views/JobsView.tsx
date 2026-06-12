import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Bot,
  Braces,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CircleDashed,
  Clock3,
  Copy,
  ExternalLink,
  FileCode2,
  FileText,
  GitBranch,
  Loader2,
  MessageSquareText,
  Package,
  Play,
  RefreshCw,
  RotateCw,
  StopCircle,
  Terminal,
  Wrench,
  XCircle,
} from 'lucide-react';
import api, {
  type DaemonJobRecord,
  type JobDisplaySnapshotArtifactRef,
  type JobDisplaySnapshotEvidenceIncomplete,
  type JobDisplaySnapshotEvidenceItem,
  type JobDisplaySnapshotLlmIoEntry,
  type JobDisplaySnapshotResponse,
  type JobDisplaySnapshotSummaryRef,
  type JobDisplaySnapshotWarning,
  type JobProcessArtifactContent,
  type JobProcessArtifactRef,
  type JobProcessDeveloperView,
  normalizeJobDisplaySnapshotSummaryRef,
} from '../../api';
import { useI18n } from '../../i18n';
import { cn } from '../../lib/utils';
import { notify } from '../../utils/notification';
import { getErrorMessage } from '../../utils/error';
import { getJobEfficiency } from '../../utils/efficiency';
import { useJobProcessEvents } from '../../hooks/useJobProcessEvents';
import { useDrawerWide } from '../../hooks/useDrawerWide';
import {
  formatProcessEventSemanticLabel,
  getLlmOutputCompletenessHints,
  getProcessEventMetadataText,
  getProcessEventNudgeType,
  getProcessEventSemanticCategory,
  getProcessEventSemanticKind,
  type LlmOutputCompletenessTone,
  processEventStableKey,
  shouldCollapseProcessEventContentByDefault,
} from '../../utils/JobProcessEvents';
import {
  type EvidenceIssue,
  extractEvidenceIssue,
  formatEvidenceIssueLabel,
  formatEvidenceIssueReason,
  getEvidenceIssueToneClass,
  isEvidenceIssueFailure,
  isRecord,
} from '../../utils/EvidenceStatus';
import Select from '../ui/Select';
import { Drawer } from '../Layout/Drawer';
import PageOverlay from '../Shared/PageOverlay';

type JobKindFilter = 'all' | DaemonJobRecord['kind'];
type JobStatusFilter = 'all' | DaemonJobRecord['status'];
type JobBucketStatus = DaemonJobRecord['status'];
type TimelineDisplayMode = 'default' | 'compact';

interface TimelineDetailSelection {
  eventKey: string;
  artifactRef?: JobProcessArtifactRef;
}

interface JobsViewProps {
  onOpenCandidates?: () => void;
}

const STATUS_ORDER: DaemonJobRecord['status'][] = [
  'queued',
  'running',
  'completed',
  'failed',
  'cancelled',
];

const JOBS_PAGE_SIZE = 6;

const STATUS_STYLES: Record<DaemonJobRecord['status'], string> = {
  queued: 'text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/20',
  running: 'text-blue-600 dark:text-blue-400 bg-blue-500/10 border-blue-500/20',
  completed: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  failed: 'text-red-600 dark:text-red-400 bg-red-500/10 border-red-500/20',
  cancelled: 'text-[var(--fg-muted)] bg-[var(--bg-subtle)] border-[var(--border-default)]',
};

const STATUS_ICONS: Record<DaemonJobRecord['status'], React.ReactNode> = {
  queued: <Clock3 size={14} />,
  running: <Loader2 size={14} className="animate-spin" />,
  completed: <CheckCircle2 size={14} />,
  failed: <XCircle size={14} />,
  cancelled: <StopCircle size={14} />,
};

function labels(lang: string) {
  const zh = lang === 'zh';
  return {
    lang,
    title: zh ? '后台任务' : 'Jobs',
    refresh: zh ? '刷新' : 'Refresh',
    startBootstrap: zh ? '启动 Bootstrap' : 'Start Bootstrap',
    startRescan: zh ? '启动 Rescan' : 'Start Rescan',
    subtitle: zh ? '查看 Bootstrap / Rescan 后台任务、进度和候选入口' : 'Track Bootstrap and Rescan background jobs, progress, and candidate handoff.',
    allKinds: zh ? '全部类型' : 'All kinds',
    allStatuses: zh ? '全部状态' : 'All statuses',
    active: zh ? '活动中' : 'Active',
    completed: zh ? '已完成' : 'Completed',
    failed: zh ? '失败' : 'Failed',
    cancelled: zh ? '已取消' : 'Cancelled',
    noJobs: zh ? '暂无后台任务' : 'No jobs yet',
    noFilteredJobs: zh ? '没有匹配的任务' : 'No matching jobs',
    cancel: zh ? '取消' : 'Cancel',
    candidates: zh ? '候选' : 'Candidates',
    copied: zh ? 'Job ID 已复制' : 'Job ID copied',
    loadFailed: zh ? '任务列表加载失败' : 'Failed to load jobs',
    enqueueFailed: zh ? '任务启动失败' : 'Failed to start job',
    cancelFailed: zh ? '任务取消失败' : 'Failed to cancel job',
    updated: zh ? '更新' : 'Updated',
    created: zh ? '创建' : 'Created',
    duration: zh ? '耗时' : 'Duration',
    source: zh ? '来源' : 'Source',
    request: zh ? '请求' : 'Request',
    error: zh ? '错误' : 'Error',
    progress: zh ? '进度' : 'Progress',
    activeTask: zh ? '当前任务' : 'Active task',
    currentDimension: zh ? '当前维度' : 'Current dimension',
    activeTaskStatus: zh ? '任务状态' : 'Task status',
    activeTaskUpdated: zh ? '任务更新' : 'Task update',
    events: zh ? '事件' : 'Events',
    progressUpdated: zh ? '进度更新' : 'Progress update',
    processingState: zh ? '处理状态' : 'Processing state',
    queuedWait: zh ? '排队等待' : 'Queued',
    processing: zh ? '任务处理中' : 'Task processing',
    providerWait: zh ? '等待 AI / 任务事件' : 'Waiting for AI / task event',
    efficiency: zh ? '效率' : 'Efficiency',
    tokens: zh ? 'Token' : 'Tokens',
    inputTokens: zh ? '输入 Token' : 'Input tokens',
    outputTokens: zh ? '输出 Token' : 'Output tokens',
    reasoningTokens: zh ? '推理 Token' : 'Reasoning tokens',
    cacheHitTokens: zh ? '缓存命中 Token' : 'Cache-hit tokens',
    cache: zh ? '缓存' : 'Cache',
    duplicate: zh ? '重复' : 'Duplicate',
    compacted: zh ? '压缩' : 'Compaction',
    compactionLevel: zh ? '压缩层级' : 'Compaction level',
    compactedItems: zh ? '压缩条目' : 'Compacted items',
    control: zh ? '控制' : 'Control',
    nudge: zh ? '提示' : 'nudge',
    replan: zh ? '重规划' : 'replan',
    emptyRetry: zh ? '空结果重试' : 'empty',
    forcedSummary: zh ? '强制摘要' : 'Forced summary',
    cancelReason: zh ? '取消原因' : 'Cancel reason',
    evidenceIssue: zh ? '证据/任务状态' : 'Evidence/task status',
    evidenceSource: zh ? '来源' : 'Source',
    reason: zh ? '原因' : 'Reason',
    diagnostics: zh ? '诊断' : 'Diagnostics',
    displaySnapshot: zh ? 'Display snapshot' : 'Display snapshot',
    openSnapshot: zh ? '查看 snapshot' : 'View snapshot',
    snapshotLoading: zh ? '正在读取持久化 snapshot' : 'Loading persisted snapshot',
    snapshotLoadFailed: zh ? 'snapshot 读取失败' : 'Failed to load snapshot',
    snapshotUnavailable: zh ? '未发现 snapshot 索引；打开后会读取后端诊断快照。' : 'Snapshot index is missing; opening will read the backend diagnostic snapshot.',
    snapshotPersisted: zh ? '已持久化' : 'Persisted',
    snapshotNotPersisted: zh ? '后端返回诊断快照，未持久化' : 'Diagnostic snapshot returned, not persisted',
    snapshotRef: zh ? 'Snapshot ref' : 'Snapshot ref',
    snapshotVersion: zh ? '版本' : 'Version',
    snapshotChecksum: zh ? 'Checksum' : 'Checksum',
    snapshotWarnings: zh ? '警告' : 'Warnings',
    snapshotIncomplete: zh ? '证据不完整' : 'Evidence incomplete',
    snapshotValidation: zh ? 'Contract validation' : 'Contract validation',
    snapshotManifest: zh ? 'Manifest' : 'Manifest',
    snapshotIdentity: zh ? 'Snapshot identity' : 'Snapshot identity',
    jobIdentity: zh ? 'Job identity' : 'Job identity',
    contractVersion: zh ? 'Contract 版本' : 'Contract version',
    phaseTimeline: zh ? '阶段 timeline' : 'Phase timeline',
    llmIo: zh ? 'LLM I/O' : 'LLM I/O',
    snapshotEvents: zh ? 'Snapshot events' : 'Snapshot events',
    sourceRefs: zh ? 'SourceRefs' : 'Source refs',
    findings: zh ? 'Findings' : 'Findings',
    evidenceIncomplete: zh ? '证据不完整' : 'Evidence incomplete',
    persisted: zh ? '持久化' : 'Persisted',
    available: zh ? '可用' : 'Available',
    unavailable: zh ? '不可用' : 'Unavailable',
    ref: zh ? 'Ref' : 'Ref',
    retained: zh ? '保留' : 'Retained',
    truncated: zh ? '截断' : 'Truncated',
    redaction: zh ? 'Redaction' : 'Redaction',
    content: zh ? '内容' : 'Content',
    message: zh ? '消息' : 'Message',
    phase: zh ? '阶段' : 'Phase',
    status: zh ? '状态' : 'Status',
    startedAt: zh ? '开始' : 'Started',
    completedAt: zh ? '完成' : 'Completed',
    processTimeline: zh ? '过程 Timeline' : 'Process timeline',
    showTimeline: zh ? '查看过程' : 'View process',
    hideTimeline: zh ? '收起过程' : 'Hide timeline',
    timelineLoading: zh ? '正在读取过程事件' : 'Loading process events',
    timelineEmpty: zh ? '暂无过程事件；旧任务或后端重启后可能只保留基础进度' : 'No process events yet; old jobs or daemon restarts may only keep basic progress.',
    timelineError: zh ? '过程事件读取失败' : 'Failed to load process events',
    timelineRefresh: zh ? '刷新过程' : 'Refresh process',
    timelineRefreshing: zh ? '同步中' : 'Syncing',
    timelineWaiting: zh ? '等待新事件' : 'Waiting',
    timelineTerminal: zh ? '过程终端' : 'Process terminal',
    timelineCount: zh ? '事件' : 'events',
    hiddenEvents: zh ? '隐藏事件' : 'hidden',
    retainedEvents: zh ? '保留事件' : 'retained',
    timelineModeTitle: zh ? 'Timeline 显示模式' : 'Timeline display mode',
    timelineDefaultMode: zh ? '默认' : 'Default',
    timelineCompactMode: zh ? '简洁' : 'Compact',
    outputCompleteness: zh ? '输出完整性' : 'Output completeness',
    expandContent: zh ? '展开内容' : 'Expand content',
    collapseContent: zh ? '收起内容' : 'Collapse content',
    artifacts: zh ? '产物' : 'Artifacts',
    artifactDetails: zh ? '产物详情' : 'Artifact details',
    openArtifact: zh ? '打开产物' : 'Open artifact',
    closeDetails: zh ? '关闭详情' : 'Close details',
    timelineProjection: zh ? 'Timeline 摘要投影' : 'Timeline projection',
    projectionHint: zh ? '这里是事件流摘要，不代表完整 prompt / output。完整内容请查看下方 artifact。' : 'This is the event-stream projection, not the complete prompt/output. Use the artifact below for the full retained content.',
    fullArtifact: zh ? '完整 redacted artifact' : 'Full redacted artifact',
    artifactLoading: zh ? '正在读取 artifact' : 'Loading artifact',
    artifactFetchFailed: zh ? 'artifact 读取失败' : 'Artifact fetch failed',
    artifactUnavailable: zh ? '此事件没有 artifactRef' : 'No artifactRef on this event',
    noArtifact: zh ? '无 artifact' : 'No artifact',
    metrics: zh ? 'Metrics' : 'Metrics',
    trace: zh ? 'Trace envelope' : 'Trace envelope',
    artifactMetadata: zh ? 'Artifact metadata' : 'Artifact metadata',
    metadataNotProvided: zh ? '未提供' : 'Not provided',
    mimeType: zh ? 'MIME 类型' : 'MIME type',
    sequence: zh ? '序号' : 'Sequence',
    dimension: zh ? '维度' : 'Dimension',
    target: zh ? '目标' : 'Target',
    severity: zh ? '级别' : 'Severity',
    semanticKind: zh ? '语义' : 'Semantic',
    nudgeType: zh ? 'Nudge 类型' : 'Nudge type',
    findingCount: zh ? '发现数' : 'Findings',
    findingSources: zh ? '发现来源' : 'Finding sources',
    gateFailures: zh ? '门禁失败' : 'Gate failures',
    issues: zh ? '问题' : 'Issues',
    statuses: zh ? '状态计数' : 'Status counts',
    timedOutStages: zh ? '超时阶段' : 'Timed out stages',
    toolCalls: zh ? '工具调用' : 'Tool calls',
    summary: zh ? '摘要' : 'Summary',
    bootstrap: 'bootstrap',
    rescan: 'rescan',
    queued: zh ? '排队' : 'Queued',
    running: zh ? '运行中' : 'Running',
    statusCompleted: zh ? '完成' : 'Completed',
    statusFailed: zh ? '失败' : 'Failed',
    statusCancelled: zh ? '取消' : 'Cancelled',
    prevPage: zh ? '上一页' : 'Previous',
    nextPage: zh ? '下一页' : 'Next',
  };
}

const JobsView: React.FC<JobsViewProps> = ({ onOpenCandidates }) => {
  const { lang } = useI18n();
  const text = labels(lang);
  const [jobs, setJobs] = useState<DaemonJobRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [kindFilter, setKindFilter] = useState<JobKindFilter>('all');
  const [statusFilter, setStatusFilter] = useState<JobStatusFilter>('all');
  const [page, setPage] = useState(1);
  const [busyJobId, setBusyJobId] = useState<string | null>(null);
  const [startingKind, setStartingKind] = useState<DaemonJobRecord['kind'] | null>(null);
  const focusedJobId = useMemo(() => new URLSearchParams(window.location.search).get('job'), []);
  const [selectedTimelineJobId, setSelectedTimelineJobId] = useState<string | null>(focusedJobId);
  const [selectedSnapshotJobId, setSelectedSnapshotJobId] = useState<string | null>(null);

  const loadJobs = useCallback(async (quiet = false) => {
    if (quiet) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    try {
      const next = await api.listJobs({ limit: 100, compact: true });
      setJobs(next);
    } catch (error) {
      notify(getErrorMessage(error, text.loadFailed), { type: 'error' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [text.loadFailed]);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  useEffect(() => {
    if (!focusedJobId) {
      return;
    }
    setSelectedTimelineJobId(focusedJobId);
  }, [focusedJobId]);

  useEffect(() => {
    const hasActive = jobs.some((job) => job.status === 'queued' || job.status === 'running');
    if (!hasActive) return;
    const timer = setInterval(() => loadJobs(true), 2500);
    return () => clearInterval(timer);
  }, [jobs, loadJobs]);

  const filteredJobs = useMemo(() => {
    return jobs.filter((job) => {
      const kindOk = kindFilter === 'all' || job.kind === kindFilter;
      const statusOk = statusFilter === 'all' || getJobBucketStatus(job) === statusFilter;
      return kindOk && statusOk;
    });
  }, [jobs, kindFilter, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredJobs.length / JOBS_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginatedJobs = useMemo(() => {
    const start = (currentPage - 1) * JOBS_PAGE_SIZE;
    return filteredJobs.slice(start, start + JOBS_PAGE_SIZE);
  }, [currentPage, filteredJobs]);
  const selectedTimelineJob = useMemo(() => {
    return jobs.find((job) => job.id === selectedTimelineJobId) || null;
  }, [jobs, selectedTimelineJobId]);
  const selectedSnapshotJob = useMemo(() => {
    return jobs.find((job) => job.id === selectedSnapshotJobId) || null;
  }, [jobs, selectedSnapshotJobId]);

  useEffect(() => {
    setPage(1);
  }, [kindFilter, statusFilter]);

  useEffect(() => {
    setPage((prev) => Math.min(prev, totalPages));
  }, [totalPages]);

  useEffect(() => {
    if (!focusedJobId) {
      return;
    }
    const focusedIndex = filteredJobs.findIndex((job) => job.id === focusedJobId);
    if (focusedIndex >= 0) {
      setPage(Math.floor(focusedIndex / JOBS_PAGE_SIZE) + 1);
    }
  }, [filteredJobs, focusedJobId]);

  const counts = useMemo(() => {
    return {
      active: jobs.filter((job) => job.status === 'queued' || job.status === 'running').length,
      completed: jobs.filter((job) => getJobBucketStatus(job) === 'completed').length,
      failed: jobs.filter((job) => getJobBucketStatus(job) === 'failed').length,
      cancelled: jobs.filter((job) => getJobBucketStatus(job) === 'cancelled').length,
    };
  }, [jobs]);

  const startJob = async (kind: DaemonJobRecord['kind']) => {
    setStartingKind(kind);
    try {
      await (kind === 'bootstrap'
        ? api.enqueueBootstrapJob({ maxFiles: 500, contentMaxLines: 120 })
        : api.enqueueRescanJob({ reason: 'dashboard-job-view' }));
      await loadJobs(true);
    } catch (error) {
      notify(getErrorMessage(error, text.enqueueFailed), { type: 'error' });
    } finally {
      setStartingKind(null);
    }
  };

  const cancelJob = async (job: DaemonJobRecord) => {
    setBusyJobId(job.id);
    try {
      await api.cancelJob(job.id, 'Cancelled by Dashboard Jobs view');
      await loadJobs(true);
    } catch (error) {
      notify(getErrorMessage(error, text.cancelFailed), { type: 'error' });
    } finally {
      setBusyJobId(null);
    }
  };

  const copyJobId = async (jobId: string) => {
    await navigator.clipboard.writeText(jobId);
    notify(text.copied, { type: 'success' });
  };

  return (
    <div className="flex min-h-full min-w-0 flex-col overflow-x-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center shrink-0">
            <Activity size={20} className="text-violet-600 dark:text-violet-400" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg xl:text-xl font-bold text-[var(--fg-primary)]">{text.title}</h2>
            <p className="text-xs text-[var(--fg-muted)] mt-0.5 truncate">
              {text.subtitle}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => loadJobs(true)}
            className="p-2 rounded-lg text-[var(--fg-muted)] hover:text-[var(--fg-secondary)] hover:bg-[var(--bg-subtle)] transition-colors"
            title={text.refresh}
            aria-label={text.refresh}
          >
            <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
          </button>
          <button
            type="button"
            onClick={() => startJob('bootstrap')}
            disabled={Boolean(startingKind)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold text-violet-600 dark:text-violet-400 bg-violet-500/10 border border-violet-500/20 hover:bg-violet-500/20 transition-all disabled:cursor-not-allowed disabled:opacity-60"
          >
            {startingKind === 'bootstrap' ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />}
            {text.startBootstrap}
          </button>
          <button
            type="button"
            onClick={() => startJob('rescan')}
            disabled={Boolean(startingKind)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-500/10 border border-blue-500/20 hover:bg-blue-500/20 transition-all disabled:cursor-not-allowed disabled:opacity-60"
          >
            {startingKind === 'rescan' ? <Loader2 size={15} className="animate-spin" /> : <RotateCw size={15} />}
            {text.startRescan}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 mb-4">
        <StatTile label={text.active} value={counts.active} tone="blue" />
        <StatTile label={text.completed} value={counts.completed} tone="emerald" />
        <StatTile label={text.failed} value={counts.failed} tone="red" />
        <StatTile label={text.cancelled} value={counts.cancelled} tone="slate" />
      </div>

      <div className="flex flex-wrap items-center gap-1.5 mb-4">
        <Select
          value={kindFilter}
          onChange={(value) => setKindFilter(value as JobKindFilter)}
          options={[
            { value: 'all', label: text.allKinds },
            { value: 'bootstrap', label: text.bootstrap },
            { value: 'rescan', label: text.rescan },
          ]}
          size="sm"
          className="min-w-[132px] text-xs"
        />
        <Select
          value={statusFilter}
          onChange={(value) => setStatusFilter(value as JobStatusFilter)}
          options={[
            { value: 'all', label: text.allStatuses },
            ...STATUS_ORDER.map((status) => ({ value: status, label: statusLabel(status, text) })),
          ]}
          size="sm"
          className="min-w-[132px] text-xs"
        />
      </div>

      <div className="max-w-full overflow-x-hidden">
        {loading ? (
          <div className="flex h-48 items-center justify-center rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--fg-muted)]">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            {text.refresh}
          </div>
        ) : filteredJobs.length === 0 ? (
          <div className="flex h-48 flex-col items-center justify-center gap-2 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--fg-muted)]">
            <CircleDashed size={24} />
            <p className="text-sm">{jobs.length === 0 ? text.noJobs : text.noFilteredJobs}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {paginatedJobs.map((job) => (
              <JobRow
                key={job.id}
                job={job}
                text={text}
                busy={busyJobId === job.id}
                onCancel={() => cancelJob(job)}
                onCopy={() => copyJobId(job.id)}
                onOpenTimeline={() => setSelectedTimelineJobId(job.id)}
                onOpenSnapshot={() => setSelectedSnapshotJobId(job.id)}
                onOpenCandidates={onOpenCandidates}
              />
            ))}
            {totalPages > 1 && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-xs text-[var(--fg-secondary)]">
                <span>{formatJobsPageSummary(currentPage, totalPages, filteredJobs.length, text)}</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                    className="inline-flex h-8 items-center gap-1 rounded-md border border-[var(--border-default)] px-2.5 font-medium text-[var(--fg-secondary)] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ChevronLeft size={14} />
                    {text.prevPage}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages}
                    className="inline-flex h-8 items-center gap-1 rounded-md border border-[var(--border-default)] px-2.5 font-medium text-[var(--fg-secondary)] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {text.nextPage}
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      {selectedTimelineJob && (
        <JobProcessTimeline
          job={selectedTimelineJob}
          text={text}
          open={Boolean(selectedTimelineJob)}
          onClose={() => setSelectedTimelineJobId(null)}
        />
      )}
      {selectedSnapshotJob && (
        <JobDisplaySnapshotPanel
          job={selectedSnapshotJob}
          text={text}
          onClose={() => setSelectedSnapshotJobId(null)}
        />
      )}
    </div>
  );
};

function StatTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'blue' | 'emerald' | 'red' | 'slate';
}) {
  const toneClass = {
    blue: 'text-blue-600 dark:text-blue-400 bg-blue-500/10 border-blue-500/20',
    emerald: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    red: 'text-red-600 dark:text-red-400 bg-red-500/10 border-red-500/20',
    slate: 'text-[var(--fg-muted)] bg-[var(--bg-subtle)] border-[var(--border-default)]',
  }[tone];
  return (
    <div className={cn('rounded-xl border px-4 py-3', toneClass)}>
      <p className="text-xs font-medium opacity-80">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function formatJobsPageSummary(
  page: number,
  totalPages: number,
  totalItems: number,
  text: ReturnType<typeof labels>
): string {
  return text.lang === 'zh'
    ? `第 ${page}/${totalPages} 页 · 共 ${totalItems} 条`
    : `Page ${page}/${totalPages} · ${totalItems} jobs`;
}

function JobRow({
  job,
  text,
  busy,
  onCancel,
  onCopy,
  onOpenSnapshot,
  onOpenTimeline,
  onOpenCandidates,
}: {
  job: DaemonJobRecord;
  text: ReturnType<typeof labels>;
  busy: boolean;
  onCancel: () => void;
  onCopy: () => void;
  onOpenSnapshot: () => void;
  onOpenTimeline: () => void;
  onOpenCandidates?: () => void;
}) {
  const canCancel = job.status === 'queued' || job.status === 'running';
  const summaryChips = buildSummaryChips(job.summary);
  const diagnosticsChips = buildDiagnosticsChips(job.summary, text);
  const efficiency = getJobEfficiency(job.summary);
  const issue = getJobEvidenceIssue(job);
  const visualStatus = getJobBucketStatus(job);
  const badgeIssue = isDuplicateStatusIssue(issue, visualStatus) ? null : issue;
  const blockIssue = issue?.reason ? issue : (isCancelledStatusIssue(issue, job) ? null : issue);
  const jobErrorText = formatEvidenceIssueReason(job.error);
  const snapshotSummary = normalizeJobDisplaySnapshotSummaryRef(job.displaySnapshot);
  const canOpenCandidates =
    onOpenCandidates &&
    !isEvidenceIssueFailure(issue) &&
    (job.status === 'completed' || job.status === 'running');
  return (
    <div className="grid min-w-0 gap-4 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-4 shadow-sm lg:grid-cols-[minmax(0,1fr)_auto]">
      <div className="min-w-0 space-y-3">
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <StatusBadge status={visualStatus} text={text} />
            {badgeIssue && <IssueBadge issue={badgeIssue} text={text} />}
            <span className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-subtle)] px-2 py-0.5 text-xs font-medium text-[var(--fg-secondary)]">
              {job.kind}
            </span>
          </div>
          <div className="inline-flex min-w-0 items-center gap-1.5 self-start rounded-lg border border-[var(--border-default)] bg-[var(--bg-subtle)] px-2 py-1 sm:self-auto">
            <span className="truncate font-mono text-xs text-[var(--fg-muted)]">{job.id}</span>
            <button
              type="button"
              onClick={onCopy}
              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[var(--fg-muted)] transition-colors hover:bg-[var(--bg-surface)] hover:text-[var(--fg-primary)]"
              aria-label="Copy job id"
            >
              <Copy size={13} />
            </button>
          </div>
        </div>

        <div className="grid gap-x-6 gap-y-2 border-y border-[var(--border-muted)] py-2 text-xs text-[var(--fg-secondary)] md:grid-cols-2">
          <div className="grid min-w-0 gap-2">
            <Meta label={text.source} value={job.source} />
            <Meta label={text.processingState} value={describeProcessingState(job, text, issue)} />
            <Meta label={text.currentDimension} value={getCurrentDimensionLabel(job)} />
          </div>
          <div className="grid min-w-0 gap-2">
            <Meta label={text.created} value={formatDate(job.createdAt)} />
            <Meta label={text.updated} value={formatDate(job.updatedAt)} />
            <Meta label={text.duration} value={formatJobDuration(job)} />
          </div>
        </div>

        {job.progress && <ProgressBlock progress={job.progress} text={text} />}

        {blockIssue && <EvidenceIssueBlock issue={blockIssue} text={text} />}

        <SnapshotSummaryBlock summary={snapshotSummary} text={text} />

        {efficiency && <EfficiencyBlock efficiency={efficiency} text={text} />}

        {diagnosticsChips.length > 0 && <DiagnosticsBlock chips={diagnosticsChips} text={text} />}

        <div className="flex flex-wrap gap-2 text-xs text-[var(--fg-muted)]">
          {Object.entries(job.request || {}).slice(0, 4).map(([key, value]) => (
            <span key={key} className="max-w-full break-words rounded-lg border border-[var(--border-default)] bg-[var(--bg-subtle)] px-2 py-1">
              {key}: {String(value)}
            </span>
          ))}
          {job.bootstrapSessionId && (
            <span className="max-w-full break-words rounded-lg border border-[var(--border-default)] bg-[var(--bg-subtle)] px-2 py-1">
              session: {job.bootstrapSessionId}
            </span>
          )}
        </div>

        {summaryChips.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--fg-muted)]">
            <span className="text-[var(--fg-secondary)]">{text.summary}</span>
            {summaryChips.map((chip) => (
              <span key={chip.key} className="max-w-full break-words rounded-lg border border-[var(--border-default)] bg-[var(--bg-subtle)] px-2 py-1">
                {chip.label}: {chip.value}
              </span>
            ))}
          </div>
        )}

        {jobErrorText && (
          <p className="max-w-full whitespace-pre-wrap break-words text-xs text-red-600" title={jobErrorText}>
            {text.error}: {jobErrorText}
          </p>
        )}

      </div>

      <div className="flex min-w-0 flex-wrap items-center justify-end gap-2 lg:self-start">
        <button
          type="button"
          onClick={onOpenTimeline}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] px-2.5 text-xs font-medium text-[var(--fg-secondary)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--fg-primary)]"
        >
          <Terminal size={14} />
          {text.showTimeline}
        </button>
        <button
          type="button"
          onClick={onOpenSnapshot}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] px-2.5 text-xs font-medium text-[var(--fg-secondary)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--fg-primary)]"
        >
          <FileText size={14} />
          {text.openSnapshot}
        </button>
        {canOpenCandidates && (
          <button
            type="button"
            onClick={onOpenCandidates}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] px-2.5 text-xs font-medium text-[var(--fg-secondary)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--fg-primary)]"
          >
            <ExternalLink size={14} />
            {text.candidates}
          </button>
        )}
        {canCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-red-500/20 bg-red-500/10 px-2.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-500/20 disabled:opacity-60 dark:text-red-400"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <StopCircle size={14} />}
            {text.cancel}
          </button>
        )}
      </div>
    </div>
  );
}

function SnapshotSummaryBlock({
  summary,
  text,
}: {
  summary: JobDisplaySnapshotSummaryRef | null;
  text: ReturnType<typeof labels>;
}) {
  const missing = !summary || summary.available === false;
  const warningCount = summary?.warningCount ?? 0;
  const incompleteCount = summary?.evidenceIncompleteCount ?? 0;
  const toneClass = missing || warningCount > 0 || incompleteCount > 0
    ? 'border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-200'
    : 'border-emerald-500/20 bg-emerald-500/5 text-emerald-700 dark:text-emerald-200';
  const chips = [
    summary?.ref ? { key: 'ref', label: text.snapshotRef, value: summary.ref } : null,
    typeof summary?.snapshotVersion === 'number'
      ? { key: 'version', label: text.snapshotVersion, value: String(summary.snapshotVersion) }
      : null,
    summary?.checksum ? { key: 'checksum', label: text.snapshotChecksum, value: summary.checksum } : null,
    warningCount > 0 ? { key: 'warnings', label: text.snapshotWarnings, value: String(warningCount) } : null,
    incompleteCount > 0 ? { key: 'incomplete', label: text.snapshotIncomplete, value: String(incompleteCount) } : null,
  ].filter((item): item is { key: string; label: string; value: string } => item !== null);

  return (
    <div className={cn('space-y-2 rounded-lg border p-2 text-xs', toneClass)}>
      <div className="flex flex-wrap items-center gap-1.5 font-semibold">
        {missing ? <AlertTriangle size={13} /> : <FileText size={13} />}
        <span>{text.displaySnapshot}</span>
        <span className="font-medium opacity-80">
          {missing ? text.unavailable : text.available}
        </span>
      </div>
      {missing && (
        <p className="break-words text-current/80">
          {summary?.reason ? `${text.reason}: ${summary.reason}` : text.snapshotUnavailable}
        </p>
      )}
      {chips.length > 0 && (
        <div className="flex min-w-0 flex-wrap gap-1.5">
          {chips.map((chip) => (
            <span key={chip.key} className="max-w-full break-all rounded-md border border-current/20 bg-[var(--bg-surface)] px-1.5 py-0.5 text-current/90">
              <span className="opacity-70">{chip.label}</span>
              <span className="ml-1 font-medium">{chip.value}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function JobDisplaySnapshotPanel({
  job,
  text,
  onClose,
}: {
  job: DaemonJobRecord;
  text: ReturnType<typeof labels>;
  onClose: () => void;
}) {
  const { isWide: drawerWide, toggle: toggleDrawerWide } = useDrawerWide();
  const [snapshotState, setSnapshotState] = useState<{
    error?: string;
    response?: JobDisplaySnapshotResponse;
    status: 'loading' | 'success' | 'error';
  }>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setSnapshotState({ status: 'loading' });
    api.getJobDisplaySnapshot(job.id)
      .then((response) => {
        if (!cancelled) {
          setSnapshotState({ response, status: 'success' });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          const message = getErrorMessage(error, text.snapshotLoadFailed);
          console.warn('[JobsView] display snapshot fetch failed', { jobId: job.id, message });
          setSnapshotState({ error: message, status: 'error' });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [job.id, text.snapshotLoadFailed]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  const snapshot = snapshotState.response?.snapshot;
  const subtitleParts = [
    `${job.kind} · ${job.id}`,
    snapshot?.snapshot.ref,
    snapshotState.response
      ? snapshotState.response.persisted ? text.snapshotPersisted : text.snapshotNotPersisted
      : undefined,
  ].filter((part): part is string => typeof part === 'string' && part.length > 0);

  return (
    <PageOverlay className="z-30 flex justify-end overflow-hidden" onClick={onClose}>
      <PageOverlay.Backdrop className="bg-black/20 backdrop-blur-sm dark:bg-black/40" />
      <Drawer.Panel size={drawerWide ? 'lg' : 'md'} width={drawerWide ? 'w-[min(92vw,960px)]' : 'w-[min(92vw,760px)]'}>
        <Drawer.Header
          leading={<FileText size={16} className="text-emerald-500" />}
          title={text.displaySnapshot}
          subtitle={subtitleParts.join(' · ')}
        >
          <Drawer.HeaderActions>
            <Drawer.WidthToggle isWide={drawerWide} onToggle={toggleDrawerWide} />
            <Drawer.CloseButton onClose={onClose} />
          </Drawer.HeaderActions>
        </Drawer.Header>
        <Drawer.Body padded={false} className="min-h-0 bg-[#f8fafc] text-[#0f172a] dark:bg-[#020617] dark:text-[#e2e8f0]">
          {snapshotState.status === 'loading' && (
            <div className="flex items-center gap-2 px-5 py-5 text-xs text-[#64748b] dark:text-[#94a3b8]">
              <Loader2 size={14} className="animate-spin" />
              {text.snapshotLoading}
            </div>
          )}
          {snapshotState.status === 'error' && (
            <div className="px-5 py-5">
              <div className="flex items-start gap-2 rounded-lg border border-red-500/25 bg-red-50 p-3 text-xs text-red-700 dark:border-red-400/30 dark:bg-red-400/10 dark:text-red-200">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                <span>{snapshotState.error || text.snapshotLoadFailed}</span>
              </div>
            </div>
          )}
          {snapshotState.status === 'success' && snapshotState.response && (
            <JobDisplaySnapshotContent response={snapshotState.response} text={text} />
          )}
        </Drawer.Body>
      </Drawer.Panel>
    </PageOverlay>
  );
}

function JobDisplaySnapshotContent({
  response,
  text,
}: {
  response: JobDisplaySnapshotResponse;
  text: ReturnType<typeof labels>;
}) {
  const snapshot = response.snapshot;
  const allIncomplete = [...snapshot.evidenceIncomplete, ...snapshot.llmIo.evidenceIncomplete];
  const displayEvents = snapshot.developerViews.length > 0 ? snapshot.developerViews : snapshot.events;
  const identityItems = [
    { key: text.persisted, value: response.persisted ? 'true' : 'false' },
    { key: text.contractVersion, value: formatDetailValue(snapshot.contractVersion) },
    { key: text.snapshotVersion, value: formatDetailValue(snapshot.snapshot.snapshotVersion) },
    { key: text.snapshotRef, value: snapshot.snapshot.ref || '' },
    { key: text.snapshotChecksum, value: snapshot.snapshot.checksum || '' },
    { key: 'updatedAt', value: formatDate(snapshot.snapshot.updatedAt) },
  ].filter((item) => item.value.length > 0 && item.value !== '--');
  const jobItems = [
    { key: 'id', value: snapshot.job.id },
    { key: 'kind', value: snapshot.job.kind || '' },
    { key: text.status, value: snapshot.job.status || '' },
    { key: 'projectId', value: snapshot.job.projectId || '' },
    { key: text.startedAt, value: formatDate(snapshot.job.startedAt) },
    { key: text.completedAt, value: formatDate(snapshot.job.completedAt) },
  ].filter((item) => item.value.length > 0 && item.value !== '--');
  const manifestItems = recordToDisplayItems({ ...snapshot.manifest });

  return (
    <div className="space-y-4 px-5 py-4">
      <SnapshotAlertBlock
        response={response}
        incomplete={allIncomplete}
        warnings={snapshot.warnings}
        text={text}
      />

      <DetailSection title={text.summary}>
        <div className="space-y-2 rounded-lg border border-[#d7e0ea] bg-white px-3 py-2.5 text-xs dark:border-[#334155] dark:bg-[#0f172a]">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="rounded-md border border-blue-500/20 bg-blue-50 px-2 py-0.5 font-medium text-blue-700 dark:border-blue-300/30 dark:bg-blue-300/10 dark:text-blue-200">
              {snapshot.summary.statusText || snapshot.job.status || text.metadataNotProvided}
            </span>
            {snapshot.summary.phase && (
              <span className="rounded-md border border-[#cbd5e1] bg-[#f8fafc] px-2 py-0.5 text-[#334155] dark:border-[#334155] dark:bg-[#111827] dark:text-[#e2e8f0]">
                {text.phase}: {snapshot.summary.phase}
              </span>
            )}
            {typeof snapshot.summary.progress === 'number' && (
              <span className="rounded-md border border-[#cbd5e1] bg-[#f8fafc] px-2 py-0.5 text-[#334155] dark:border-[#334155] dark:bg-[#111827] dark:text-[#e2e8f0]">
                {text.progress}: {snapshot.summary.progress}%
              </span>
            )}
          </div>
          <div className="space-y-1">
            {snapshot.summary.title && <h4 className="break-words text-sm font-semibold text-[#0f172a] dark:text-[#f8fafc]">{snapshot.summary.title}</h4>}
            {snapshot.summary.message && <p className="whitespace-pre-wrap break-all leading-relaxed text-[#334155] dark:text-[#cbd5e1]">{snapshot.summary.message}</p>}
          </div>
        </div>
      </DetailSection>

      <div className="grid gap-4 lg:grid-cols-2">
        <DetailSection title={text.snapshotIdentity}>
          <DetailKeyValueGrid items={identityItems} emptyText={text.metadataNotProvided} />
        </DetailSection>
        <DetailSection title={text.jobIdentity}>
          <DetailKeyValueGrid items={jobItems} emptyText={text.metadataNotProvided} />
        </DetailSection>
      </div>

      <DetailSection title={text.snapshotManifest}>
        <DetailKeyValueGrid items={manifestItems} emptyText={text.metadataNotProvided} />
      </DetailSection>

      <SnapshotPhaseTimeline items={snapshot.phaseTimeline} text={text} />
      <SnapshotWarnings warnings={snapshot.warnings} incomplete={allIncomplete} text={text} />
      <SnapshotLlmIoEntries entries={snapshot.llmIo.entries} text={text} />
      <SnapshotDeveloperEvents events={displayEvents} text={text} />

      <div className="grid gap-4 lg:grid-cols-3">
        <SnapshotEvidenceList title={text.findings} items={snapshot.findings} text={text} />
        <SnapshotEvidenceList title={text.candidates} items={snapshot.candidates} text={text} />
        <SnapshotEvidenceList title={text.sourceRefs} items={snapshot.sourceRefs} text={text} />
      </div>

      <DetailSection title={text.artifacts}>
        {snapshot.artifacts.length > 0 ? (
          <SnapshotArtifactRefs artifacts={snapshot.artifacts} text={text} />
        ) : (
          <EmptyDetailValue text={text.noArtifact} />
        )}
      </DetailSection>

      <DetailSection title={text.snapshotValidation}>
        <DetailKeyValueGrid items={recordToDisplayItems(response.validation ?? null)} emptyText={text.metadataNotProvided} />
      </DetailSection>
    </div>
  );
}

function SnapshotAlertBlock({
  response,
  incomplete,
  warnings,
  text,
}: {
  response: JobDisplaySnapshotResponse;
  incomplete: JobDisplaySnapshotEvidenceIncomplete[];
  warnings: JobDisplaySnapshotWarning[];
  text: ReturnType<typeof labels>;
}) {
  const validationValid = typeof response.validation?.valid === 'boolean' ? response.validation.valid : undefined;
  const messages = [
    !response.persisted ? text.snapshotNotPersisted : null,
    validationValid === false ? text.snapshotValidation : null,
    warnings.length > 0 ? `${text.snapshotWarnings}: ${warnings.length}` : null,
    incomplete.length > 0 ? `${text.snapshotIncomplete}: ${incomplete.length}` : null,
  ].filter((item): item is string => item !== null);

  if (messages.length === 0) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-200">
        <CheckCircle2 size={14} />
        <span>{text.snapshotPersisted}</span>
      </div>
    );
  }

  return (
    <div className="space-y-1 rounded-lg border border-amber-500/25 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-300/30 dark:bg-amber-300/10 dark:text-amber-100">
      <div className="flex items-center gap-1.5 font-semibold">
        <AlertTriangle size={14} />
        {text.displaySnapshot}
      </div>
      <div className="flex min-w-0 flex-wrap gap-1.5">
        {messages.map((message) => (
          <span key={message} className="max-w-full break-words rounded-md border border-current/20 bg-white/60 px-1.5 py-0.5 dark:bg-black/10">
            {message}
          </span>
        ))}
      </div>
    </div>
  );
}

function SnapshotPhaseTimeline({
  items,
  text,
}: {
  items: Array<{
    completedAt?: string;
    eventIds?: string[];
    phase: string;
    startedAt?: string;
    status?: string;
    summary?: string;
    title?: string;
  }>;
  text: ReturnType<typeof labels>;
}) {
  return (
    <DetailSection title={text.phaseTimeline}>
      {items.length > 0 ? (
        <div className="space-y-2">
          {items.map((item) => (
            <div key={`${item.phase}:${item.startedAt || item.completedAt || item.title || ''}`} className="rounded-lg border border-[#d7e0ea] bg-white px-3 py-2.5 text-xs dark:border-[#334155] dark:bg-[#0f172a]">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="font-semibold text-[#0f172a] dark:text-[#f8fafc]">{item.title || item.phase}</span>
                {item.status && <span className="rounded-md border border-[#cbd5e1] bg-[#f8fafc] px-1.5 py-0.5 text-[#334155] dark:border-[#334155] dark:bg-[#111827] dark:text-[#e2e8f0]">{item.status}</span>}
                {item.eventIds && item.eventIds.length > 0 && <span className="text-[#64748b] dark:text-[#94a3b8]">{text.events}: {item.eventIds.length}</span>}
              </div>
              {item.summary && <p className="mt-1 whitespace-pre-wrap break-all leading-relaxed text-[#334155] dark:text-[#cbd5e1]">{item.summary}</p>}
              <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-[#64748b] dark:text-[#94a3b8]">
                {item.startedAt && <span>{text.startedAt}: {formatDate(item.startedAt)}</span>}
                {item.completedAt && <span>{text.completedAt}: {formatDate(item.completedAt)}</span>}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyDetailValue text={text.metadataNotProvided} />
      )}
    </DetailSection>
  );
}

function SnapshotWarnings({
  incomplete,
  text,
  warnings,
}: {
  incomplete: JobDisplaySnapshotEvidenceIncomplete[];
  text: ReturnType<typeof labels>;
  warnings: JobDisplaySnapshotWarning[];
}) {
  if (warnings.length === 0 && incomplete.length === 0) {
    return null;
  }
  return (
    <DetailSection title={`${text.snapshotWarnings} / ${text.evidenceIncomplete}`}>
      <div className="space-y-2">
        {warnings.map((warning, index) => (
          <SnapshotNotice
            key={`warning:${warning.code || warning.message}:${index}`}
            title={warning.code || warning.severity || text.snapshotWarnings}
            message={warning.message}
            meta={[
              warning.section ? `${text.phase}: ${warning.section}` : '',
              warning.evidenceIncompleteReason ? `${text.reason}: ${warning.evidenceIncompleteReason}` : '',
            ].filter(Boolean)}
            severity={warning.severity}
          />
        ))}
        {incomplete.map((item, index) => (
          <SnapshotNotice
            key={`incomplete:${item.reason}:${item.eventId || index}`}
            title={item.reason}
            message={item.message}
            meta={[
              item.section ? `${text.phase}: ${item.section}` : '',
              item.eventId ? `eventId: ${item.eventId}` : '',
              item.artifactRef ? `${text.ref}: ${item.artifactRef}` : '',
            ].filter(Boolean)}
            severity={item.severity}
          />
        ))}
      </div>
    </DetailSection>
  );
}

function SnapshotNotice({
  message,
  meta,
  severity,
  title,
}: {
  message: string;
  meta: string[];
  severity?: string;
  title: string;
}) {
  const tone = severity === 'error'
    ? 'border-red-500/25 bg-red-50 text-red-700 dark:border-red-400/30 dark:bg-red-400/10 dark:text-red-200'
    : 'border-amber-500/25 bg-amber-50 text-amber-800 dark:border-amber-300/30 dark:bg-amber-300/10 dark:text-amber-100';
  return (
    <div className={cn('space-y-1 rounded-lg border px-3 py-2 text-xs', tone)}>
      <div className="flex items-center gap-1.5 font-semibold">
        <AlertTriangle size={13} />
        <span>{title}</span>
      </div>
      <p className="whitespace-pre-wrap break-all leading-relaxed">{message}</p>
      {meta.length > 0 && (
        <div className="flex flex-wrap gap-1.5 text-[11px] opacity-80">
          {meta.map((item) => <span key={item} className="break-all">{item}</span>)}
        </div>
      )}
    </div>
  );
}

function SnapshotLlmIoEntries({
  entries,
  text,
}: {
  entries: JobDisplaySnapshotLlmIoEntry[];
  text: ReturnType<typeof labels>;
}) {
  return (
    <DetailSection title={text.llmIo}>
      {entries.length > 0 ? (
        <div className="space-y-2">
          {entries.map((entry) => {
            const content = formatSnapshotContent(entry.content);
            return (
              <div key={`${entry.sequence}:${entry.kind}:${entry.eventId || ''}`} className="space-y-2 rounded-lg border border-[#d7e0ea] bg-white px-3 py-2.5 text-xs dark:border-[#334155] dark:bg-[#0f172a]">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="rounded-md border border-blue-500/20 bg-blue-50 px-1.5 py-0.5 font-medium text-blue-700 dark:border-blue-300/30 dark:bg-blue-300/10 dark:text-blue-200">
                    #{entry.sequence} · {entry.kind}
                  </span>
                  <span className="break-words font-semibold text-[#0f172a] dark:text-[#f8fafc]">{entry.title}</span>
                  {entry.phase && <span className="text-[#64748b] dark:text-[#94a3b8]">{text.phase}: {entry.phase}</span>}
                </div>
                {entry.summary && <p className="whitespace-pre-wrap break-all leading-relaxed text-[#334155] dark:text-[#cbd5e1]">{entry.summary}</p>}
                {content && <SnapshotTextBlock text={content} />}
                <SnapshotArtifactRefs artifacts={entry.artifactRefs} text={text} />
                <DetailKeyValueGrid items={recordToDisplayItems(entry.metadata ?? null)} emptyText={text.metadataNotProvided} />
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyDetailValue text={text.metadataNotProvided} />
      )}
    </DetailSection>
  );
}

function SnapshotDeveloperEvents({
  events,
  text,
}: {
  events: JobProcessDeveloperView[];
  text: ReturnType<typeof labels>;
}) {
  return (
    <DetailSection title={text.snapshotEvents}>
      {events.length > 0 ? (
        <div className="space-y-2">
          {events.map((event) => (
            <div key={processEventStableKey(event)} className="space-y-2 rounded-lg border border-[#d7e0ea] bg-white px-3 py-2.5 text-xs dark:border-[#334155] dark:bg-[#0f172a]">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className={cn('inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-medium', getProcessEventTone(event).badge)}>
                  {getProcessEventIcon(event)}
                  #{event.sequence} · {event.kind}
                </span>
                <span className="break-words font-semibold text-[#0f172a] dark:text-[#f8fafc]">{event.title}</span>
                {event.phase && <span className="text-[#64748b] dark:text-[#94a3b8]">{text.phase}: {event.phase}</span>}
              </div>
              {event.summary && <p className="whitespace-pre-wrap break-all leading-relaxed text-[#334155] dark:text-[#cbd5e1]">{event.summary}</p>}
              {event.content && <SnapshotTextBlock text={event.content} />}
              <SnapshotArtifactRefs artifacts={event.artifactRefs} text={text} />
            </div>
          ))}
        </div>
      ) : (
        <EmptyDetailValue text={text.metadataNotProvided} />
      )}
    </DetailSection>
  );
}

function SnapshotEvidenceList({
  items,
  text,
  title,
}: {
  items: JobDisplaySnapshotEvidenceItem[];
  text: ReturnType<typeof labels>;
  title: string;
}) {
  return (
    <DetailSection title={title}>
      {items.length > 0 ? (
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.id} className="space-y-2 rounded-lg border border-[#d7e0ea] bg-white px-3 py-2.5 text-xs dark:border-[#334155] dark:bg-[#0f172a]">
              <div className="break-words font-semibold text-[#0f172a] dark:text-[#f8fafc]">{item.title || item.id}</div>
              {item.sourceRef && <div className="break-all text-[11px] text-[#64748b] dark:text-[#94a3b8]">{text.ref}: {item.sourceRef}</div>}
              {item.summary && <p className="whitespace-pre-wrap break-all leading-relaxed text-[#334155] dark:text-[#cbd5e1]">{item.summary}</p>}
              <SnapshotArtifactRefs artifacts={item.artifactRefs} text={text} />
              <DetailKeyValueGrid items={recordToDisplayItems(item.metadata ?? null)} emptyText={text.metadataNotProvided} />
            </div>
          ))}
        </div>
      ) : (
        <EmptyDetailValue text={text.metadataNotProvided} />
      )}
    </DetailSection>
  );
}

function SnapshotArtifactRefs({
  artifacts,
  text,
}: {
  artifacts?: Array<JobDisplaySnapshotArtifactRef | JobProcessArtifactRef>;
  text: ReturnType<typeof labels>;
}) {
  if (!artifacts || artifacts.length === 0) {
    return null;
  }
  return (
    <div className="flex min-w-0 flex-wrap gap-1.5">
      {artifacts.map((artifact) => {
        const retained = 'retained' in artifact && typeof artifact.retained === 'boolean'
          ? `${text.retained}: ${artifact.retained}`
          : '';
        const truncated = 'truncated' in artifact && typeof artifact.truncated === 'boolean'
          ? `${text.truncated}: ${artifact.truncated}`
          : '';
        const redaction = 'redactionState' in artifact && artifact.redactionState
          ? `${text.redaction}: ${artifact.redactionState}`
          : '';
        const title = [artifact.ref, retained, truncated, redaction].filter(Boolean).join(' · ');
        return (
          <span
            key={`${artifact.kind}:${artifact.ref}`}
            className="inline-flex max-w-full items-center gap-1 break-all rounded-md border border-violet-500/25 bg-violet-50 px-2 py-0.5 text-violet-700 dark:border-violet-300/40 dark:bg-violet-300/10 dark:text-violet-100"
            title={title || artifact.ref}
          >
            <Package size={11} className="shrink-0" />
            {artifact.label || artifact.kind}: {artifact.ref}
          </span>
        );
      })}
    </div>
  );
}

function SnapshotTextBlock({ text }: { text: string }) {
  return (
    <pre className="overflow-x-hidden whitespace-pre-wrap break-all rounded-lg border border-[#d7e0ea] bg-[#f8fafc] px-3 py-2.5 font-mono text-[11px] leading-relaxed text-[#1e293b] dark:border-[#334155] dark:bg-[#111827] dark:text-[#e2e8f0]">
      {text}
    </pre>
  );
}

function JobProcessTimeline({
  job,
  text,
  open,
  onClose,
}: {
  job: DaemonJobRecord;
  text: ReturnType<typeof labels>;
  open: boolean;
  onClose: () => void;
}) {
  const { isWide: drawerWide, toggle: toggleDrawerWide } = useDrawerWide();
  const [timelineDisplayMode, setTimelineDisplayMode] = useState<TimelineDisplayMode>('default');
  const [selectedTimelineDetail, setSelectedTimelineDetail] = useState<TimelineDetailSelection | null>(null);
  const isActive = job.status === 'queued' || job.status === 'running';
  const {
    events,
    loading,
    refreshing,
    error,
    hiddenCount,
    retainedCount,
    endpointCapability,
    expandedContentEventIds,
    refresh,
    setContentExpanded,
  } = useJobProcessEvents(job.id, { enabled: open, active: isActive, limit: 120 });

  const visibleEvents = useMemo(() => events, [events]);
  const selectedDetailEvent = useMemo(() => {
    if (!selectedTimelineDetail) {
      return null;
    }
    return visibleEvents.find((event) => processEventStableKey(event) === selectedTimelineDetail.eventKey) ?? null;
  }, [selectedTimelineDetail, visibleEvents]);
  const timelineListRef = useRef<HTMLDivElement>(null);
  const timelineSubtitleParts = [
    `${visibleEvents.length} ${text.timelineCount}`,
    retainedCount > 0 ? `${text.retainedEvents}: ${retainedCount}` : '',
    hiddenCount > 0 ? `${text.hiddenEvents}: ${hiddenCount}` : '',
    endpointCapability?.available === false ? 'events unavailable' : '',
    isActive ? (refreshing ? text.timelineRefreshing : text.timelineWaiting) : '',
  ].filter(Boolean);

  const scrollTimelineToBottom = useCallback((node: HTMLDivElement | null) => {
    if (!node) {
      return;
    }
    node.scrollTop = node.scrollHeight;
  }, []);

  useEffect(() => {
    scrollTimelineToBottom(timelineListRef.current);
  }, [refreshing, scrollTimelineToBottom, visibleEvents.length]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (selectedTimelineDetail) {
          setSelectedTimelineDetail(null);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose, open, selectedTimelineDetail]);

  useEffect(() => {
    setSelectedTimelineDetail(null);
  }, [job.id, open]);

  const renderTimelineContent = () => {
    if (loading) {
      return (
        <div className="flex items-center gap-2 px-1 py-4 text-xs text-[#64748b] dark:text-[#94a3b8]">
          <Loader2 size={14} className="animate-spin" />
          {text.timelineLoading}
        </div>
      );
    }
    if (error) {
      return (
        <div className="flex items-start gap-2 px-1 py-4 text-xs text-red-600 dark:text-red-300">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>{text.timelineError}: {error}</span>
        </div>
      );
    }
    if (visibleEvents.length === 0) {
      return (
        <div className="flex items-start gap-2 px-1 py-4 text-xs text-[#64748b] dark:text-[#94a3b8]">
          <CircleDashed size={14} className="mt-0.5 shrink-0" />
          <span>{text.timelineEmpty}</span>
        </div>
      );
    }
    return (
      <div className="min-w-0 space-y-0 overflow-x-hidden">
        {visibleEvents.map((event) => {
          const eventKey = processEventStableKey(event);
          return (
            <ProcessEventItem
              key={eventKey}
              event={event}
              text={text}
              displayMode={timelineDisplayMode}
              detailOpen={selectedTimelineDetail?.eventKey === eventKey}
              contentExpanded={expandedContentEventIds.has(eventKey)}
              onContentExpandedChange={(expanded) => setContentExpanded(eventKey, expanded)}
              onOpenDetails={(artifactRef) => setSelectedTimelineDetail({ eventKey, artifactRef })}
            />
          );
        })}
      </div>
    );
  };

  if (!open) {
    return null;
  }

  const closeTimelineDetail = () => setSelectedTimelineDetail(null);
  const stackedPanelWidth = drawerWide ? 'w-[min(92vw,960px)]' : 'w-[min(92vw,700px)]';
  const timelinePanelWidth = selectedDetailEvent ? `${stackedPanelWidth} lg:w-[min(62vw,960px)]` : undefined;
  const timelineDetailPanelWidth = `${stackedPanelWidth} lg:w-[min(34vw,560px)]`;

  return (
    <PageOverlay className="z-30 flex justify-end overflow-hidden" onClick={onClose}>
      <PageOverlay.Backdrop className="bg-black/20 backdrop-blur-sm dark:bg-black/40" />
      {selectedDetailEvent && (
        <Drawer.Panel
          width={timelineDetailPanelWidth}
          className="absolute inset-y-0 right-0 z-20 lg:static lg:z-auto lg:!border-l-0 lg:!shadow-none lg:border-r lg:border-r-[var(--border-default)]"
        >
          <JobProcessEventDetailPanel
            event={selectedDetailEvent}
            initialArtifactRef={selectedTimelineDetail?.artifactRef}
            text={text}
            onClose={closeTimelineDetail}
          />
        </Drawer.Panel>
      )}
      <Drawer.Panel
        size={drawerWide ? 'lg' : 'md'}
        width={timelinePanelWidth}
      >
        <Drawer.Header
          leading={<Terminal size={16} className={isActive ? 'text-blue-500' : 'text-[var(--fg-muted)]'} />}
          title={text.processTimeline}
          subtitle={timelineSubtitleParts.join(' · ')}
        >
          <Drawer.HeaderActions>
            <div
              className="inline-flex h-8 items-center rounded-md border border-[var(--border-default)] bg-[var(--bg-subtle)] p-0.5"
              role="group"
              aria-label={text.timelineModeTitle}
            >
              {([
                ['default', text.timelineDefaultMode],
                ['compact', text.timelineCompactMode],
              ] as const).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setTimelineDisplayMode(mode)}
                  aria-pressed={timelineDisplayMode === mode}
                  className={cn(
                    'h-6 rounded px-2 text-[11px] font-medium transition-colors',
                    timelineDisplayMode === mode
                      ? 'bg-[var(--bg-surface)] text-[var(--fg-primary)] shadow-sm'
                      : 'text-[var(--fg-muted)] hover:text-[var(--fg-primary)]'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => refresh()}
              className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs text-[var(--fg-muted)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--fg-primary)]"
              title={text.timelineRefresh}
            >
              <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
              {text.timelineRefresh}
            </button>
            <Drawer.WidthToggle isWide={drawerWide} onToggle={toggleDrawerWide} />
            <Drawer.CloseButton onClose={onClose} />
          </Drawer.HeaderActions>
        </Drawer.Header>
        <Drawer.Body padded={false} className="min-h-0 overflow-hidden">
          {/* 过程 Timeline 直接贴合侧边栏；显式 light/dark 色值避免 legacy dark-mode 覆盖。 */}
          <div
            ref={timelineListRef}
            className="h-full overflow-y-auto overflow-x-hidden px-5 py-4 text-[#0f172a] overscroll-contain dark:text-[#e2e8f0]"
            aria-label={text.timelineTerminal}
          >
            {renderTimelineContent()}
          </div>
        </Drawer.Body>
      </Drawer.Panel>
    </PageOverlay>
  );
}

function getLlmOutputCompletenessToneClass(tone: LlmOutputCompletenessTone): string {
  switch (tone) {
    case 'info':
      return 'border-blue-500/25 bg-blue-50 text-blue-700 dark:border-blue-400/30 dark:bg-blue-400/10 dark:text-blue-200';
    case 'warning':
      return 'border-amber-500/30 bg-amber-50 text-amber-700 dark:border-amber-300/40 dark:bg-amber-300/10 dark:text-amber-200';
    case 'danger':
      return 'border-red-500/30 bg-red-50 text-red-700 dark:border-red-400/40 dark:bg-red-400/10 dark:text-red-200';
    case 'neutral':
    default:
      return 'border-[#cbd5e1] bg-[#f8fafc] text-[#334155] dark:border-[#334155] dark:bg-[#111827] dark:text-[#e2e8f0]';
  }
}

function ProcessEventItem({
  event,
  text,
  displayMode,
  detailOpen,
  contentExpanded,
  onContentExpandedChange,
  onOpenDetails,
}: {
  event: JobProcessDeveloperView;
  text: ReturnType<typeof labels>;
  displayMode: TimelineDisplayMode;
  detailOpen: boolean;
  contentExpanded: boolean;
  onContentExpandedChange: (expanded: boolean) => void;
  onOpenDetails: (artifactRef?: JobProcessArtifactRef) => void;
}) {
  const tone = getProcessEventTone(event);
  const icon = getProcessEventIcon(event);
  const semanticLabel = formatProcessEventSemanticLabel(event, text.lang);
  const semanticKind = getProcessEventSemanticKind(event);
  const nudgeType = getProcessEventNudgeType(event);
  const artifactRefs = event.artifactRefs ?? [];
  const hasDetail = hasProcessEventDetail(event);
  const contentShouldCollapse = shouldCollapseProcessEventContentByDefault(event);
  const effectiveContentExpanded = Boolean(event.content) && (!contentShouldCollapse || contentExpanded);
  const llmOutputHints = displayMode === 'default' ? getLlmOutputCompletenessHints(event, text.lang) : [];
  const metaItems = [
    { label: text.sequence, value: `#${event.sequence}` },
    { label: 'kind', value: event.kind },
    { label: text.semanticKind, value: semanticKind },
    { label: text.nudgeType, value: nudgeType },
    { label: 'phase', value: event.phase },
    { label: text.dimension, value: event.dimensionId },
    { label: text.target, value: event.targetName },
    { label: text.findingCount, value: getProcessEventMetadataText(event, 'findingCount') },
    { label: text.findingSources, value: getProcessEventMetadataText(event, 'findingSources') },
    { label: text.severity, value: event.severity },
  ].filter((item): item is { label: string; value: string } =>
    typeof item.value === 'string' && item.value.length > 0
  );
  const contentToggle = event.content && contentShouldCollapse ? (
    <button
      type="button"
      onClick={() => onContentExpandedChange(!contentExpanded)}
      className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-[11px] font-medium text-[#475569] transition-colors hover:bg-[#e2e8f0] hover:text-[#0f172a] dark:text-[#cbd5e1] dark:hover:bg-[#1e293b] dark:hover:text-white"
    >
      {contentExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      {contentExpanded ? text.collapseContent : text.expandContent}
    </button>
  ) : null;
  const detailButton = hasDetail ? (
    <button
      type="button"
      onClick={() => onOpenDetails(artifactRefs[0])}
      className={cn(
        'inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-[11px] font-medium transition-colors',
        detailOpen
          ? 'bg-blue-100 text-blue-700 dark:bg-blue-400/15 dark:text-blue-200'
          : 'text-[#475569] hover:bg-[#e2e8f0] hover:text-[#0f172a] dark:text-[#cbd5e1] dark:hover:bg-[#1e293b] dark:hover:text-white'
      )}
    >
      <ExternalLink size={12} />
      {text.artifactDetails}
    </button>
  ) : null;

  return (
    <div
      data-process-event-sequence={event.sequence}
      className="relative grid min-w-0 max-w-full gap-3 overflow-x-hidden border-l border-[#cbd5e1] py-3 pl-4 text-xs first:pt-1 last:pb-1 dark:border-[#334155]"
    >
      <div className={cn('absolute -left-[7px] top-3 flex h-3.5 w-3.5 items-center justify-center rounded-full border bg-[#f8fafc] dark:bg-[#020617]', tone.dot)} />
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className={cn('inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-medium', tone.badge)}>
            {icon}
            {semanticLabel}
          </span>
          <span className="min-w-0 break-all font-semibold text-[#0f172a] dark:text-[#f8fafc]">{event.title}</span>
          {event.timestamp && (
            <span className="text-[#64748b] dark:text-[#94a3b8]">{formatEventTimestamp(event.timestamp)}</span>
          )}
        </div>
        {(detailButton || contentToggle) && (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
            {detailButton}
            {contentToggle}
          </div>
        )}
      </div>
      {event.summary && (
        <p className="whitespace-pre-wrap break-all leading-relaxed text-[#1e293b] dark:text-[#e2e8f0]">{event.summary}</p>
      )}
      {llmOutputHints.length > 0 && (
        <div className="flex min-w-0 flex-wrap gap-1.5" aria-label={text.outputCompleteness}>
          {llmOutputHints.map((hint) => (
            <span
              key={hint.id}
              className={cn('inline-flex max-w-full items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium', getLlmOutputCompletenessToneClass(hint.tone))}
              title={hint.value ? `${hint.label}: ${hint.value}` : hint.label}
            >
              <span className="shrink-0">{hint.label}</span>
              {hint.value && <span className="min-w-0 break-all font-semibold">{hint.value}</span>}
            </span>
          ))}
        </div>
      )}
      {event.content && effectiveContentExpanded && (
        <pre className="max-w-full whitespace-pre-wrap break-all font-sans leading-relaxed text-[#1e293b] dark:text-[#e2e8f0]">{event.content}</pre>
      )}
      {artifactRefs.length > 0 && (
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="text-[#64748b] dark:text-[#94a3b8]">{text.artifacts}</span>
          {artifactRefs.map((artifact) => (
            <button
              type="button"
              key={`${artifact.kind}:${artifact.ref}`}
              onClick={() => onOpenDetails(artifact)}
              className="inline-flex max-w-full items-center gap-1 break-all rounded-md border border-violet-500/25 bg-violet-50 px-2 py-0.5 text-left text-violet-700 transition-colors hover:bg-violet-100 dark:border-violet-300/40 dark:bg-violet-300/10 dark:text-violet-100 dark:hover:bg-violet-300/20"
              title={artifact.ref}
            >
              <ExternalLink size={11} className="shrink-0" />
              {artifact.label || artifact.kind}: {artifact.ref}
            </button>
          ))}
        </div>
      )}
      {displayMode === 'default' && metaItems.length > 0 && (
        <div className="flex min-w-0 flex-wrap gap-1.5 text-[11px] text-[#64748b] dark:text-[#94a3b8]">
          {metaItems.map((item) => (
            <span key={`${item.label}:${item.value}`} className="max-w-full break-all rounded-md border border-[#cbd5e1] bg-[#f8fafc] px-1.5 py-0.5 dark:border-[#334155] dark:bg-[#111827]">
              <span className="text-[#64748b] dark:text-[#94a3b8]">{item.label}</span>
              <span className="ml-1 text-[#0f172a] dark:text-[#f8fafc]">{item.value}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function JobProcessEventDetailPanel({
  event,
  initialArtifactRef,
  text,
  onClose,
}: {
  event: JobProcessDeveloperView;
  initialArtifactRef?: JobProcessArtifactRef;
  text: ReturnType<typeof labels>;
  onClose: () => void;
}) {
  const artifactRefs = event.artifactRefs ?? [];
  const [selectedArtifactRef, setSelectedArtifactRef] = useState<JobProcessArtifactRef | undefined>(
    initialArtifactRef ?? artifactRefs[0]
  );
  const [artifactState, setArtifactState] = useState<{
    artifact?: JobProcessArtifactContent;
    error?: string;
    status: 'empty' | 'loading' | 'success' | 'error';
  }>({ status: selectedArtifactRef ? 'loading' : 'empty' });

  useEffect(() => {
    setSelectedArtifactRef(initialArtifactRef ?? artifactRefs[0]);
  }, [event.eventId, initialArtifactRef?.ref, artifactRefs[0]?.ref]);

  useEffect(() => {
    if (!selectedArtifactRef) {
      setArtifactState({ status: 'empty' });
      return;
    }

    let cancelled = false;
    setArtifactState({ status: 'loading' });
    api.getJobProcessArtifact(event.jobId, selectedArtifactRef)
      .then((artifact) => {
        if (!cancelled) {
          setArtifactState({ artifact, status: 'success' });
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setArtifactState({ error: getErrorMessage(err, text.artifactFetchFailed), status: 'error' });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [event.jobId, selectedArtifactRef, text.artifactFetchFailed]);

  const metricsItems = recordToDisplayItems(getProcessEventRecordMetadata(event, 'llmMetrics'));
  const traceItems = recordToDisplayItems(getProcessEventRecordMetadata(event, 'traceEnvelope'));
  const artifactMetadataItems = getArtifactMetadataItems(event);
  const projectionText = event.content || event.summary || text.metadataNotProvided;

  return (
    <>
      <Drawer.Header
        title={text.artifactDetails}
        subtitle={event.title}
      >
        <Drawer.HeaderActions>
          <Drawer.CloseButton onClose={onClose} />
        </Drawer.HeaderActions>
      </Drawer.Header>

      <Drawer.Body padded={false} className="min-h-0 bg-[#f8fafc] text-[#0f172a] dark:bg-[#020617] dark:text-[#e2e8f0]">
        <div className="space-y-4 px-4 py-4">
          <DetailSection title={text.timelineProjection} hint={text.projectionHint}>
            <pre className="whitespace-pre-wrap break-all rounded-lg border border-[#d7e0ea] bg-[#ffffff] px-3 py-2.5 font-sans text-xs leading-relaxed text-[#1e293b] dark:border-[#334155] dark:bg-[#0f172a] dark:text-[#e2e8f0]">
              {projectionText}
            </pre>
          </DetailSection>

          <DetailSection title={text.artifacts}>
            {artifactRefs.length > 0 ? (
              <div className="flex min-w-0 flex-wrap gap-1.5">
                {artifactRefs.map((artifact) => (
                  <button
                    type="button"
                    key={`${artifact.kind}:${artifact.ref}`}
                    onClick={() => setSelectedArtifactRef(artifact)}
                    className={cn(
                      'max-w-full break-all rounded-md border px-2 py-1 text-left text-xs font-medium transition-colors',
                      selectedArtifactRef?.ref === artifact.ref
                        ? 'border-violet-500 bg-violet-100 text-violet-800 dark:border-violet-300/50 dark:bg-violet-300/20 dark:text-violet-100'
                        : 'border-[#cbd5e1] bg-white text-[#334155] hover:bg-[#f1f5f9] dark:border-[#334155] dark:bg-[#0f172a] dark:text-[#cbd5e1] dark:hover:bg-[#1e293b]'
                    )}
                    title={artifact.ref}
                  >
                    {artifact.label || artifact.kind}
                  </button>
                ))}
              </div>
            ) : (
              <EmptyDetailValue text={text.noArtifact} />
            )}
          </DetailSection>

          <DetailSection title={text.fullArtifact}>
            {artifactState.status === 'empty' && <EmptyDetailValue text={text.artifactUnavailable} />}
            {artifactState.status === 'loading' && (
              <div className="flex items-center gap-2 rounded-lg border border-[#d7e0ea] bg-[#ffffff] px-3 py-2.5 text-xs text-[#64748b] dark:border-[#334155] dark:bg-[#0f172a] dark:text-[#94a3b8]">
                <Loader2 size={14} className="animate-spin" />
                {text.artifactLoading}
              </div>
            )}
            {artifactState.status === 'error' && (
              <div className="flex items-start gap-2 rounded-lg border border-red-500/25 bg-red-50 p-3 text-xs text-red-700 dark:border-red-400/30 dark:bg-red-400/10 dark:text-red-200">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                <span>{artifactState.error || text.artifactFetchFailed}</span>
              </div>
            )}
            {artifactState.status === 'success' && artifactState.artifact && (
              <div className="space-y-2">
                <div className="flex min-w-0 flex-wrap gap-1.5 text-[11px] text-[#64748b] dark:text-[#94a3b8]">
                  <span className="max-w-full break-all rounded-md border border-[#cbd5e1] bg-white px-1.5 py-0.5 dark:border-[#334155] dark:bg-[#0f172a]">
                    <span>{text.mimeType}</span>
                    <span className="ml-1 text-[#0f172a] dark:text-[#f8fafc]">
                      {artifactState.artifact.mimeType || selectedArtifactRef?.mimeType || text.metadataNotProvided}
                    </span>
                  </span>
                </div>
                <pre className="overflow-x-hidden whitespace-pre-wrap break-all rounded-lg border border-[#d7e0ea] bg-[#ffffff] px-3 py-2.5 font-mono text-[11px] leading-relaxed text-[#1e293b] dark:border-[#334155] dark:bg-[#0f172a] dark:text-[#e2e8f0]">
                  {artifactState.artifact.content}
                </pre>
              </div>
            )}
          </DetailSection>

          <DetailSection title={text.metrics}>
            <DetailKeyValueGrid items={metricsItems} emptyText={text.metadataNotProvided} />
          </DetailSection>

          <DetailSection title={text.trace}>
            <DetailKeyValueGrid items={traceItems} emptyText={text.metadataNotProvided} />
          </DetailSection>

          <DetailSection title={text.artifactMetadata}>
            <DetailKeyValueGrid items={artifactMetadataItems} emptyText={text.metadataNotProvided} />
          </DetailSection>
        </div>
      </Drawer.Body>
    </>
  );
}

function DetailSection({
  children,
  hint,
  title,
}: {
  children: React.ReactNode;
  hint?: string;
  title: string;
}) {
  return (
    <section className="space-y-2">
      <div>
        <h5 className="text-xs font-semibold text-[#0f172a] dark:text-[#f8fafc]">{title}</h5>
        {hint && <p className="mt-0.5 text-[11px] leading-relaxed text-[#64748b] dark:text-[#94a3b8]">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function DetailKeyValueGrid({
  emptyText,
  items,
}: {
  emptyText: string;
  items: Array<{ key: string; value: string }>;
}) {
  if (items.length === 0) {
    return <EmptyDetailValue text={emptyText} />;
  }
  return (
    <div className="grid gap-1.5 text-xs">
      {items.map((item) => (
        <div
          key={item.key}
          className="grid min-w-0 gap-1 rounded-lg border border-[#cbd5e1] bg-white px-2 py-1.5 dark:border-[#334155] dark:bg-[#0f172a] sm:grid-cols-[120px_minmax(0,1fr)]"
        >
          <span className="break-all font-medium text-[#64748b] dark:text-[#94a3b8]">{item.key}</span>
          <span className="break-all text-[#0f172a] dark:text-[#f8fafc]">{item.value}</span>
        </div>
      ))}
    </div>
  );
}

function EmptyDetailValue({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-[#cbd5e1] bg-white px-3 py-2 text-xs text-[#64748b] dark:border-[#334155] dark:bg-[#0f172a] dark:text-[#94a3b8]">
      {text}
    </div>
  );
}

function hasProcessEventDetail(event: JobProcessDeveloperView): boolean {
  return (
    (event.artifactRefs?.length ?? 0) > 0 ||
    isRecord(event.metadata?.llmMetrics) ||
    isRecord(event.metadata?.traceEnvelope) ||
    typeof event.metadata?.artifactRetained === 'boolean' ||
    typeof event.metadata?.artifactRef === 'string'
  );
}

function getProcessEventRecordMetadata(event: JobProcessDeveloperView, key: string): Record<string, unknown> | null {
  const value = event.metadata?.[key];
  return isRecord(value) ? value : null;
}

function recordToDisplayItems(record: Record<string, unknown> | null): Array<{ key: string; value: string }> {
  if (!record) {
    return [];
  }
  return Object.entries(record)
    .map(([key, value]) => ({ key, value: formatDetailValue(value) }))
    .filter((item) => item.value.length > 0);
}

function getArtifactMetadataItems(event: JobProcessDeveloperView): Array<{ key: string; value: string }> {
  const metadata = event.metadata ?? {};
  const keys = [
    'artifactRetained',
    'artifactRef',
    'artifactKind',
    'artifactOriginalChars',
    'artifactRetainedChars',
    'artifactRedactionState',
    'artifactStorage',
    'artifactDataRootScoped',
    'artifactPath',
    'contentOriginalChars',
    'contentRetainedChars',
    'contentTruncated',
    'contentTruncatedChars',
    'contentTruncationLimit',
    'retention',
  ];
  return keys
    .filter((key) => metadata[key] !== undefined)
    .map((key) => ({ key, value: formatDetailValue(metadata[key]) }))
    .filter((item) => item.value.length > 0);
}

function formatDetailValue(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === 'boolean') {
    return String(value);
  }
  if (value === null) {
    return 'null';
  }
  if (Array.isArray(value)) {
    return value.map(formatDetailValue).filter(Boolean).join(', ');
  }
  if (isRecord(value)) {
    try {
      return JSON.stringify(value);
    } catch {
      return '';
    }
  }
  return '';
}

function formatSnapshotContent(value: unknown): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  if (typeof value === 'string') {
    return value.length > 0 ? value : undefined;
  }
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  if (isRecord(value) && typeof value.text === 'string' && value.text.length > 0) {
    return value.text;
  }
  try {
    const formatted = JSON.stringify(value, null, 2);
    return formatted && formatted !== '{}' && formatted !== '[]' ? formatted : undefined;
  } catch {
    return undefined;
  }
}

function getProcessEventIcon(event: JobProcessDeveloperView): React.ReactNode {
  const category = getProcessEventSemanticCategory(event);
  if (category === 'findings') {
    return <FileText size={12} />;
  }
  if (category === 'transition') {
    return <GitBranch size={12} />;
  }
  if (category === 'nudge') {
    return <MessageSquareText size={12} />;
  }
  if (category === 'reflection') {
    return <Bot size={12} />;
  }
  if (isLlmProcessEvent(event)) {
    return <Bot size={12} />;
  }
  if (event.kind === 'tool') {
    return <Wrench size={12} />;
  }
  if (event.kind === 'artifact') {
    return <Package size={12} />;
  }
  if (event.kind === 'checkpoint') {
    return <GitBranch size={12} />;
  }
  if (event.kind === 'error' || event.severity === 'error') {
    return <AlertTriangle size={12} />;
  }
  if (event.kind === 'summary') {
    return <MessageSquareText size={12} />;
  }
  if (event.kind === 'workflow') {
    return <Braces size={12} />;
  }
  return <FileCode2 size={12} />;
}

function isLlmProcessEvent(event: JobProcessDeveloperView): boolean {
  return event.kind === 'llm.input' || event.kind === 'llm.output' || event.kind === 'llm.reflection';
}

function getProcessEventTone(event: JobProcessDeveloperView): { badge: string; dot: string } {
  switch (getProcessEventSemanticCategory(event)) {
    case 'error':
      return {
        badge: 'border-red-500/25 bg-red-50 text-red-700 dark:border-red-400/30 dark:bg-red-400/10 dark:text-red-300',
        dot: 'border-red-500 bg-red-500',
      };
    case 'findings':
      return {
        badge: 'border-amber-500/30 bg-amber-50 text-amber-700 dark:border-amber-300/40 dark:bg-amber-300/10 dark:text-amber-200',
        dot: 'border-amber-400 bg-amber-400',
      };
    case 'transition':
      return {
        badge: 'border-cyan-500/25 bg-cyan-50 text-cyan-700 dark:border-cyan-300/40 dark:bg-cyan-300/10 dark:text-cyan-200',
        dot: 'border-cyan-400 bg-cyan-400',
      };
    case 'nudge':
    case 'reflection':
      return {
        badge: 'border-violet-500/25 bg-violet-50 text-violet-700 dark:border-violet-400/30 dark:bg-violet-400/10 dark:text-violet-300',
        dot: 'border-violet-500 bg-violet-500',
      };
    case 'llm':
      return {
        badge: 'border-blue-500/25 bg-blue-50 text-blue-700 dark:border-blue-400/30 dark:bg-blue-400/10 dark:text-blue-300',
        dot: 'border-blue-500 bg-blue-500',
      };
    case 'tool':
      return {
        badge: 'border-emerald-500/25 bg-emerald-50 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-300',
        dot: 'border-emerald-500 bg-emerald-500',
      };
    case 'artifact':
      return {
        badge: 'border-fuchsia-500/25 bg-fuchsia-50 text-fuchsia-700 dark:border-fuchsia-400/30 dark:bg-fuchsia-400/10 dark:text-fuchsia-200',
        dot: 'border-fuchsia-500 bg-fuchsia-500',
      };
    case 'summary':
      return {
        badge: 'border-emerald-500/25 bg-emerald-50 text-emerald-700 dark:border-emerald-300/30 dark:bg-emerald-300/10 dark:text-emerald-200',
        dot: 'border-emerald-500 bg-emerald-500',
      };
    case 'checkpoint':
    default:
      break;
  }
  return {
    badge: 'border-[#cbd5e1] bg-[#f8fafc] text-[#334155] dark:border-[#334155] dark:bg-[#111827] dark:text-[#e2e8f0]',
    dot: 'border-[#334155] bg-[#94a3b8]',
  };
}

function formatEventTimestamp(value: string | number): string {
  const date = typeof value === 'number' ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function IssueBadge({ issue, text }: { issue: EvidenceIssue; text: ReturnType<typeof labels> }) {
  const label = formatEvidenceIssueLabel(issue, text.lang);
  return (
    <span
      className={cn('inline-flex max-w-full items-center gap-1 rounded-lg border px-2 py-0.5 text-xs font-medium', getEvidenceIssueToneClass(issue))}
      title={label}
    >
      <span className="shrink-0">
        {issue.status === 'record_repair' || issue.status === 'quality_gate_record_repair'
          ? <Loader2 size={14} className="animate-spin" />
          : issue.tone === 'red'
            ? <XCircle size={14} />
            : <StopCircle size={14} />}
      </span>
      <span className="min-w-0 truncate">{label}</span>
    </span>
  );
}

function EvidenceIssueBlock({
  issue,
  text,
}: {
  issue: EvidenceIssue;
  text: ReturnType<typeof labels>;
}) {
  return (
    <div className={cn('space-y-1 rounded-lg border p-2 text-xs', getEvidenceIssueToneClass(issue))}>
      <div className="font-semibold">{text.evidenceIssue}: {formatEvidenceIssueLabel(issue, text.lang)}</div>
      {issue.reason && (
        <div className="break-words text-current/80">
          {text.reason}: {issue.reason}
        </div>
      )}
      {issue.source && (
        <div className="break-words text-current/70">
          {text.evidenceSource}: {issue.source}
        </div>
      )}
    </div>
  );
}

function ProgressBlock({
  progress,
  text,
}: {
  progress: NonNullable<DaemonJobRecord['progress']>;
  text: ReturnType<typeof labels>;
}) {
  const percent = typeof progress.percent === 'number' ? progress.percent : 0;
  const progressChips = buildProgressFreshnessChips(progress, text);
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--fg-secondary)]">
        <span>{text.progress}</span>
        <span>{formatProgress(progress, text)}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-[var(--bg-subtle)]">
        <div
          className="h-full rounded-full bg-[var(--accent)] transition-all duration-300"
          style={{ width: `${Math.max(0, Math.min(100, percent))}%` }}
        />
      </div>
      {progress.activeTaskLabel && (
        <p className="max-w-full break-words text-xs text-[var(--fg-muted)]">
          {text.activeTask}: {progress.activeTaskLabel}
        </p>
      )}
      {progressChips.length > 0 && (
        <div className="flex flex-wrap gap-1.5 text-xs text-[var(--fg-muted)]">
          {progressChips.map((chip) => (
            <span key={chip.key} className="max-w-full break-words rounded-md border border-[var(--border-default)] bg-[var(--bg-subtle)] px-2 py-0.5">
              <span className="text-[var(--fg-secondary)]">{chip.label}</span>
              <span className="ml-1 text-[var(--fg-primary)]">{chip.value}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function EfficiencyBlock({
  efficiency,
  text,
}: {
  efficiency: NonNullable<ReturnType<typeof getJobEfficiency>>;
  text: ReturnType<typeof labels>;
}) {
  const groups = buildEfficiencyGroups(efficiency, text);
  if (groups.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-2">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
        <Activity size={13} />
        {text.efficiency}
      </div>
      <div className="flex flex-wrap gap-2 text-xs text-[var(--fg-muted)]">
        {groups.map((chip) => (
          <span key={chip.key} className="max-w-full break-words rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-2 py-1">
            <span className="text-[var(--fg-secondary)]">{chip.label}</span>
            <span className="ml-1 text-[var(--fg-primary)]">{chip.value}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function DiagnosticsBlock({
  chips,
  text,
}: {
  chips: Array<{ key: string; label: string; value: string }>;
  text: ReturnType<typeof labels>;
}) {
  return (
    <div className="space-y-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-2">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-600 dark:text-amber-300">
        <CircleDashed size={13} />
        {text.diagnostics}
      </div>
      <div className="flex flex-wrap gap-2 text-xs text-[var(--fg-muted)]">
        {chips.map((chip) => (
          <span key={chip.key} className="max-w-full break-words rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-2 py-1">
            <span className="text-[var(--fg-secondary)]">{chip.label}</span>
            <span className="ml-1 text-[var(--fg-primary)]">{chip.value}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function StatusBadge({ status, text }: { status: DaemonJobRecord['status']; text: ReturnType<typeof labels> }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-xs font-medium', STATUS_STYLES[status])}>
      {STATUS_ICONS[status]}
      {statusLabel(status, text)}
    </span>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 break-words">
      <span className="text-[11px] leading-5 text-[var(--fg-muted)]">{label}</span>
      <span className="min-w-0 break-words font-medium leading-5 text-[var(--fg-primary)]">{value}</span>
    </div>
  );
}

function formatProgress(
  progress: NonNullable<DaemonJobRecord['progress']>,
  text: ReturnType<typeof labels>
): string {
  const parts: string[] = [];
  if (typeof progress.total === 'number') {
    const done = (progress.completed || 0) + (progress.failed || 0);
    parts.push(`${done}/${progress.total}`);
  }
  if (typeof progress.percent === 'number') {
    parts.push(`${progress.percent}%`);
  }
  if (typeof progress.totalToolCalls === 'number' && progress.totalToolCalls > 0) {
    parts.push(`${text.toolCalls}: ${progress.totalToolCalls}`);
  }
  return parts.length > 0 ? parts.join(' · ') : progress.status;
}

function buildProgressFreshnessChips(
  progress: NonNullable<DaemonJobRecord['progress']>,
  text: ReturnType<typeof labels>
): Array<{ key: string; label: string; value: string }> {
  const chips: Array<{ key: string; label: string; value: string }> = [];
  if (progress.activeTaskStatus) {
    chips.push({ key: 'activeTaskStatus', label: text.activeTaskStatus, value: progress.activeTaskStatus });
  }
  if (typeof progress.activeTaskEventCount === 'number') {
    chips.push({ key: 'activeTaskEventCount', label: text.events, value: String(progress.activeTaskEventCount) });
  }
  if (typeof progress.activeTaskUpdatedAt === 'number') {
    chips.push({
      key: 'activeTaskUpdatedAt',
      label: text.activeTaskUpdated,
      value: formatRelativeTime(progress.activeTaskUpdatedAt, text),
    });
  }
  return chips;
}

function isDuplicateStatusIssue(issue: EvidenceIssue | null, status: JobBucketStatus): boolean {
  return issue?.status === status;
}

function isCancelledStatusIssue(issue: EvidenceIssue | null, job: DaemonJobRecord): boolean {
  return job.status === 'cancelled' && issue?.status === 'cancelled';
}

function getCurrentDimensionLabel(job: DaemonJobRecord): string {
  return job.progress?.activeTaskLabel || job.progress?.activeTaskId || '--';
}

function describeProcessingState(job: DaemonJobRecord, text: ReturnType<typeof labels>, issue: EvidenceIssue | null): string {
  if (issue) {
    return formatEvidenceIssueLabel(issue, text.lang);
  }
  if (job.status === 'queued') {
    return text.queuedWait;
  }
  if (job.status === 'running') {
    if (job.progress?.activeTaskLabel || job.progress?.activeTaskId) {
      return text.processing;
    }
    return job.progress?.status ? `${text.providerWait} · ${job.progress.status}` : text.providerWait;
  }
  return statusLabel(job.status, text);
}

function buildEfficiencyGroups(
  efficiency: NonNullable<ReturnType<typeof getJobEfficiency>>,
  text: ReturnType<typeof labels>
): Array<{ key: string; label: string; value: string }> {
  const tokenUsage = efficiency.tokenUsage || {};
  const chips = [
    metricChip('toolCalls', text.toolCalls, efficiency.toolCalls),
    metricChip('duplicateToolCalls', text.duplicate, efficiency.duplicateToolCalls),
    cacheChip(efficiency.cacheHits, efficiency.cacheMisses, text),
    tokenChip('inputTokens', text.inputTokens, tokenUsage.input),
    tokenChip('outputTokens', text.outputTokens, tokenUsage.output),
    tokenChip('reasoningTokens', text.reasoningTokens, tokenUsage.reasoning),
    tokenChip('cacheHitTokens', text.cacheHitTokens, tokenUsage.cacheHit),
    metricChip('maxCompactionLevel', text.compactionLevel, efficiency.maxCompactionLevel),
    metricChip('totalCompactedItems', text.compactedItems, efficiency.totalCompactedItems),
    retryChip(efficiency.nudgeCount, efficiency.replanCount, efficiency.emptyRetries, text),
    typeof efficiency.forcedSummary === 'boolean'
      ? { key: 'forcedSummary', label: text.forcedSummary, value: efficiency.forcedSummary ? 'true' : 'false' }
      : null,
    efficiency.cancelReason
      ? { key: 'cancelReason', label: text.cancelReason, value: efficiency.cancelReason }
      : null,
  ];
  return chips.filter((chip): chip is { key: string; label: string; value: string } => chip !== null);
}

function metricChip(key: string, label: string, value: number | undefined) {
  if (typeof value !== 'number') {
    return null;
  }
  return { key, label, value: formatMetricNumber(value) };
}

function tokenChip(key: string, label: string, value: number | undefined) {
  if (typeof value !== 'number') {
    return null;
  }
  return { key, label, value: formatMetricNumber(value) };
}

function cacheChip(cacheHits: number | undefined, cacheMisses: number | undefined, text: ReturnType<typeof labels>) {
  if (typeof cacheHits !== 'number' && typeof cacheMisses !== 'number') {
    return null;
  }
  return {
    key: 'cache',
    label: text.cache,
    value: `${formatMetricNumber(cacheHits || 0)} / ${formatMetricNumber(cacheMisses || 0)}`,
  };
}

function retryChip(
  nudgeCount: number | undefined,
  replanCount: number | undefined,
  emptyRetries: number | undefined,
  text: ReturnType<typeof labels>
) {
  if (typeof nudgeCount !== 'number' && typeof replanCount !== 'number' && typeof emptyRetries !== 'number') {
    return null;
  }
  return {
    key: 'control',
    label: text.control,
    value: `${text.nudge} ${formatMetricNumber(nudgeCount || 0)} · ${text.replan} ${formatMetricNumber(replanCount || 0)} · ${text.emptyRetry} ${formatMetricNumber(emptyRetries || 0)}`,
  };
}

function buildSummaryChips(summary?: Record<string, unknown>): Array<{ key: string; label: string; value: string }> {
  if (!summary) {
    return [];
  }
  const preferredKeys = ['status', 'totalTasks', 'completed', 'failed', 'duration', 'aborted', 'reason'];
  const entries: Array<{ key: string; label: string; value: string }> = [];
  for (const key of preferredKeys) {
    const value = formatSummaryValue(key, summary[key]);
    if (value) {
      entries.push({ key, label: key, value });
    }
  }
  for (const [key, rawValue] of Object.entries(summary)) {
    if (entries.length >= 6 || preferredKeys.includes(key)) {
      continue;
    }
    const value = formatSummaryValue(key, rawValue);
    if (value) {
      entries.push({ key, label: key, value });
    }
  }
  return entries;
}

function buildDiagnosticsChips(
  summary: DaemonJobRecord['summary'],
  text: ReturnType<typeof labels>
): Array<{ key: string; label: string; value: string }> {
  const diagnostics = isRecord(summary?.diagnostics) ? summary.diagnostics : null;
  if (!diagnostics) {
    return [];
  }

  const chips: Array<{ key: string; label: string; value: string }> = [];
  const statuses = isRecord(diagnostics.statuses)
    ? Object.entries(diagnostics.statuses)
        .filter((entry): entry is [string, number] => typeof entry[1] === 'number')
        .map(([status, count]) => `${status}: ${count}`)
    : [];
  if (statuses.length > 0) {
    chips.push({ key: 'statuses', label: text.statuses, value: statuses.slice(0, 4).join(' · ') });
  }
  if (Array.isArray(diagnostics.issues) && diagnostics.issues.length > 0) {
    chips.push({ key: 'issues', label: text.issues, value: String(diagnostics.issues.length) });
  }
  if (Array.isArray(diagnostics.gateFailures) && diagnostics.gateFailures.length > 0) {
    chips.push({ key: 'gateFailures', label: text.gateFailures, value: String(diagnostics.gateFailures.length) });
  }
  if (Array.isArray(diagnostics.timedOutStages) && diagnostics.timedOutStages.length > 0) {
    chips.push({
      key: 'timedOutStages',
      label: text.timedOutStages,
      value: diagnostics.timedOutStages.filter((stage): stage is string => typeof stage === 'string').join(' · '),
    });
  }
  if (diagnostics.forcedSummary === true) {
    chips.push({ key: 'forcedSummary', label: text.forcedSummary, value: 'true' });
  }
  if (typeof diagnostics.cancelReason === 'string' && diagnostics.cancelReason.trim()) {
    chips.push({ key: 'cancelReason', label: text.cancelReason, value: diagnostics.cancelReason.trim() });
  }
  return chips;
}

function getJobEvidenceIssue(job: DaemonJobRecord): EvidenceIssue | null {
  const explicitIssue =
    extractEvidenceIssue(job.summary, 'summary') ||
    extractEvidenceIssue(job.progress, 'progress') ||
    extractEvidenceIssue(job.result, 'result');

  if (explicitIssue) {
    return explicitIssue;
  }
  if (job.status === 'failed') {
    return { status: 'failed', reason: formatEvidenceIssueReason(job.error), source: 'job', tone: 'red' };
  }
  if (job.status === 'cancelled') {
    return { status: 'cancelled', reason: formatEvidenceIssueReason(job.summary?.reason), source: 'job', tone: 'slate' };
  }
  return null;
}

function getJobBucketStatus(job: DaemonJobRecord): JobBucketStatus {
  if (job.status === 'queued' || job.status === 'running') {
    return job.status;
  }
  if (job.status === 'cancelled') {
    return 'cancelled';
  }
  if (job.status === 'failed' || isEvidenceIssueFailure(getJobEvidenceIssue(job))) {
    return 'failed';
  }
  return job.status;
}

function formatMetricNumber(value: number): string {
  if (Math.abs(value) >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}m`;
  }
  if (Math.abs(value) >= 1_000) {
    return `${(value / 1_000).toFixed(1)}k`;
  }
  return String(value);
}

function formatSummaryValue(key: string, value: unknown): string | null {
  if (key === 'duration' && typeof value === 'number') {
    return formatDurationMs(value);
  }
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  return null;
}

function formatDurationMs(value: number): string {
  const seconds = Math.max(0, Math.round(value / 1000));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes > 0 ? `${minutes}m ${rest.toString().padStart(2, '0')}s` : `${rest}s`;
}

function statusLabel(status: DaemonJobRecord['status'], text: ReturnType<typeof labels>): string {
  return {
    queued: text.queued,
    running: text.running,
    completed: text.statusCompleted,
    failed: text.statusFailed,
    cancelled: text.statusCancelled,
  }[status];
}

function formatDate(value?: string): string {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--';
  return date.toLocaleString(undefined, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatRelativeTime(value: string | number | undefined, text: ReturnType<typeof labels>): string {
  if (value === undefined || value === '') return '--';
  const timestamp = typeof value === 'number' ? value : new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return '--';
  const zh = text.title === '后台任务';
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return zh ? `${seconds} 秒前` : `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return zh ? `${minutes} 分钟前` : `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return zh ? `${hours} 小时前` : `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return zh ? `${days} 天前` : `${days}d ago`;
}

function formatJobDuration(job: DaemonJobRecord): string {
  const start = job.startedAt || job.createdAt;
  const end = job.completedAt || (job.status === 'running' ? new Date().toISOString() : job.updatedAt);
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return '--';
  const seconds = Math.max(0, Math.floor((endMs - startMs) / 1000));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes > 0 ? `${minutes}m ${rest.toString().padStart(2, '0')}s` : `${rest}s`;
}

export default JobsView;
