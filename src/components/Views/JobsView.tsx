import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
  Wrench,
  XCircle,
} from 'lucide-react';
import api, { type DaemonJobRecord, type JobProcessDeveloperView } from '../../api';
import { useI18n } from '../../i18n';
import { cn } from '../../lib/utils';
import { notify } from '../../utils/notification';
import { getErrorMessage } from '../../utils/error';
import { getJobEfficiency } from '../../utils/efficiency';
import { useJobProcessEvents } from '../../hooks/useJobProcessEvents';
import {
  type EvidenceIssue,
  extractEvidenceIssue,
  formatEvidenceIssueLabel,
  formatEvidenceIssueReason,
  getEvidenceIssueToneClass,
  isEvidenceIssueFailure,
  isRecord,
} from '../../utils/evidenceStatus';
import Select from '../ui/Select';

type JobKindFilter = 'all' | DaemonJobRecord['kind'];
type JobStatusFilter = 'all' | DaemonJobRecord['status'];
type JobBucketStatus = DaemonJobRecord['status'];

interface JobsViewProps {
  onOpenCandidates?: () => void;
  onOpenReports?: (sessionId?: string) => void;
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
    reports: zh ? '报告' : 'Reports',
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
    lastEvent: zh ? '最后事件' : 'Last event',
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
    processTimeline: zh ? '过程 Timeline' : 'Process timeline',
    showTimeline: zh ? '展开过程' : 'Show timeline',
    hideTimeline: zh ? '收起过程' : 'Hide timeline',
    timelineLoading: zh ? '正在读取过程事件' : 'Loading process events',
    timelineEmpty: zh ? '暂无过程事件；旧任务或后端重启后可能只保留基础进度' : 'No process events yet; old jobs or daemon restarts may only keep basic progress.',
    timelineError: zh ? '过程事件读取失败' : 'Failed to load process events',
    timelineRefresh: zh ? '刷新过程' : 'Refresh process',
    timelineCount: zh ? '事件' : 'events',
    hiddenEvents: zh ? '隐藏事件' : 'hidden',
    retainedEvents: zh ? '保留事件' : 'retained',
    content: zh ? '内容' : 'Content',
    artifacts: zh ? '产物' : 'Artifacts',
    sequence: zh ? '序号' : 'Sequence',
    dimension: zh ? '维度' : 'Dimension',
    target: zh ? '目标' : 'Target',
    severity: zh ? '级别' : 'Severity',
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

const JobsView: React.FC<JobsViewProps> = ({ onOpenCandidates, onOpenReports }) => {
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
  const [expandedJobIds, setExpandedJobIds] = useState<Set<string>>(() => {
    return focusedJobId ? new Set([focusedJobId]) : new Set();
  });

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
    setExpandedJobIds((prev) => new Set(prev).add(focusedJobId));
  }, [focusedJobId]);

  useEffect(() => {
    const hasActive = jobs.some((job) => job.status === 'queued' || job.status === 'running');
    if (!hasActive) return;
    const timer = setInterval(() => loadJobs(true), 2500);
    return () => clearInterval(timer);
  }, [jobs, loadJobs]);

  useEffect(() => {
    const activeJobIds = jobs
      .filter((job) => job.status === 'queued' || job.status === 'running')
      .map((job) => job.id);
    if (activeJobIds.length === 0) {
      return;
    }
    setExpandedJobIds((prev) => {
      const next = new Set(prev);
      for (const jobId of activeJobIds) {
        next.add(jobId);
      }
      return next;
    });
  }, [jobs]);

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

  const toggleTimeline = (jobId: string) => {
    setExpandedJobIds((prev) => {
      const next = new Set(prev);
      if (next.has(jobId)) {
        next.delete(jobId);
      } else {
        next.add(jobId);
      }
      return next;
    });
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
                expanded={expandedJobIds.has(job.id)}
                onCancel={() => cancelJob(job)}
                onCopy={() => copyJobId(job.id)}
                onToggleTimeline={() => toggleTimeline(job.id)}
                onOpenCandidates={onOpenCandidates}
                onOpenReports={onOpenReports}
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
  expanded,
  onCancel,
  onCopy,
  onToggleTimeline,
  onOpenCandidates,
  onOpenReports,
}: {
  job: DaemonJobRecord;
  text: ReturnType<typeof labels>;
  busy: boolean;
  expanded: boolean;
  onCancel: () => void;
  onCopy: () => void;
  onToggleTimeline: () => void;
  onOpenCandidates?: () => void;
  onOpenReports?: (sessionId?: string) => void;
}) {
  const canCancel = job.status === 'queued' || job.status === 'running';
  const summaryChips = buildSummaryChips(job.summary);
  const diagnosticsChips = buildDiagnosticsChips(job.summary, text);
  const efficiency = getJobEfficiency(job.summary);
  const issue = getJobEvidenceIssue(job);
  const visualStatus = getJobBucketStatus(job);
  const badgeIssue = isDuplicateStatusIssue(issue, visualStatus) ? null : issue;
  const blockIssue = isCancelledStatusIssue(issue, job) ? null : issue;
  const jobErrorText = formatEvidenceIssueReason(job.error);
  const evidenceSessionId = job.progress?.sessionId || job.bootstrapSessionId;
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

        <div className="grid gap-x-4 gap-y-2 border-y border-[var(--border-muted)] py-2 text-xs text-[var(--fg-secondary)] sm:grid-cols-2 xl:grid-cols-4">
          <Meta label={text.source} value={job.source} />
          <Meta label={text.created} value={formatDate(job.createdAt)} />
          <Meta label={text.updated} value={formatDate(job.updatedAt)} />
          <Meta label={text.duration} value={formatJobDuration(job)} />
        </div>

        <RuntimeStateBlock job={job} text={text} issue={issue} />

        {job.progress && <ProgressBlock progress={job.progress} text={text} />}

        {blockIssue && <EvidenceIssueBlock issue={blockIssue} text={text} />}

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

        {expanded && <JobProcessTimeline job={job} text={text} />}
      </div>

      <div className="flex min-w-0 flex-wrap items-center justify-end gap-2 lg:self-start">
        <button
          type="button"
          onClick={onToggleTimeline}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] px-2.5 text-xs font-medium text-[var(--fg-secondary)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--fg-primary)]"
        >
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          {expanded ? text.hideTimeline : text.showTimeline}
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
        {onOpenReports && evidenceSessionId && (
          <button
            type="button"
            onClick={() => onOpenReports(evidenceSessionId)}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] px-2.5 text-xs font-medium text-[var(--fg-secondary)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--fg-primary)]"
          >
            <FileText size={14} />
            {text.reports}
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

function JobProcessTimeline({
  job,
  text,
}: {
  job: DaemonJobRecord;
  text: ReturnType<typeof labels>;
}) {
  const isActive = job.status === 'queued' || job.status === 'running';
  const {
    events,
    loading,
    refreshing,
    error,
    hiddenCount,
    retainedCount,
    endpointCapability,
    refresh,
  } = useJobProcessEvents(job.id, { enabled: true, active: isActive, limit: 120 });

  const visibleEvents = useMemo(() => events, [events]);

  return (
    <div className="mt-3 max-w-full overflow-x-hidden rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-muted)] px-3 py-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--fg-primary)]">
            <Activity size={13} className={isActive ? 'text-blue-500' : 'text-[var(--fg-muted)]'} />
            {text.processTimeline}
          </span>
          <span className="rounded-md border border-[var(--border-default)] bg-[var(--bg-subtle)] px-1.5 py-0.5 text-[11px] text-[var(--fg-muted)]">
            {visibleEvents.length} {text.timelineCount}
          </span>
          {retainedCount > 0 && (
            <span className="rounded-md border border-[var(--border-default)] bg-[var(--bg-subtle)] px-1.5 py-0.5 text-[11px] text-[var(--fg-muted)]">
              {text.retainedEvents}: {retainedCount}
            </span>
          )}
          {hiddenCount > 0 && (
            <span className="rounded-md border border-amber-500/20 bg-amber-500/10 px-1.5 py-0.5 text-[11px] text-amber-600 dark:text-amber-300">
              {text.hiddenEvents}: {hiddenCount}
            </span>
          )}
          {endpointCapability?.available === false && (
            <span className="rounded-md border border-amber-500/20 bg-amber-500/10 px-1.5 py-0.5 text-[11px] text-amber-600 dark:text-amber-300">
              events unavailable
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => refresh()}
          className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs text-[var(--fg-muted)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--fg-primary)]"
          title={text.timelineRefresh}
        >
          <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
          {text.timelineRefresh}
        </button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 px-3 py-4 text-xs text-[var(--fg-muted)]">
          <Loader2 size={14} className="animate-spin" />
          {text.timelineLoading}
        </div>
      ) : error ? (
        <div className="flex items-start gap-2 px-3 py-4 text-xs text-red-600">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>{text.timelineError}: {error}</span>
        </div>
      ) : visibleEvents.length === 0 ? (
        <div className="flex items-start gap-2 px-3 py-4 text-xs text-[var(--fg-muted)]">
          <CircleDashed size={14} className="mt-0.5 shrink-0" />
          <span>{text.timelineEmpty}</span>
        </div>
      ) : (
        <div className="space-y-0 px-3 py-2">
          {visibleEvents.map((event) => (
            <ProcessEventItem key={event.eventId || `${event.jobId}:${event.sequence}:${event.kind}`} event={event} text={text} />
          ))}
        </div>
      )}
    </div>
  );
}

function ProcessEventItem({
  event,
  text,
}: {
  event: JobProcessDeveloperView;
  text: ReturnType<typeof labels>;
}) {
  const tone = getProcessEventTone(event);
  const icon = getProcessEventIcon(event);
  const metaItems = [
    { label: text.sequence, value: `#${event.sequence}` },
    { label: 'kind', value: event.kind },
    { label: 'phase', value: event.phase },
    { label: text.dimension, value: event.dimensionId },
    { label: text.target, value: event.targetName },
    { label: text.severity, value: event.severity },
  ].filter((item): item is { label: string; value: string } =>
    typeof item.value === 'string' && item.value.length > 0
  );

  return (
    <div className="relative grid gap-3 border-l border-[var(--border-default)] py-3 pl-4 text-xs first:pt-1 last:pb-1">
      <div className={cn('absolute -left-[7px] top-3 flex h-3.5 w-3.5 items-center justify-center rounded-full border bg-[var(--bg-surface)]', tone.dot)} />
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className={cn('inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-medium', tone.badge)}>
          {icon}
          {event.kind}
        </span>
        <span className="min-w-0 font-semibold text-[var(--fg-primary)]">{event.title}</span>
        {event.timestamp && (
          <span className="text-[var(--fg-muted)]">{formatEventTimestamp(event.timestamp)}</span>
        )}
      </div>
      {event.summary && (
        <p className="whitespace-pre-wrap break-words leading-relaxed text-[var(--fg-secondary)]">{event.summary}</p>
      )}
      {event.content && (
        <div className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-subtle)] p-3">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--fg-muted)]">{text.content}</div>
          <pre className="whitespace-pre-wrap break-words font-sans leading-relaxed text-[var(--fg-primary)]">{event.content}</pre>
        </div>
      )}
      {event.artifactRefs && event.artifactRefs.length > 0 && (
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="text-[var(--fg-muted)]">{text.artifacts}</span>
          {event.artifactRefs.map((artifact) => (
            <span
              key={`${artifact.kind}:${artifact.ref}`}
              className="max-w-full break-words rounded-md border border-violet-500/20 bg-violet-500/10 px-2 py-0.5 text-violet-600 dark:text-violet-300"
              title={artifact.ref}
            >
              {artifact.label || artifact.kind}: {artifact.ref}
            </span>
          ))}
        </div>
      )}
      {metaItems.length > 0 && (
        <div className="flex min-w-0 flex-wrap gap-1.5 text-[11px] text-[var(--fg-muted)]">
          {metaItems.map((item) => (
            <span key={`${item.label}:${item.value}`} className="max-w-full break-words rounded-md border border-[var(--border-default)] bg-[var(--bg-subtle)] px-1.5 py-0.5">
              <span className="text-[var(--fg-secondary)]">{item.label}</span>
              <span className="ml-1">{item.value}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function getProcessEventIcon(event: JobProcessDeveloperView): React.ReactNode {
  if (event.kind === 'llm.input' || event.kind === 'llm.output' || event.kind === 'llm.reflection') {
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

function getProcessEventTone(event: JobProcessDeveloperView): { badge: string; dot: string } {
  if (event.kind === 'error' || event.severity === 'error') {
    return {
      badge: 'border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-300',
      dot: 'border-red-500 bg-red-500',
    };
  }
  if (event.kind === 'artifact') {
    return {
      badge: 'border-violet-500/20 bg-violet-500/10 text-violet-600 dark:text-violet-300',
      dot: 'border-violet-500 bg-violet-500',
    };
  }
  if (event.kind.startsWith('llm.')) {
    return {
      badge: 'border-blue-500/20 bg-blue-500/10 text-blue-600 dark:text-blue-300',
      dot: 'border-blue-500 bg-blue-500',
    };
  }
  if (event.kind === 'tool') {
    return {
      badge: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300',
      dot: 'border-emerald-500 bg-emerald-500',
    };
  }
  return {
    badge: 'border-[var(--border-default)] bg-[var(--bg-subtle)] text-[var(--fg-secondary)]',
    dot: 'border-[var(--border-default)] bg-[var(--fg-muted)]',
  };
}

function formatEventTimestamp(value: string | number): string {
  const date = typeof value === 'number' ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function RuntimeStateBlock({
  job,
  text,
  issue,
}: {
  job: DaemonJobRecord;
  text: ReturnType<typeof labels>;
  issue: EvidenceIssue | null;
}) {
  const activeTask = job.progress?.activeTaskLabel || job.progress?.activeTaskId || '--';
  const items = [
    { label: text.lastEvent, value: formatRelativeTime(resolveJobActivityAt(job), text) },
    { label: text.processingState, value: describeProcessingState(job, text, issue) },
    { label: text.currentDimension, value: activeTask },
  ];

  return (
    <div className="grid gap-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-subtle)]/40 p-2 text-xs text-[var(--fg-secondary)] md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.8fr)_minmax(0,0.8fr)]">
      {items.map((item) => (
        <Meta key={item.label} label={item.label} value={item.value} />
      ))}
    </div>
  );
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
    <div className="min-w-0 break-words">
      <span className="block text-[11px] leading-4 text-[var(--fg-muted)]">{label}</span>
      <span className="mt-0.5 block break-words font-medium leading-5 text-[var(--fg-primary)]">{value}</span>
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

function describeProcessingState(job: DaemonJobRecord, text: ReturnType<typeof labels>, issue: EvidenceIssue | null): string {
  if (issue) {
    return issue.reason
      ? `${formatEvidenceIssueLabel(issue, text.lang)} · ${issue.reason}`
      : formatEvidenceIssueLabel(issue, text.lang);
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

function resolveJobActivityAt(job: DaemonJobRecord): string | number | undefined {
  return job.progress?.activeTaskUpdatedAt ?? job.progress?.updatedAt ?? job.updatedAt;
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
