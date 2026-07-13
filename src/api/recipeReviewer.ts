import type { RecipeRetrievalProfileWire } from '../generated/api-types';
import type { Recipe, RecipeContent, ScanResultItem } from '../types';

export interface RetrievalReadinessIssue {
  code: string;
  field?: string;
  message: string;
  provenanceRefs?: string[];
}

export interface RetrievalReadinessReport {
  ready: boolean;
  schemaVersion?: string;
  profileHash?: string | null;
  documentSetHash?: string | null;
  violations: RetrievalReadinessIssue[];
  warnings: Array<{ code: string; message: string }>;
}

export interface RecipeIndexGenerationStatus {
  active: Record<string, unknown> | null;
  manifest: Record<string, unknown> | null;
}

export type RecipeIndexGenerationDryRun = Record<string, unknown> & {
  status?: string;
  writePerformed?: boolean;
};

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Reviewer 编辑必须从后端完整快照开始。JSON clone 会保留 API 合同允许的未知扩展，
 * 同时阻止表单状态直接修改 fetchData 缓存中的原对象。
 */
export function cloneRecipeWireSnapshot<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function recipeContent(value: unknown): RecipeContent {
  return cloneRecipeWireSnapshot(isRecord(value) ? value : {}) as RecipeContent;
}

function retrievalProfile(value: unknown): RecipeRetrievalProfileWire | null {
  return isRecord(value)
    ? (cloneRecipeWireSnapshot(value) as unknown as RecipeRetrievalProfileWire)
    : null;
}

/** 从真实 Knowledge wire 构造编辑模型，保留一份不参与 UI 展示的完整原始快照。 */
export function recipeEditorModelFromWire(entryValue: JsonRecord): Recipe {
  const entry = cloneRecipeWireSnapshot(entryValue);
  return {
    id: stringValue(entry.id) || undefined,
    name: `${stringValue(entry.title) || stringValue(entry.id)}.md`,
    description: stringValue(entry.description),
    status: stringValue(entry.lifecycle) || 'pending',
    trigger: stringValue(entry.trigger),
    language: stringValue(entry.language),
    category: stringValue(entry.category),
    kind:
      entry.kind === 'rule' || entry.kind === 'pattern' || entry.kind === 'fact'
        ? entry.kind
        : undefined,
    tags: stringArray(entry.tags),
    content: recipeContent(entry.content),
    retrievalProfile: retrievalProfile(entry.retrievalProfile),
    wireSnapshot: entry,
  };
}

/**
 * PATCH 只发送后端允许编辑的字段；完整 content/profile 来自原快照克隆，因而未展示字段
 * 与未来扩展不会被局部表单覆盖。未知根字段由服务端保留，不回传到 PATCH。
 */
export function buildKnowledgeUpdatePayload(recipe: Recipe): JsonRecord & {
  content: JsonRecord;
  retrievalProfile: RecipeRetrievalProfileWire | null;
} {
  const original = isRecord(recipe.wireSnapshot) ? recipe.wireSnapshot : {};
  const originalContent = isRecord(original.content) ? cloneRecipeWireSnapshot(original.content) : {};
  const editedContent = isRecord(recipe.content) ? cloneRecipeWireSnapshot(recipe.content) : {};
  const editedProfile = recipe.retrievalProfile === null
    ? null
    : retrievalProfile(recipe.retrievalProfile ?? original.retrievalProfile);

  return {
    title: recipe.name.replace(/\.md$/i, ''),
    description: recipe.description ?? '',
    content: { ...originalContent, ...editedContent },
    tags: recipe.tags ?? [],
    kind: recipe.kind ?? null,
    language: recipe.language ?? '',
    category: recipe.category ?? '',
    retrievalProfile: editedProfile,
  };
}

/** 模块扫描必须返回已由四类生产入口持久化的 ID；Dashboard 不再创建第五个候选。 */
export function resolveExistingRecipeId(item: Partial<ScanResultItem>): string {
  const id = typeof item.id === 'string' && item.id.trim()
    ? item.id.trim()
    : typeof item.candidateId === 'string' && item.candidateId.trim()
      ? item.candidateId.trim()
      : '';
  if (!id) {
    throw new Error('Module scan result is missing an existing Recipe/candidate ID.');
  }
  return id;
}

/** 只有 Core 的结构 readiness 决定发布；provider/vector/generation warning 只展示。 */
export function canPublishRecipe(report: Pick<RetrievalReadinessReport, 'ready'> | null): boolean {
  return report?.ready === true;
}
