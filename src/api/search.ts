/**
 * search — /search 路由族：统一搜索入口与结果归一化（W7-f 自 api.ts 拆出）。
 */

import {
  asRuntimeRecord,
  booleanOrNull,
  dashboardPublicRecord,
  firstNumber,
  firstString,
  http,
  providerDataRecord,
  recordArray,
  stripPrivateProviderFields,
} from './client';
import type { KnowledgeContent } from '../types';


/** 搜索结果条目 */
export interface SearchResultItem {
  title: string;
  content: KnowledgeContent;
  score: number;
  qualityScore?: number;
  usageCount?: number;
  authorityScore?: number;
  matchType?: string;
  [key: string]: unknown;
}

/** 搜索 API 返回的原始结果条目 */
interface RawSearchResult {
  name?: string;
  content?: unknown;
  similarity?: number;
  qualityScore?: number;
  usageCount?: number;
  authority?: number;
  matchType?: string;
  [key: string]: unknown;
}

function parseSearchContent(raw: unknown): KnowledgeContent {
  if (!raw) {
    return {} as KnowledgeContent;
  }
  if (typeof raw === 'object') {
    return raw as KnowledgeContent;
  }
  try {
    return JSON.parse(String(raw)) as KnowledgeContent;
  } catch {
    // Plain-text payload: fill the full wire shape so the markdown survives as content.
    return { pattern: '', markdown: String(raw), rationale: '', steps: [], codeChanges: [], verification: null };
  }
}

export function normalizeSearchResponse(value: unknown): {
  items: SearchResultItem[];
  total: number;
  mode?: string;
  ranked?: boolean;
} {
  const data = providerDataRecord(value);
  const searchMeta = asRuntimeRecord(data.searchMeta);
  const items: SearchResultItem[] = recordArray(data.items).map((record) => {
    const publicRecord = dashboardPublicRecord(record) ?? {};
    return {
      ...publicRecord,
      title: firstString(record.title, record.name) ?? '',
      content: stripPrivateProviderFields(parseSearchContent(record.content)) as KnowledgeContent,
      score: firstNumber(record.score, record.similarity) ?? 0,
      qualityScore: firstNumber(record.qualityScore) ?? undefined,
      usageCount: firstNumber(record.usageCount) ?? undefined,
      authorityScore: firstNumber(record.authorityScore, record.authority) ?? undefined,
      matchType: firstString(record.matchType) ?? undefined,
    };
  });
  return {
    items,
    total: firstNumber(data.totalResults, data.total) ?? items.length,
    mode: firstString(data.mode, searchMeta?.actualMode) ?? undefined,
    ranked: booleanOrNull(data.ranked) ?? undefined,
  };
}

export const searchApi = {
  // ── Search (统一入口) ─────────────────────────────────

  /**
   * 统一搜索 — 合并 keyword/weighted/semantic/auto/context-aware 全场景
   *
   * - 无 context → GET /search (keyword/weighted/semantic/auto)
   * - 有 context → GET /search?mode=weighted&language=…（FieldWeighted + Ranking；
   *   context-aware 专用端点已退役，统一 /search 承接；sessionHistory 上下文不再支持）
   *
   * 返回的 items 中 content 已从 JSON 字符串解析为对象。
   */
  async search(
    query: string,
    options: {
      mode?: 'keyword' | 'weighted' | 'bm25' | 'semantic' | 'auto';
      type?: string;
      limit?: number;
      signal?: AbortSignal;
      context?: { language?: string; sessionHistory?: unknown[]; [key: string]: unknown };
    } = {},
  ): Promise<{ items: SearchResultItem[]; total: number; mode?: string; ranked?: boolean }> {
    const { mode = 'auto', type, limit = 20, signal, context } = options;

    // ── 有 context: 走统一 /search（weighted 模式 + language；context-aware 端点已退役）──
    if (context) {
      const ctxParams = new URLSearchParams({ q: query, mode: 'weighted', limit: String(limit) });
      if (type) ctxParams.set('type', type);
      if (context.language) ctxParams.set('language', context.language);
      const res = await http.get(`/search?${ctxParams}`, { signal }).catch(() => null);
      const normalized = res ? normalizeSearchResponse(res.data) : normalizeSearchResponse({});
      return { ...normalized, mode: 'weighted', ranked: true };
    }

    // ── 无 context: GET /search ──
    const params = new URLSearchParams({ q: query, mode, limit: String(limit) });
    if (type) params.set('type', type);
    const res = await http.get(`/search?${params}`, { signal });
    return normalizeSearchResponse(res.data);
  },
};
