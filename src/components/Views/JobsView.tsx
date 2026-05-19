import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  CheckCircle2,
  CircleDashed,
  Clock3,
  Copy,
  ExternalLink,
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
import Select from '../ui/Select';

type JobKindFilter = 'all' | DaemonJobRecord['kind'];
type JobStatusFilter = 'all' | DaemonJobRecord['status'];

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

const JobsView: React.FC<JobsViewProps> = ({ onOpenCandidates }) => {
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
      const next = await api.listJobs({ limit: 100 });
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
      const statusOk = statusFilter === 'all' || job.status === statusFilter;
      return kindOk && statusOk;
    });
  }, [jobs, kindFilter, statusFilter]);

  const counts = useMemo(() => {
    return {
      active: jobs.filter((job) => job.status === 'queued' || job.status === 'running').length,
      completed: jobs.filter((job) => job.status === 'completed').length,
      failed: jobs.filter((job) => job.status === 'failed').length,
      cancelled: jobs.filter((job) => job.status === 'cancelled').length,
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
}: {
  job: DaemonJobRecord;
  text: ReturnType<typeof labels>;
  busy: boolean;
  onCancel: () => void;
  onCopy: () => void;
  onOpenCandidates?: () => void;
}) {
  const canCancel = job.status === 'queued' || job.status === 'running';
  const summaryChips = buildSummaryChips(job.summary);
  return (
    <div className="grid gap-4 p-4 transition-colors hover:bg-[var(--bg-subtle)] lg:grid-cols-[minmax(0,1fr)_auto]">
      <div className="min-w-0 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={job.status} text={text} />
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

        {job.progress && <ProgressBlock progress={job.progress} text={text} />}

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

      <div className="flex items-center justify-end gap-2">
        {onOpenCandidates && (job.status === 'completed' || job.status === 'running') && (
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

function buildSummaryChips(summary?: Record<string, unknown>): Array<{ key: string; label: string; value: string }> {
  if (!summary) {
    return [];
  }
  const preferredKeys = ['totalTasks', 'completed', 'failed', 'duration', 'aborted', 'reason'];
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
