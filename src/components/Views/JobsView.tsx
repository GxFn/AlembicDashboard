import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  CheckCircle2,
  CircleDashed,
  Clock3,
  Copy,
  ExternalLink,
  FileText,
  Loader2,
  Play,
  RefreshCw,
  RotateCw,
  StopCircle,
  XCircle,
} from 'lucide-react';
import api, { type DaemonJobRecord } from '../../api';
import { useI18n } from '../../i18n';
import { cn } from '../../lib/utils';
import { notify } from '../../utils/notification';
import { getErrorMessage } from '../../utils/error';
import { getJobEfficiency } from '../../utils/efficiency';
import {
  type EvidenceIssue,
  extractEvidenceIssue,
  formatEvidenceIssueLabel,
  getEvidenceIssueToneClass,
  isEvidenceIssueFailure,
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
    toolCalls: zh ? '工具调用' : 'Tool calls',
    summary: zh ? '摘要' : 'Summary',
    bootstrap: 'bootstrap',
    rescan: 'rescan',
    queued: zh ? '排队' : 'Queued',
    running: zh ? '运行中' : 'Running',
    statusCompleted: zh ? '完成' : 'Completed',
    statusFailed: zh ? '失败' : 'Failed',
    statusCancelled: zh ? '取消' : 'Cancelled',
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
  const [busyJobId, setBusyJobId] = useState<string | null>(null);
  const [startingKind, setStartingKind] = useState<DaemonJobRecord['kind'] | null>(null);

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
    <div className="h-full flex flex-col">
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

      <div className="overflow-hidden rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-sm">
        {loading ? (
          <div className="flex h-48 items-center justify-center text-[var(--fg-muted)]">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            {text.refresh}
          </div>
        ) : filteredJobs.length === 0 ? (
          <div className="flex h-48 flex-col items-center justify-center gap-2 text-[var(--fg-muted)]">
            <CircleDashed size={24} />
            <p className="text-sm">{jobs.length === 0 ? text.noJobs : text.noFilteredJobs}</p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--border-muted)]">
            {filteredJobs.map((job) => (
              <JobRow
                key={job.id}
                job={job}
                text={text}
                busy={busyJobId === job.id}
                onCancel={() => cancelJob(job)}
                onCopy={() => copyJobId(job.id)}
                onOpenCandidates={onOpenCandidates}
                onOpenReports={onOpenReports}
              />
            ))}
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

function JobRow({
  job,
  text,
  busy,
  onCancel,
  onCopy,
  onOpenCandidates,
  onOpenReports,
}: {
  job: DaemonJobRecord;
  text: ReturnType<typeof labels>;
  busy: boolean;
  onCancel: () => void;
  onCopy: () => void;
  onOpenCandidates?: () => void;
  onOpenReports?: (sessionId?: string) => void;
}) {
  const canCancel = job.status === 'queued' || job.status === 'running';
  const summaryChips = buildSummaryChips(job.summary);
  const efficiency = getJobEfficiency(job.summary);
  const issue = getJobEvidenceIssue(job);
  const visualStatus = getJobBucketStatus(job);
  const evidenceSessionId = job.progress?.sessionId || job.bootstrapSessionId;
  const canOpenCandidates =
    onOpenCandidates &&
    !isEvidenceIssueFailure(issue) &&
    (job.status === 'completed' || job.status === 'running');
  return (
    <div className="grid gap-4 p-4 transition-colors hover:bg-[var(--bg-subtle)] lg:grid-cols-[minmax(0,1fr)_auto]">
      <div className="min-w-0 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={visualStatus} text={text} />
          {issue && <IssueBadge issue={issue} text={text} />}
          <span className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-subtle)] px-2 py-0.5 text-xs font-medium text-[var(--fg-secondary)]">
            {job.kind}
          </span>
          <span className="truncate font-mono text-xs text-[var(--fg-muted)]">{job.id}</span>
          <button
            type="button"
            onClick={onCopy}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--fg-muted)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--fg-primary)]"
            aria-label="Copy job id"
          >
            <Copy size={13} />
          </button>
        </div>

        <div className="grid gap-2 text-xs text-[var(--fg-secondary)] md:grid-cols-2 xl:grid-cols-4">
          <Meta label={text.source} value={job.source} />
          <Meta label={text.created} value={formatDate(job.createdAt)} />
          <Meta label={text.updated} value={formatDate(job.updatedAt)} />
          <Meta label={text.duration} value={formatJobDuration(job)} />
        </div>

        <RuntimeStateBlock job={job} text={text} issue={issue} />

        {job.progress && <ProgressBlock progress={job.progress} text={text} />}

        {issue && <EvidenceIssueBlock issue={issue} text={text} />}

        {efficiency && <EfficiencyBlock efficiency={efficiency} text={text} />}

        <div className="flex flex-wrap gap-2 text-xs text-[var(--fg-muted)]">
          {Object.entries(job.request || {}).slice(0, 4).map(([key, value]) => (
            <span key={key} className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-subtle)] px-2 py-1">
              {key}: {String(value)}
            </span>
          ))}
          {job.bootstrapSessionId && (
            <span className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-subtle)] px-2 py-1">
              session: {job.bootstrapSessionId}
            </span>
          )}
        </div>

        {summaryChips.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--fg-muted)]">
            <span className="text-[var(--fg-secondary)]">{text.summary}</span>
            {summaryChips.map((chip) => (
              <span key={chip.key} className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-subtle)] px-2 py-1">
                {chip.label}: {chip.value}
              </span>
            ))}
          </div>
        )}

        {job.error?.message && (
          <p className="max-w-4xl truncate text-xs text-red-600">
            {text.error}: {job.error.message}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 lg:self-start">
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
    { label: text.lastEvent, value: formatRelativeTime(job.updatedAt, text) },
    { label: text.processingState, value: describeProcessingState(job, text, issue) },
    { label: text.currentDimension, value: activeTask },
  ];

  return (
    <div className="grid gap-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-subtle)]/50 p-2 text-xs text-[var(--fg-secondary)] md:grid-cols-3">
      {items.map((item) => (
        <Meta key={item.label} label={item.label} value={item.value} />
      ))}
    </div>
  );
}

function IssueBadge({ issue, text }: { issue: EvidenceIssue; text: ReturnType<typeof labels> }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-xs font-medium', getEvidenceIssueToneClass(issue))}>
      {issue.status === 'record_repair' || issue.status === 'quality_gate_record_repair'
        ? <Loader2 size={14} className="animate-spin" />
        : issue.tone === 'red'
          ? <XCircle size={14} />
          : <StopCircle size={14} />}
      {formatEvidenceIssueLabel(issue, text.lang)}
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
        <div className="text-current/80">
          {text.reason}: {issue.reason}
        </div>
      )}
      {issue.source && (
        <div className="text-current/70">
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
        <p className="truncate text-xs text-[var(--fg-muted)]">
          {text.activeTask}: {progress.activeTaskLabel}
        </p>
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
          <span key={chip.key} className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-2 py-1">
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
    <div className="min-w-0">
      <span className="text-[var(--fg-muted)]">{label}</span>
      <span className="ml-1 truncate text-[var(--fg-primary)]">{value}</span>
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

function getJobEvidenceIssue(job: DaemonJobRecord): EvidenceIssue | null {
  const explicitIssue =
    extractEvidenceIssue(job.summary, 'summary') ||
    extractEvidenceIssue(job.progress, 'progress') ||
    extractEvidenceIssue(job.result, 'result');

  if (explicitIssue) {
    return explicitIssue;
  }
  if (job.status === 'failed') {
    return { status: 'failed', reason: job.error?.message, source: 'job', tone: 'red' };
  }
  if (job.status === 'cancelled') {
    return { status: 'cancelled', reason: job.summary?.reason, source: 'job', tone: 'slate' };
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

function formatRelativeTime(value: string | undefined, text: ReturnType<typeof labels>): string {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--';
  const zh = text.title === '后台任务';
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
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
