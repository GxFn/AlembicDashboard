import {
  asRuntimeRecord,
  firstNumber,
  firstString,
  http,
  providerDataRecord,
  recordArray,
  stringRecord,
} from './client';

export type PanoramaModuleRecipeCountSource = 'coverage-ledger-direct' | 'degraded-project-total';
export type PanoramaRecipeCountMode = 'per-module-coverage-ledger' | 'project-total-only';
export type PanoramaRecipeCountReason =
  | 'direct-module-id-aligned'
  | 'direct-module-id-mismatch'
  | 'no-scoped-modules';

export interface PanoramaLayerModule {
  fileCount: number;
  moduleId: string;
  modulePath?: string;
  name: string;
  projectRoot?: string;
  recipeCount: number | null;
  recipeCountSource: PanoramaModuleRecipeCountSource;
  role: string;
}

export interface PanoramaArchitectureLayer {
  level: number;
  modules: PanoramaLayerModule[];
  name: string;
}

export interface PanoramaHealthRadarDimension {
  cellCount: number;
  coveredCellCount: number;
  coveredCandidateCount: number;
  description: string;
  id: string;
  level: 'strong' | 'adequate' | 'weak' | 'missing';
  missingCellCount: number;
  name: string;
  partialCellCount: number;
  recipeCount: number;
  score: number;
  status: 'strong' | 'adequate' | 'weak' | 'missing';
  topRecipes: string[];
  totalCandidateCount: number;
  weakCellCount: number;
}

export interface PanoramaHealthRadar {
  basis: string;
  coveredDimensions: number;
  dimensionCoverage: number;
  dimensions: PanoramaHealthRadarDimension[];
  overallScore: number;
  totalDimensions: number;
  totalRecipes: number;
}

export interface PanoramaScopeBoundary {
  controlRoot: string | null;
  excludedCoverageCellCount: number;
  excludedModuleCount: number;
  memberRoots: string[];
  mode: 'members-only' | 'project-root';
  projectRoot: string;
  projectScopeId: string | null;
}

export interface PanoramaRecipeCount {
  mode: PanoramaRecipeCountMode;
  projectRecipeCount: {
    source: 'knowledge-entries';
    totalRecipes: number;
  };
  reason: PanoramaRecipeCountReason;
}

export interface PanoramaOverview {
  computedAt: number;
  cycleCount: number;
  dimensionCoverage: number;
  gapCount: number;
  healthRadar: PanoramaHealthRadar;
  layerCount: number;
  layers: PanoramaArchitectureLayer[];
  moduleCount: number;
  overallCoverage: number;
  projectRoot: string;
  projectScope: PanoramaScopeBoundary;
  recipeCount: PanoramaRecipeCount;
  stale: boolean;
  totalFiles: number;
  totalRecipes: number;
}

export interface PanoramaHealth {
  avgCoupling: number;
  cycleCount: number;
  gapCount: number;
  healthRadar: PanoramaHealthRadar;
  healthScore: number;
  highPriorityGaps: number;
  moduleCount: number;
}

export interface KnowledgeGap {
  affectedModuleIds: string[];
  affectedRoles: string[];
  dimension: string;
  dimensionName: string;
  missingCellCount: number;
  priority: 'high' | 'medium' | 'low';
  recipeCount: number;
  status: 'missing' | 'weak';
  suggestedTopics: string[];
  valueScore: number;
  weakCellCount: number;
}

export interface KnowledgeGraphEdge {
  fromId: string;
  fromType: string;
  id: number;
  metadata: Record<string, unknown>;
  relation: string;
  toId: string;
  toType: string;
  weight: number;
}

export interface KnowledgeGraph {
  edges: KnowledgeGraphEdge[];
  nodeCategories: Record<string, string>;
  nodeLabels: Record<string, string>;
  nodeTypes: Record<string, string>;
}

export interface KnowledgeGraphStats {
  byRelation: Record<string, number>;
  nodeTypes: unknown[];
  totalEdges: number;
}

export interface DiscoverRelationsResponse {
  error?: string;
  message?: string;
  startedAt?: string;
  status: string;
}

export interface DiscoverRelationsStatus {
  batchErrors?: number;
  discovered?: number;
  elapsed?: number;
  error?: string;
  message?: string;
  startedAt?: string;
  status: string;
  totalPairs?: number;
}

function num(value: unknown, fallback = 0): number {
  return firstNumber(value) ?? fallback;
}

function str(value: unknown, fallback = ''): string {
  return firstString(value) ?? fallback;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function reqParams(refresh: boolean) {
  return refresh ? { params: { refresh: 'true' } } : undefined;
}

function normalizeRadarDimension(value: unknown): PanoramaHealthRadarDimension {
  const record = asRuntimeRecord(value) ?? {};
  const status = str(record.status, 'missing') as PanoramaHealthRadarDimension['status'];
  const level = str(record.level, status) as PanoramaHealthRadarDimension['level'];
  return {
    cellCount: num(record.cellCount),
    coveredCellCount: num(record.coveredCellCount),
    coveredCandidateCount: num(record.coveredCandidateCount),
    description: str(record.description),
    id: str(record.id),
    level,
    missingCellCount: num(record.missingCellCount),
    name: str(record.name, str(record.id)),
    partialCellCount: num(record.partialCellCount),
    recipeCount: num(record.recipeCount),
    score: num(record.score),
    status,
    topRecipes: stringArray(record.topRecipes),
    totalCandidateCount: num(record.totalCandidateCount),
    weakCellCount: num(record.weakCellCount),
  };
}

function normalizeHealthRadar(value: unknown): PanoramaHealthRadar {
  const record = asRuntimeRecord(value) ?? {};
  const dimensions = recordArray(record.dimensions).map(normalizeRadarDimension);
  return {
    basis: str(record.basis),
    coveredDimensions: num(record.coveredDimensions),
    dimensionCoverage: num(record.dimensionCoverage),
    dimensions,
    overallScore: num(record.overallScore),
    totalDimensions: num(record.totalDimensions, dimensions.length),
    totalRecipes: num(record.totalRecipes),
  };
}

function normalizeLayerModule(value: unknown): PanoramaLayerModule {
  const record = asRuntimeRecord(value) ?? {};
  const recipeCount = firstNumber(record.recipeCount);
  return {
    fileCount: num(record.fileCount),
    moduleId: str(record.moduleId, str(record.name)),
    modulePath: firstString(record.modulePath) ?? undefined,
    name: str(record.name, str(record.moduleId)),
    projectRoot: firstString(record.projectRoot) ?? undefined,
    recipeCount,
    recipeCountSource: str(record.recipeCountSource, 'degraded-project-total') as PanoramaModuleRecipeCountSource,
    role: str(record.role, 'module'),
  };
}

function normalizeLayer(value: unknown): PanoramaArchitectureLayer {
  const record = asRuntimeRecord(value) ?? {};
  const modules = recordArray(record.modules).map(normalizeLayerModule);
  return {
    level: num(record.level),
    modules,
    name: str(record.name),
  };
}

function normalizeScope(value: unknown, projectRoot: string): PanoramaScopeBoundary {
  const record = asRuntimeRecord(value) ?? {};
  return {
    controlRoot: firstString(record.controlRoot) ?? null,
    excludedCoverageCellCount: num(record.excludedCoverageCellCount),
    excludedModuleCount: num(record.excludedModuleCount),
    memberRoots: stringArray(record.memberRoots),
    mode: str(record.mode, 'project-root') as PanoramaScopeBoundary['mode'],
    projectRoot: str(record.projectRoot, projectRoot),
    projectScopeId: firstString(record.projectScopeId) ?? null,
  };
}

function normalizeRecipeCount(value: unknown): PanoramaRecipeCount {
  const record = asRuntimeRecord(value) ?? {};
  const projectRecipeCount = asRuntimeRecord(record.projectRecipeCount) ?? {};
  return {
    mode: str(record.mode, 'project-total-only') as PanoramaRecipeCountMode,
    projectRecipeCount: {
      source: 'knowledge-entries',
      totalRecipes: num(projectRecipeCount.totalRecipes),
    },
    reason: str(record.reason, 'direct-module-id-mismatch') as PanoramaRecipeCountReason,
  };
}

function normalizeOverview(value: unknown): PanoramaOverview {
  const data = providerDataRecord(value);
  const projectRoot = str(data.projectRoot);
  const layers = recordArray(data.layers).map(normalizeLayer);
  const healthRadar = normalizeHealthRadar(data.healthRadar);
  return {
    computedAt: num(data.computedAt),
    cycleCount: num(data.cycleCount),
    dimensionCoverage: num(data.dimensionCoverage, healthRadar.dimensionCoverage),
    gapCount: num(data.gapCount),
    healthRadar,
    layerCount: num(data.layerCount, layers.length),
    layers,
    moduleCount: num(data.moduleCount),
    overallCoverage: num(data.overallCoverage),
    projectRoot,
    projectScope: normalizeScope(data.projectScope, projectRoot),
    recipeCount: normalizeRecipeCount(data.recipeCount),
    stale: data.stale === true,
    totalFiles: num(data.totalFiles),
    totalRecipes: num(data.totalRecipes),
  };
}

function normalizeHealth(value: unknown): PanoramaHealth {
  const data = providerDataRecord(value);
  return {
    avgCoupling: num(data.avgCoupling),
    cycleCount: num(data.cycleCount),
    gapCount: num(data.gapCount),
    healthRadar: normalizeHealthRadar(data.healthRadar),
    healthScore: num(data.healthScore),
    highPriorityGaps: num(data.highPriorityGaps),
    moduleCount: num(data.moduleCount),
  };
}

function normalizeGap(value: unknown): KnowledgeGap {
  const record = asRuntimeRecord(value) ?? {};
  return {
    affectedModuleIds: stringArray(record.affectedModuleIds),
    affectedRoles: stringArray(record.affectedRoles),
    dimension: str(record.dimension),
    dimensionName: str(record.dimensionName, str(record.dimension)),
    missingCellCount: num(record.missingCellCount),
    priority: str(record.priority, 'medium') as KnowledgeGap['priority'],
    recipeCount: num(record.recipeCount),
    status: str(record.status, 'missing') as KnowledgeGap['status'],
    suggestedTopics: stringArray(record.suggestedTopics),
    valueScore: num(record.valueScore),
    weakCellCount: num(record.weakCellCount),
  };
}

function normalizeGaps(value: unknown): KnowledgeGap[] {
  return recordArray(providerDataRecord(value)).map(normalizeGap);
}

function normalizeGraph(value: unknown): KnowledgeGraph {
  const data = providerDataRecord(value);
  const edges = recordArray(data.edges).map((edge, index) => ({
    fromId: str(edge.fromId),
    fromType: str(edge.fromType),
    id: firstNumber(edge.id) ?? index,
    metadata: asRuntimeRecord(edge.metadata) ?? {},
    relation: str(edge.relation, str(edge.type, 'depends_on')),
    toId: str(edge.toId),
    toType: str(edge.toType),
    weight: num(edge.weight, 1),
  })).filter((edge) => edge.fromId.length > 0 && edge.toId.length > 0);
  return {
    edges,
    nodeCategories: stringRecord(data.nodeCategories) ?? {},
    nodeLabels: stringRecord(data.nodeLabels) ?? {},
    nodeTypes: stringRecord(data.nodeTypes) ?? {},
  };
}

function normalizeGraphStats(value: unknown): KnowledgeGraphStats {
  const data = providerDataRecord(value);
  const byRelationRecord = asRuntimeRecord(data.byRelation) ?? {};
  const byRelation = Object.fromEntries(
    Object.entries(byRelationRecord).map(([key, value]) => [key, num(value)])
  );
  return {
    byRelation,
    nodeTypes: Array.isArray(data.nodeTypes) ? data.nodeTypes : [],
    totalEdges: num(data.totalEdges),
  };
}

function normalizeDiscoverRelationsResponse(value: unknown): DiscoverRelationsResponse {
  const payload = asRuntimeRecord(value) ?? {};
  if (payload.success === false) {
    const errorRecord = asRuntimeRecord(payload.error) ?? {};
    throw new Error(str(errorRecord.message, 'Failed to start relation discovery'));
  }
  const data = providerDataRecord(value);
  return {
    error: firstString(data.error) ?? undefined,
    message: firstString(data.message) ?? undefined,
    startedAt: firstString(data.startedAt) ?? undefined,
    status: str(data.status, 'unknown'),
  };
}

function normalizeDiscoverRelationsStatus(value: unknown): DiscoverRelationsStatus {
  const data = providerDataRecord(value);
  return {
    batchErrors: firstNumber(data.batchErrors) ?? undefined,
    discovered: firstNumber(data.discovered) ?? undefined,
    elapsed: firstNumber(data.elapsed) ?? undefined,
    error: firstString(data.error) ?? undefined,
    message: firstString(data.message) ?? undefined,
    startedAt: firstString(data.startedAt) ?? undefined,
    status: str(data.status, 'idle'),
    totalPairs: firstNumber(data.totalPairs) ?? undefined,
  };
}

export const panoramaApi = {
  async getPanoramaOverview(refresh = false): Promise<PanoramaOverview> {
    const res = await http.get('/panorama', reqParams(refresh));
    return normalizeOverview(res.data);
  },

  async getPanoramaHealth(refresh = false): Promise<PanoramaHealth> {
    const res = await http.get('/panorama/health', reqParams(refresh));
    return normalizeHealth(res.data);
  },

  async getPanoramaGaps(refresh = false): Promise<KnowledgeGap[]> {
    const res = await http.get('/panorama/gaps', reqParams(refresh));
    return normalizeGaps(res.data);
  },

  async getKnowledgeGraph(limit = 500): Promise<KnowledgeGraph> {
    const res = await http.get(`/search/graph/all?limit=${limit}`);
    return normalizeGraph(res.data);
  },

  async getGraphStats(): Promise<KnowledgeGraphStats> {
    const res = await http.get('/search/graph/stats');
    return normalizeGraphStats(res.data);
  },

  async discoverRelations(batchSize = 20): Promise<DiscoverRelationsResponse> {
    const res = await http.post('/recipes/discover-relations', { batchSize });
    return normalizeDiscoverRelationsResponse(res.data);
  },

  async getDiscoverRelationsStatus(): Promise<DiscoverRelationsStatus> {
    const res = await http.get('/recipes/discover-relations/status');
    return normalizeDiscoverRelationsStatus(res.data);
  },
};
