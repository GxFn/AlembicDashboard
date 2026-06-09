import type {
  KnowledgeConstraints,
  KnowledgeContent,
  KnowledgeEntry,
  KnowledgeQuality,
  KnowledgeReasoning,
  KnowledgeRelations,
  KnowledgeStats,
  ScanResultItem,
} from './types';

type PartialObject<T> = {
  [K in keyof T]?: T[K];
};

export interface KnowledgeCreatePayload {
  title: string;
  description: string;
  trigger: string;
  language: string;
  category: string;
  kind: KnowledgeEntry['kind'];
  knowledgeType: string;
  complexity: string;
  scope?: string;
  difficulty: string;
  tags: string[];
  source: string;
  sourceFile: string;
  moduleName: string;
  doClause: string;
  dontClause: string;
  whenClause: string;
  topicHint: string;
  coreCode: string;
  content: KnowledgeContent;
  reasoning: PartialObject<KnowledgeReasoning>;
  quality: PartialObject<KnowledgeQuality>;
  constraints: KnowledgeConstraints | Record<string, never>;
  relations: KnowledgeRelations | Record<string, never>;
  stats: PartialObject<KnowledgeStats>;
  headers: string[];
  headerPaths: string[];
  includeHeaders: boolean;
}

function stringArrayOrEmpty(value: string[] | undefined): string[] {
  return Array.isArray(value) ? value : [];
}

export function buildKnowledgeCreatePayload(
  extracted: ScanResultItem,
  triggers: string[],
): KnowledgeCreatePayload {
  return {
    title: extracted.title || 'Untitled',
    description: extracted.description || '',
    trigger: triggers.join(', ') || '',
    language: extracted.language || '',
    category: extracted.category || 'Utility',
    kind: extracted.kind || 'pattern',
    knowledgeType: extracted.knowledgeType || 'code-pattern',
    complexity: extracted.complexity || 'intermediate',
    scope: extracted.scope || undefined,
    difficulty: extracted.difficulty || '',
    tags: stringArrayOrEmpty(extracted.tags),
    source: extracted.source || 'ai-scan',
    sourceFile: extracted.sourceFile || '',
    moduleName: extracted.moduleName || '',
    doClause: extracted.doClause || '',
    dontClause: extracted.dontClause || '',
    whenClause: extracted.whenClause || '',
    topicHint: extracted.topicHint || '',
    coreCode: extracted.coreCode || '',
    content: extracted.content || {},
    reasoning: extracted.reasoning || {},
    quality: extracted.quality || {},
    constraints: extracted.constraints || {},
    relations: extracted.relations || {},
    stats: extracted.stats || {},
    headers: stringArrayOrEmpty(extracted.headers),
    headerPaths: stringArrayOrEmpty(extracted.headerPaths),
    includeHeaders: extracted.includeHeaders === true,
  };
}
