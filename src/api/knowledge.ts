/**
 * knowledge — /knowledge 路由族：V3 知识条目直通 + Recipe/候选映射
 * （W7-f 自 api.ts 拆出；toRecipe/candidateGroupKey 供聚合族 fetchData 消费）。
 */

import { http } from './client';
import { cloneRecipeWireSnapshot } from './recipeReviewer';
import type {
  RecipeIndexGenerationDryRun,
  RecipeIndexGenerationStatus,
  RetrievalReadinessReport,
} from './recipeReviewer';
import type {
  KnowledgeContent,
  KnowledgeEntry,
  KnowledgeKind,
  KnowledgeLifecycle,
  KnowledgePaginatedResponse,
  KnowledgeQuality,
  KnowledgeStats,
  Recipe,
  RecipeStats,
} from '../types';


// ═══════════════════════════════════════════════════════
//  Type Mappers
// ═══════════════════════════════════════════════════════

/** API 返回的 raw 知识条目（可能含别名字段如 name/statistics/status） */
type RawKnowledgeRecord = Partial<KnowledgeEntry> & {
  name?: string;
  statistics?: Record<string, number>;
  status?: string;
  version?: string;
};

/** V3 KnowledgeEntry → 前端 Recipe 视图类型 */
export function toRecipe(r: RawKnowledgeRecord): Recipe {
  const quality = r.quality || {} as KnowledgeQuality;
  const statistics = r.stats || r.statistics || {} as KnowledgeStats;
  const contentObj = r.content || {} as KnowledgeContent;

  const trigger =
    r.trigger ||
    '@' + (r.title || '').replace(/[\s_-]+(.)?/g, (_: string, c: string) => (c ? c.toUpperCase() : ''));

  const stats: RecipeStats = {
    authority: statistics.authority || Math.round((quality.overall || 0) * 5) || 0,
    authorityScore: statistics.authority || Math.round((quality.overall || 0) * 5) || 0,
    guardUsageCount: statistics.applications || 0,
    humanUsageCount: statistics.adoptions || 0,
    aiUsageCount: 0,
    lastUsedAt: (r.updatedAt ?? null) as string | null,
  };

  return {
    id: r.id,
    name: (r.title || r.name || r.id || '') + '.md',
    content: contentObj,
    category: r.category || '',
    language: r.language || '',
    description: r.description || '',
    status: r.lifecycle || r.status || 'pending',
    // Wire kind is string; the Recipe view keeps the closed union and treats unknown kinds as absent.
    kind: r.kind === 'rule' || r.kind === 'pattern' || r.kind === 'fact' ? r.kind : undefined,
    knowledgeType: r.knowledgeType || undefined,
    // v2Content removed — content is now the V3 structured object
    relations: (r.relations ?? null) as Recipe['relations'],
    constraints: (r.constraints ?? null) as Recipe['constraints'],
    tags: r.tags || [],
    stats,
    trigger,
    source: r.source || '',
    createdBy: r.createdBy || '',
    sourceFile: r.sourceFile || '',
    moduleName: r.moduleName || '',
    usageGuide: contentObj.markdown || r.doClause || '',
    reasoning: (r.reasoning ?? null) as Recipe['reasoning'],
    quality: (r.quality ?? null) as Recipe['quality'],
    scope: r.scope || '',
    complexity: r.complexity || '',
    difficulty: r.difficulty || r.complexity || '',
    version: r.version || '',
    doClause: r.doClause || '',
    dontClause: r.dontClause || '',
    whenClause: r.whenClause || '',
    coreCode: r.coreCode || contentObj.pattern || '',
    topicHint: r.topicHint || '',
    aiInsight: r.aiInsight || null,
    lifecycleHistory: r.lifecycleHistory,
    headers: r.headers || [],
    createdAt: r.createdAt || null,
    updatedAt: r.updatedAt || null,
    retrievalProfile: r.retrievalProfile
      ? cloneRecipeWireSnapshot(r.retrievalProfile)
      : null,
    wireSnapshot: cloneRecipeWireSnapshot(r as Record<string, unknown>),
  };
}

const CANDIDATE_DIMENSION_ALIASES: Record<string, string> = {
  architecture: 'architecture',
  'architecture & design': 'architecture',
  'architecture patterns': 'architecture',
};

const CANDIDATE_DIMENSION_KEYS = new Set([
  'architecture',
  'coding-standards',
  'design-patterns',
  'error-resilience',
  'concurrency-async',
  'data-event-flow',
  'networking-api',
  'ui-interaction',
  'testing-quality',
  'security-auth',
  'performance-optimization',
  'observability-logging',
  'agent-guidelines',
  'swift-objc-idiom',
  'ts-js-module',
  'python-structure',
  'jvm-annotation',
  'go-module',
  'rust-ownership',
  'csharp-dotnet',
  'react-patterns',
  'vue-patterns',
  'spring-patterns',
  'swiftui-patterns',
  'django-fastapi',
  'bootstrap',
]);

function normalizeCandidateDimensionKey(raw?: string | null): string {
  if (!raw) return '';
  const trimmed = String(raw).trim();
  if (!trimmed) return '';
  const lower = trimmed.toLowerCase();
  const dimensionKey = CANDIDATE_DIMENSION_ALIASES[lower] || lower;
  return CANDIDATE_DIMENSION_KEYS.has(dimensionKey) ? dimensionKey : '';
}

export function candidateGroupKey(entry: KnowledgeEntry): string {
  const dimensionKey =
    normalizeCandidateDimensionKey(entry.dimensionId) ||
    normalizeCandidateDimensionKey(entry.topicHint) ||
    normalizeCandidateDimensionKey(entry.category);
  return dimensionKey || entry.category || entry.language || '_pending';
}

// ═══════════════════════════════════════════════════════
//  Helpers
// ═══════════════════════════════════════════════════════

/** 从 idOrName 解析 knowledge ID：如果看起来像 UUID/hash 则直接用，否则按标题搜索 */
async function resolveKnowledgeId(idOrName: string): Promise<string> {
  const cleaned = idOrName.replace(/\.md$/i, '');
  // 如果已经是 ID 格式（UUID 或 hash-like），直接返回
  if (/^[a-f0-9-]{8,}$/i.test(cleaned)) return cleaned;
  // 搜索 knowledge 条目
  const res = await http.get(`/knowledge?limit=1000`);
  const items = res.data?.data?.data || res.data?.data || [];
  const found = items.find((r: { title?: string; name?: string; id?: string }) => {
    const title = r.title || r.name || '';
    return title === cleaned || title + '.md' === idOrName;
  });
  if (found?.id) return found.id;
  throw new Error(`Knowledge entry not found: ${idOrName}`);
}

export const knowledgeApi = {
  // ── Recipes ─────────────────────────────────────────

  async deleteRecipe(idOrName: string): Promise<void> {
    // 优先用 ID（V3），否则按名称搜索
    const knowledgeId = await resolveKnowledgeId(idOrName);
    await http.delete(`/knowledge/${knowledgeId}`);
  },

  async setRecipeAuthority(idOrName: string, authority: number): Promise<void> {
    const knowledgeId = await resolveKnowledgeId(idOrName);
    await http.patch(`/knowledge/${knowledgeId}/quality`, {
      codeCompleteness: authority,
      projectAdaptation: authority,
      documentationClarity: authority,
    });
  },

  async updateRecipeRelations(idOrName: string, relations: Record<string, unknown[]>): Promise<void> {
    const knowledgeId = await resolveKnowledgeId(idOrName);
    await http.patch(`/knowledge/${knowledgeId}`, { relations });
  },

  // searchRecipes — removed, use search() instead

  // ── Candidates (via V3 Knowledge API) ──────────────────────────────────────

  async deleteCandidate(candidateId: string): Promise<void> {
    await http.delete(`/knowledge/${candidateId}`);
  },

  async deleteAllCandidatesInTarget(targetName: string): Promise<{ deleted: number }> {
    // V3: list all entries with this category then delete individually
    const res = await http.get(`/knowledge?category=${encodeURIComponent(targetName)}&limit=1000`);
    const items = res.data?.data?.data || [];
    let deleted = 0;
    for (const item of items) {
      try {
        await http.delete(`/knowledge/${item.id}`);
        deleted++;
      } catch { /* skip */ }
    }
    return { deleted };
  },

  // ═══════════════════════════════════════════════════════
  //  V3 Knowledge API — 统一知识条目（直通 wire format，无映射）
  // ═══════════════════════════════════════════════════════

  /** 获取知识条目列表（V3 统一 API） */
  async knowledgeList(params: {
    page?: number;
    limit?: number;
    lifecycle?: KnowledgeLifecycle;
    kind?: KnowledgeKind;
    category?: string;
    language?: string;
    keyword?: string;
    tag?: string;
    source?: string;
  } = {}): Promise<KnowledgePaginatedResponse> {
    const query = new URLSearchParams();
    if (params.page) query.set('page', String(params.page));
    if (params.limit) query.set('limit', String(params.limit));
    if (params.lifecycle) query.set('lifecycle', params.lifecycle);
    if (params.kind) query.set('kind', params.kind);
    if (params.category) query.set('category', params.category);
    if (params.language) query.set('language', params.language);
    if (params.keyword) query.set('keyword', params.keyword);
    if (params.tag) query.set('tag', params.tag);
    if (params.source) query.set('source', params.source);
    const qs = query.toString();
    const res = await http.get(`/knowledge${qs ? `?${qs}` : ''}`);
    return res.data?.data || { data: [], pagination: { page: 1, pageSize: 20, total: 0 } };
  },

  /** 读取 existing candidate/Recipe 的完整 wire，供 reviewer 无损编辑。 */
  async knowledgeGet(id: string): Promise<KnowledgeEntry> {
    const res = await http.get(`/knowledge/${encodeURIComponent(id)}`);
    return res.data?.data;
  },

  /** 更新知识条目 */
  async knowledgeUpdate(id: string, data: Record<string, unknown>): Promise<KnowledgeEntry> {
    const res = await http.patch(`/knowledge/${encodeURIComponent(id)}`, data);
    return res.data?.data;
  },

  /** 读取与 Core publish 同源的确定性结构 readiness；只读且不会触发索引维护。 */
  async getKnowledgeRetrievalReadiness(id: string): Promise<RetrievalReadinessReport> {
    const res = await http.get(`/knowledge/${encodeURIComponent(id)}/retrieval-readiness`);
    return res.data?.data;
  },

  /** 读取当前 Recipe vector generation 指针和 manifest；只用于 reviewer 观测。 */
  async getRecipeIndexGeneration(): Promise<RecipeIndexGenerationStatus> {
    const res = await http.get('/commands/recipe-index-generation');
    return res.data?.data;
  },

  /** 生成零写 migration 报告；Dashboard 不提供 rebuild/rollback 控件。 */
  async previewRecipeIndexGeneration(): Promise<RecipeIndexGenerationDryRun> {
    const res = await http.post('/commands/recipe-index-generation/dry-run');
    return res.data?.data;
  },

  /** 仅在 UI 已完成显式确认后调用合法 lifecycle publish endpoint。 */
  async knowledgePublish(id: string): Promise<KnowledgeEntry> {
    const res = await http.patch(`/knowledge/${encodeURIComponent(id)}/publish`, { confirmed: true });
    return res.data?.data;
  },

  /** 删除知识条目 */
  async knowledgeDelete(id: string): Promise<void> {
    await http.delete(`/knowledge/${id}`, { params: { confirmed: true } });
  },

  /** 知识条目生命周期操作 */
  async knowledgeLifecycle(id: string, action: string, reason?: string): Promise<KnowledgeEntry> {
    const res = await http.patch(`/knowledge/${id}/${action}`, reason ? { reason } : {});
    return res.data?.data;
  },

  /** 批量发布 */
  async knowledgeBatchPublish(ids: string[]): Promise<{ published: KnowledgeEntry[]; failed: Array<{ id: string; error: string }>; successCount: number; failureCount: number }> {
    const res = await http.post('/knowledge/batch-publish', { ids, confirmed: true });
    return res.data?.data || { published: [], failed: [], successCount: 0, failureCount: 0 };
  },

  /** 批量删除 */
  async knowledgeBatchDelete(ids: string[]): Promise<{ deletedCount: number; failureCount: number; failed: Array<{ id: string; error: string }> }> {
    const res = await http.post('/knowledge/batch-delete', { ids, confirmed: true });
    return res.data?.data || { deletedCount: 0, failureCount: 0, failed: [] };
  },

  /** 批量废弃 */
  async knowledgeBatchDeprecate(ids: string[], reason?: string): Promise<{ deprecated: KnowledgeEntry[]; failed: Array<{ id: string; error: string }>; successCount: number; failureCount: number }> {
    const res = await http.post('/knowledge/batch-deprecate', { ids, reason, confirmed: true });
    return res.data?.data || { deprecated: [], failed: [], successCount: 0, failureCount: 0 };
  },

  /** 获取六态生命周期统计 + 各过渡态条目 */
  async getKnowledgeLifecycle(): Promise<{
    counts: Record<string, number>;
    entries: Record<string, unknown[]>;
  }> {
    const res = await http.get('/knowledge/lifecycle');
    return res.data?.data;
  },
};
