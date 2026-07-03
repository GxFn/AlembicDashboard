/**
 * guard — guard+rules+violations+audit 路由族与归一化（W7-f 自 api.ts 拆出）。
 */

import {
  asRuntimeRecord,
  dashboardPublicRecord,
  firstNumber,
  firstString,
  firstStringArray,
  http,
  providerDataRecord,
  recordArray,
  stringArray,
  stringOrUndefined,
} from './client';


export interface GuardRuleProviderRecord {
  message: string;
  severity: string;
  pattern: string;
  languages: string[];
  note?: string;
  dimension?: 'file' | 'target' | 'project';
  category?: 'safety' | 'correctness' | 'performance' | 'style' | '';
  fixSuggestion?: string;
  rationale?: string;
  fixSuggestions?: string[];
  sourceRecipe?: string;
  [key: string]: unknown;
}

export interface GuardViolationProviderRecord {
  ruleId: string;
  message: string;
  severity: string;
  line: number;
  snippet: string;
  dimension?: 'file' | 'target' | 'project';
  filePath?: string;
  [key: string]: unknown;
}

export interface GuardRunProviderRecord {
  id: string;
  filePath: string;
  triggeredAt: string;
  violations: GuardViolationProviderRecord[];
  [key: string]: unknown;
}

function normalizeGuardDimension(value: unknown): 'file' | 'target' | 'project' | undefined {
  return value === 'file' || value === 'target' || value === 'project' ? value : undefined;
}

function normalizeGuardCategory(
  value: unknown,
): 'safety' | 'correctness' | 'performance' | 'style' | '' | undefined {
  return value === 'safety' ||
    value === 'correctness' ||
    value === 'performance' ||
    value === 'style' ||
    value === ''
    ? value
    : undefined;
}

export function normalizeGuardRuleRecord(value: unknown): GuardRuleProviderRecord | null {
  const record = asRuntimeRecord(value);
  const id = firstString(record?.id);
  const pattern = firstString(record?.pattern, id);
  if (!record || !pattern) {
    return null;
  }
  const publicRecord = dashboardPublicRecord(record) ?? {};
  return {
    ...publicRecord,
    message: firstString(record.message) ?? pattern,
    severity: firstString(record.severity) ?? 'warning',
    pattern,
    languages: firstStringArray(record.languages),
    note: stringOrUndefined(record.note),
    dimension: normalizeGuardDimension(record.dimension),
    category: normalizeGuardCategory(record.category),
    fixSuggestion: stringOrUndefined(record.fixSuggestion),
    rationale: stringOrUndefined(record.rationale),
    fixSuggestions: stringArray(record.fixSuggestions),
    sourceRecipe: stringOrUndefined(record.sourceRecipe),
  };
}

export function normalizeGuardViolationRecord(value: unknown): GuardViolationProviderRecord | null {
  const record = asRuntimeRecord(value);
  const ruleId = firstString(record?.ruleId, record?.id);
  if (!record || !ruleId) {
    return null;
  }
  const publicRecord = dashboardPublicRecord(record) ?? {};
  return {
    ...publicRecord,
    ruleId,
    message: firstString(record.message) ?? ruleId,
    severity: firstString(record.severity) ?? 'warning',
    line: firstNumber(record.line) ?? 0,
    snippet: firstString(record.snippet) ?? '',
    dimension: normalizeGuardDimension(record.dimension),
    filePath: stringOrUndefined(record.filePath),
  };
}

export function normalizeGuardRunRecord(value: unknown): GuardRunProviderRecord | null {
  const record = asRuntimeRecord(value);
  const id = firstString(record?.id, record?.runId);
  if (!record || !id) {
    return null;
  }
  const publicRecord = dashboardPublicRecord(record) ?? {};
  return {
    ...publicRecord,
    id,
    filePath: firstString(record.filePath) ?? '',
    triggeredAt: firstString(record.triggeredAt, record.createdAt) ?? '',
    violations: recordArray(record.violations)
      .map(normalizeGuardViolationRecord)
      .filter((violation): violation is GuardViolationProviderRecord => violation !== null),
  };
}

export function normalizeGuardReportResponse(value: unknown): Record<string, unknown> {
  return dashboardPublicRecord(providerDataRecord(value)) ?? {};
}

export const guardApi = {
  // ── Guard ───────────────────────────────────────────

  async getGuardRules(): Promise<{ rules: Record<string, GuardRuleProviderRecord>; projectLanguages: string[] }> {
    const res = await http.get('/rules?limit=100');
    const data = res.data?.data || {};
    const items = recordArray(data.data).length > 0 ? recordArray(data.data) : recordArray(data.items);
    const rules: Record<string, GuardRuleProviderRecord> = {};
    for (const item of items) {
      const id = firstString(item.id);
      const rule = normalizeGuardRuleRecord(item);
      if (id && rule) {
        rules[id] = rule;
      }
    }
    return { rules, projectLanguages: firstStringArray(data.projectLanguages) };
  },

  async getGuardViolations(): Promise<{ runs: GuardRunProviderRecord[] }> {
    const res = await http.get('/violations');
    const data = res.data?.data || {};
    const items = recordArray(data.data).length > 0 ? recordArray(data.data) : recordArray(data.items);
    return {
      runs: items
        .map(normalizeGuardRunRecord)
        .filter((run): run is GuardRunProviderRecord => run !== null),
    };
  },

  async clearViolations(): Promise<void> {
    await http.post('/violations/clear', { all: true });
  },

  // ── Audit Log ─────────────────

  /** 查询审计日志 */
  async getAuditLogs(filters?: {
    actor?: string;
    action?: string;
    result?: string;
    startDate?: number;
    endDate?: number;
    offset?: number;
    limit?: number;
  }): Promise<{
    logs: {
      timestamp: string;
      actor: string;
      action: string;
      result: string;
      target: string;
      details?: string;
    }[];
    total: number;
  }> {
    const res = await http.get('/audit', { params: filters });
    return res.data?.data ?? { logs: [], total: 0 };
  },

  // ── Guard Report ──────────────

  /** 获取合规性报告 */
  async getGuardReport(options?: {
    minScore?: number;
    maxErrors?: number;
    maxFiles?: number;
  }): Promise<unknown> {
    const res = await http.get('/guard/report', { params: options });
    return normalizeGuardReportResponse(res.data);
  },
};
