import type { AgentDiagnostics } from '../api';

type UnknownRecord = Record<string, unknown>;

export type EvidenceIssueTone = 'blue' | 'amber' | 'red' | 'slate' | 'violet';

export interface EvidenceIssue {
  reason?: string;
  source?: string;
  status: string;
  tone: EvidenceIssueTone;
}

const ISSUE_TONES: Record<string, EvidenceIssueTone> = {
  record_repair: 'violet',
  quality_gate_record_repair: 'violet',
  record_repair_incomplete: 'amber',
  needs_evidence_repair: 'amber',
  degraded_no_findings: 'amber',
  timeout: 'red',
  blocked: 'red',
  aborted: 'slate',
  cancelled: 'slate',
  failed: 'red',
  error: 'red',
  l4_compaction_failed_budget_exhausted: 'red',
};

const ISSUE_LABELS: Record<string, { en: string; zh: string }> = {
  record_repair: { en: 'Evidence repair', zh: '证据修复中' },
  quality_gate_record_repair: { en: 'Evidence repair', zh: '证据修复中' },
  record_repair_incomplete: { en: 'Record repair incomplete', zh: '证据修复未完成' },
  needs_evidence_repair: { en: 'Needs evidence repair', zh: '需要证据修复' },
  degraded_no_findings: { en: 'Degraded: no findings', zh: '证据不足降级' },
  timeout: { en: 'Timeout', zh: '超时' },
  blocked: { en: 'Blocked', zh: '阻塞' },
  aborted: { en: 'Aborted', zh: '已中止' },
  cancelled: { en: 'Cancelled', zh: '已取消' },
  failed: { en: 'Failed', zh: '失败' },
  error: { en: 'Error', zh: '错误' },
  l4_compaction_failed_budget_exhausted: { en: 'L4 compaction stopped', zh: 'L4 压缩已止损' },
};

export function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function extractEvidenceIssue(value: unknown, source?: string): EvidenceIssue | null {
  if (!isRecord(value)) {
    return null;
  }

  const diagnostics = isRecord(value.diagnostics) ? value.diagnostics as AgentDiagnostics : null;
  const efficiency = isRecord(value.efficiency)
    ? value.efficiency
    : isRecord(diagnostics?.efficiency)
      ? diagnostics.efficiency
      : null;
  const qualityGate = isRecord(value.qualityGate) ? value.qualityGate : null;
  const status =
    normalizeIssueStatus(value.status) ||
    normalizeIssueStatus(value.action) ||
    normalizeIssueStatus(qualityGate?.action) ||
    normalizeIssueStatus(firstGateAction(diagnostics)) ||
    normalizeIssueStatusFromFlags(value) ||
    normalizeIssueStatusFromDiagnostics(diagnostics, efficiency);

  if (!status) {
    return null;
  }

  return {
    reason: firstReason(value.reason, value.error, firstGateReason(diagnostics), efficiency?.cancelReason),
    source,
    status,
    tone: ISSUE_TONES[status] || 'amber',
  };
}

export function formatEvidenceIssueLabel(issue: EvidenceIssue | string, lang = 'zh'): string {
  const status = typeof issue === 'string' ? issue : issue.status;
  const labels = ISSUE_LABELS[status];
  if (!labels) {
    return status.replaceAll('_', ' ');
  }
  return lang === 'zh' ? labels.zh : labels.en;
}

export function formatEvidenceIssueReason(value: unknown): string | undefined {
  return formatReasonValue(value, new Set());
}

export function getEvidenceIssueToneClass(issue: EvidenceIssue): string {
  return {
    amber: 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-300',
    blue: 'border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-300',
    red: 'border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-300',
    slate: 'border-[var(--border-default)] bg-[var(--bg-subtle)] text-[var(--fg-muted)]',
    violet: 'border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-300',
  }[issue.tone];
}

export function isEvidenceIssueFailure(issue: EvidenceIssue | null): boolean {
  if (!issue) {
    return false;
  }
  return issue.status !== 'record_repair' && issue.status !== 'quality_gate_record_repair';
}

function normalizeIssueStatus(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const status = value.trim();
  if (!status) {
    return null;
  }
  return ISSUE_TONES[status] ? status : null;
}

function normalizeIssueStatusFromFlags(value: UnknownRecord): string | null {
  if (value.aborted === true) {
    return 'aborted';
  }
  if (value.cancelled === true) {
    return 'cancelled';
  }
  if (value.degraded === true) {
    return 'degraded_no_findings';
  }
  return null;
}

function normalizeIssueStatusFromDiagnostics(diagnostics: AgentDiagnostics | null, efficiency: UnknownRecord | null): string | null {
  if (efficiency?.cancelReason === 'l4_compaction_failed_budget_exhausted') {
    return 'l4_compaction_failed_budget_exhausted';
  }
  if (!diagnostics) {
    return efficiency?.cancelReason === 'stage_timeout' ? 'timeout' : null;
  }
  if (Array.isArray(diagnostics.timedOutStages) && diagnostics.timedOutStages.length > 0) {
    return 'timeout';
  }
  if (efficiency?.cancelReason === 'stage_timeout') {
    return 'timeout';
  }
  return diagnostics.degraded === true ? 'degraded_no_findings' : null;
}

function firstGateAction(diagnostics: AgentDiagnostics | null): unknown {
  const gateFailures = Array.isArray(diagnostics?.gateFailures) ? diagnostics.gateFailures : [];
  return gateFailures.find((failure) => normalizeIssueStatus(failure.action))?.action;
}

function firstGateReason(diagnostics: AgentDiagnostics | null): unknown {
  const gateFailures = Array.isArray(diagnostics?.gateFailures) ? diagnostics.gateFailures : [];
  return gateFailures.find((failure) => formatEvidenceIssueReason(failure.reason))?.reason;
}

function firstReason(...values: unknown[]): string | undefined {
  for (const value of values) {
    const reason = formatEvidenceIssueReason(value);
    if (reason) {
      return reason;
    }
  }
  return undefined;
}

function formatReasonValue(value: unknown, seen: Set<unknown>): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  if (typeof value === 'string') {
    return value.trim() || undefined;
  }
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  if (value instanceof Error) {
    return value.message.trim() || value.name;
  }
  if (Array.isArray(value)) {
    const parts = value
      .map((item) => formatReasonValue(item, seen))
      .filter((item): item is string => Boolean(item));
    return parts.length > 0 ? parts.join(' · ') : undefined;
  }
  if (!isRecord(value)) {
    return undefined;
  }
  if (seen.has(value)) {
    return undefined;
  }
  seen.add(value);

  const message = firstReasonField(value, seen, ['message', 'reason', 'error', 'cause', 'detail', 'details']);
  const code = firstReasonField(value, seen, ['code', 'status', 'cancelReason']);
  if (message && code && !message.includes(code)) {
    return `${code} · ${message}`;
  }
  if (message || code) {
    return message || code;
  }

  try {
    const json = JSON.stringify(value);
    return json && json !== '{}' ? json : undefined;
  } catch {
    return undefined;
  }
}

function firstReasonField(record: UnknownRecord, seen: Set<unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const reason = formatReasonValue(record[key], seen);
    if (reason) {
      return reason;
    }
  }
  return undefined;
}
