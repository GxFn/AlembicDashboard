export interface RecipeStats {
  authority: number;
  guardUsageCount: number;
  humanUsageCount: number;
  aiUsageCount: number;
  lastUsedAt: string | null;
  authorityScore: number;
}

/** Recipe 结构化内容（API 返回对象形式时） */
export interface RecipeContent {
  pattern?: string;
  markdown?: string;
  rationale?: string;
  steps?: Array<string | { title?: string; description?: string; code?: string }>;
  codeChanges?: Array<{ file: string; before: string; after: string; explanation: string }>;
  verification?: { method?: string; expectedResult?: string; testCode?: string } | null;
}

export interface Recipe {
  id?: string;
  name: string;
  trigger?: string;
  /** V3 结构化内容对象 */
  content: RecipeContent;
  category?: string;
  language?: string;
  description?: string;
  status?: string;
  kind?: 'rule' | 'pattern' | 'fact';
  metadata?: any;
  /** 使用统计与权威分（来自 recipe-stats.json） */
  stats?: RecipeStats | null;
  knowledgeType?: string;
  relations?: Record<string, any[]> | null;
  constraints?: {
    guards?: Array<{ pattern: string; severity: string; message?: string }>;
    boundaries?: string[];
    preconditions?: string[];
    sideEffects?: string[];
  } | null;
  tags?: string[];
  /** 使用指南 */
  usageGuide?: string;
  /** 来源信息 */
  source?: string;
  createdBy?: string;
  sourceFile?: string;
  moduleName?: string;
  /** V3 reasoning 推理 */
  reasoning?: {
    whyStandard?: string;
    sources?: string[];
    confidence?: number;
    qualitySignals?: Record<string, number>;
    alternatives?: string[];
  } | null;
  /** V3 quality 质量 */
  quality?: {
    completeness?: number;
    adaptation?: number;
    documentation?: number;
    overall?: number;
    grade?: string;
  } | null;
  /** V3 直接字段 */
  scope?: string;
  complexity?: string;
  difficulty?: string;
  version?: string;
  doClause?: string;
  dontClause?: string;
  whenClause?: string;
  coreCode?: string;
  topicHint?: string;
  aiInsight?: string | null;
  lifecycleHistory?: Array<{ from: string; to: string; at: number; by?: string }> | string;
  headers?: string[];
  createdAt?: string | number | null;
  updatedAt?: string | number | null;
}

export type RuntimeMode = 'daemon' | 'api' | 'plugin' | 'unknown' | (string & {});
export type RuntimeRouteKind =
  | 'local-alembic'
  | 'local-alembic-daemon'
  | 'embedded-runtime'
  | 'embedded-plugin-runtime'
  | 'local-install'
  | 'local-alembic-install'
  | 'unavailable'
  | 'unknown'
  | (string & {});
export type RuntimeDataRootSource = 'project-root' | 'ghost-registry' | 'unknown' | (string & {});
export type RuntimeAiConfigSource = 'empty' | 'process-env' | 'workspace-settings' | 'unknown' | (string & {});
export type RuntimeWorkspaceMode = 'ghost' | 'standard' | 'unknown' | (string & {});

export interface RuntimeProjectIdentity {
  projectRoot: string;
  dataRoot: string;
  projectId: string | null;
  projectScope?: ProjectScopeSummary | null;
  projectScopeId?: string | null;
  dataRootSource: RuntimeDataRootSource;
  runtimeDir?: string | null;
  databasePath?: string | null;
  schemaMigrationVersion?: string | null;
  workspaceMode?: RuntimeWorkspaceMode;
  workspaceContract?: string | null;
}

export interface RuntimeApiCapability {
  available: boolean | null;
  baseUrl?: string | null;
  healthPath?: string | null;
}

export interface RuntimeDashboardCapability {
  available: boolean | null;
  url?: string | null;
  frontendOwner?: string | null;
  handoff?: string | null;
  serverOwner?: string | null;
}

export interface RuntimeFileMonitorCapability {
  available: boolean | null;
  mode?: string | null;
  endpoint?: string | null;
  acceptedEventSources?: string[];
  compatibilityAliases?: Record<string, string>;
  dispatcher?: string | null;
  longLivedOwner?: string | null;
}

export interface RuntimeJobsCapability {
  available: boolean | null;
  kinds?: string[];
  endpoints?: Record<string, string>;
  owner?: string | null;
  store?: string | null;
}

export interface RuntimeApiAiCapability {
  available: boolean | null;
  configSource: RuntimeAiConfigSource;
  provider: string | null;
  model: string | null;
  owner?: string | null;
  runtimeOwner?: string | null;
}

export interface RuntimeProjectScopeCapability {
  available: boolean | null;
  endpoints?: Record<string, string>;
  owner?: string | null;
  source?: string | null;
}

export interface RuntimeHostAgentRoute {
  available?: boolean | null;
  owner?: string | null;
  source?: string | null;
}

export interface RuntimeBoundary {
  owner?: string | null;
  source?: string | null;
  mode: RuntimeMode;
  route: RuntimeRouteKind;
  apiVersion?: string | null;
  packageName?: string | null;
  version?: string | null;
  dashboardUrl?: string | null;
  daemon?: {
    apiBaseUrl?: string | null;
    owner?: string | null;
    stateContract?: string | null;
  };
  project: RuntimeProjectIdentity;
  capabilities: {
    api?: RuntimeApiCapability;
    dashboard?: RuntimeDashboardCapability;
    fileMonitor?: RuntimeFileMonitorCapability;
    jobs?: RuntimeJobsCapability;
    apiAi?: RuntimeApiAiCapability;
    projectScope?: RuntimeProjectScopeCapability;
  };
  hostAgentRoute?: RuntimeHostAgentRoute;
}

export interface ProjectScopeFolderSummary {
  displayName: string;
  folderId: string;
  path: string;
  realpath: string | null;
  repositoryId: string | null;
  role: string;
  state: string;
}

export interface ProjectScopeSummary {
  contractVersion?: string | null;
  controlRoot: string;
  controlRootIncludedInFolders: boolean;
  currentFolderId: string | null;
  currentFolderPath: string | null;
  dataRoot: string;
  dataRootSource: string;
  displayName: string;
  folderCount: number;
  folders: ProjectScopeFolderSummary[];
  projectId: string | null;
  projectRootWriteAllowed: boolean;
  projectScopeId: string | null;
  standardWriteAllowed: boolean;
  storageKind: string;
}

export interface ProjectScopeResolution {
  controlRoot: string | null;
  currentFolder: ProjectScopeFolderSummary | null;
  currentFolderId: string | null;
  currentFolderPath: string | null;
}

export interface ProjectScopeResponse {
  capability: RuntimeProjectScopeCapability | null;
  projectScope: ProjectScopeSummary | null;
  registryPath: string | null;
  resolution: ProjectScopeResolution | null;
  summary: ProjectScopeSummary | null;
}

export interface ProjectScopeFoldersResponse {
  capability: RuntimeProjectScopeCapability | null;
  folders: ProjectScopeFolderSummary[];
  projectScopeId: string | null;
  registryPath: string | null;
}

export interface ProjectScopeAddFolderInput {
  controlRoot?: string;
  displayName?: string;
  folderPath: string;
  projectScopeId?: string;
  role?: 'primary-source' | 'source' | string;
}

// Source of truth: Alembic HTTP projects API backed by @alembic/core daemon project runtime contracts.
// Dashboard keeps DTOs here as transport/view types only; orchestration remains owned by Alembic.
export type DashboardProjectConnectionState =
  | 'ready'
  | 'stopped'
  | 'starting'
  | 'stale'
  | 'failed'
  | 'missing'
  | 'unavailable'
  | 'unknown'
  | (string & {});

export type DashboardProjectDaemonStatus =
  | 'ready'
  | 'starting'
  | 'stopped'
  | 'stale'
  | 'failed'
  | 'not-checked'
  | 'unknown'
  | (string & {});

export interface DashboardProjectRuntimeControlState {
  activeProjectId: string | null;
  activeProjectRoot: string | null;
  schemaVersion: number | null;
  selectedAt: string | null;
  selectedProjectId: string | null;
  selectedProjectRoot: string | null;
  updatedAt: string | null;
}

export interface DashboardProjectRuntimeDaemonSummary {
  dashboardUrl: string | null;
  message: string | null;
  pid: number | null;
  pidAlive: boolean | null;
  ready: boolean | null;
  status: DashboardProjectDaemonStatus;
  url: string | null;
}

export interface DashboardProjectRuntimeFlags {
  activeRuntime: boolean;
  missing: boolean;
  selected: boolean;
  stale: boolean;
  unavailable: boolean;
}

/** Alembic projects API 的 source-of-truth 只读诊断视图；Dashboard 只展示，不写 runtime-control state。 */
export type DashboardProjectRuntimeDiagnosticSeverity = 'info' | 'warning' | 'error' | (string & {});

export interface DashboardProjectRuntimeControlDiagnostic {
  action: string | null;
  code: string | null;
  detailRefs: string[];
  /** Preserve backend diagnostic extensions for read-only UI and troubleshooting. */
  extraFields: Record<string, unknown>;
  message: string;
  projectId: string | null;
  projectRoot: string | null;
  reasonCode: string;
  severity: DashboardProjectRuntimeDiagnosticSeverity;
  source: string | null;
  sourceRefs: string[];
}

export interface DashboardProjectRuntimeControlStateCleanup {
  activeState: {
    cleaned: boolean;
    cleanedAt: string | null;
    message: string | null;
    previousProjectId: string | null;
    previousProjectRoot: string | null;
    reasonCode: string | null;
  };
}

export interface DashboardProjectRuntimeProjectRef {
  activeRuntime: boolean;
  dataRoot: string | null;
  dataRootSource: string | null;
  projectId: string | null;
  projectRoot: string;
  projectScopeId: string | null;
  ready: boolean;
  selected: boolean;
  stale: boolean;
  status: DashboardProjectConnectionState;
}

export interface DashboardProjectRuntimeReadiness {
  capabilities: {
    apiAiAvailable: boolean | null;
    dashboardAvailable: boolean | null;
    dashboardUrl: string | null;
    fileMonitorAvailable: boolean | null;
    fileMonitorMode: string | null;
    jobsAvailable: boolean | null;
    projectScopeAvailable: boolean | null;
  };
  daemon: {
    dashboardUrl: string | null;
    logPath: string | null;
    message: string | null;
    pidAlive: boolean | null;
    ready: boolean | null;
    statePath: string | null;
    status: DashboardProjectDaemonStatus;
    url: string | null;
  };
  ready: boolean;
  reasonCode: string;
  stale: boolean;
  status: DashboardProjectConnectionState;
}

export interface DashboardProjectRuntimeFailureEnvelope {
  blockedFallbacks: string[];
  blockingCondition: string;
  detailRefs: string[];
  diagnostics: DashboardProjectRuntimeControlDiagnostic[];
  nextActions: string[];
  observedSource: string | null;
  reasonCode: string;
  retryable: boolean | null;
  sourceRefs: string[];
}

export interface DashboardProjectRuntimeControlSource {
  activeMatchesCurrentProject: boolean | null;
  activeProject: DashboardProjectRuntimeProjectRef | null;
  activeReadyProject: DashboardProjectRuntimeProjectRef | null;
  activeStateTrusted: boolean | null;
  diagnostics: DashboardProjectRuntimeControlDiagnostic[];
  projects: {
    missing: number | null;
    ready: number | null;
    stale: number | null;
    total: number | null;
    unavailable: number | null;
  };
  readOnly: boolean | null;
  selectedMatchesCurrentProject: boolean | null;
  selectedProject: DashboardProjectRuntimeProjectRef | null;
  state: DashboardProjectRuntimeControlState;
  stateCleanup: DashboardProjectRuntimeControlStateCleanup;
  statePath: string | null;
}

export interface DashboardProjectRuntimeSourceOfTruth {
  contractVersion: number | null;
  detailRefs: string[];
  diagnostics: DashboardProjectRuntimeControlDiagnostic[];
  explicitActions: {
    daemonLifecycle: string[];
    projectScopeRegistry: string[];
    runtimeControl: string[];
  };
  failure: DashboardProjectRuntimeFailureEnvelope | null;
  generatedAt: string | null;
  operation: {
    explicitRuntimeActionRequired: boolean | null;
    implicitRuntimeActionAllowed: boolean | null;
    mode: string | null;
    readOnly: boolean | null;
  };
  owner: string | null;
  readiness: DashboardProjectRuntimeReadiness;
  requiredService: {
    kind: string | null;
    owner: string | null;
    route: string | null;
  };
  route: string | null;
  runtimeControl: DashboardProjectRuntimeControlSource | null;
  sourceRefs: string[];
  targetProject: DashboardProjectRuntimeProjectRef | null;
  writePolicy: {
    activeStateWriteAllowed: boolean | null;
    daemonLifecycleWriteAllowed: boolean | null;
    jobStoreWriteAllowed: boolean | null;
    projectScopeRegistryWriteAllowed: boolean | null;
    selectedStateWriteAllowed: boolean | null;
    writeOwner: string | null;
  };
}

export interface DashboardProjectRuntimeScopeSummary {
  cacheKey: string;
  dashboardUrl: string | null;
  dataRoot: string;
  dataRootSource: RuntimeDataRootSource;
  daemon: DashboardProjectRuntimeDaemonSummary;
  displayName: string;
  flags: DashboardProjectRuntimeFlags;
  ghost: boolean;
  mode: RuntimeWorkspaceMode;
  projectExists: boolean;
  projectId: string | null;
  projectRealpath: string;
  projectRoot: string;
  registered: boolean;
  runtimeDir: string;
  status: DashboardProjectConnectionState;
  workspaceExists: boolean;
}

export interface DashboardProjectsSnapshot {
  activeRuntimeProject: DashboardProjectRuntimeScopeSummary | null;
  diagnostics: DashboardProjectRuntimeControlDiagnostic[];
  generatedAt: string | null;
  projects: DashboardProjectRuntimeScopeSummary[];
  selectedProject: DashboardProjectRuntimeScopeSummary | null;
  state: DashboardProjectRuntimeControlState;
  stateCleanup: DashboardProjectRuntimeControlStateCleanup;
  sourceOfTruth: DashboardProjectRuntimeSourceOfTruth | null;
}

export interface DashboardProjectRuntimeHandoff {
  apiBaseUrl: string | null;
  dashboardUrl: string | null;
  projectId: string | null;
  projectRoot: string;
  status: DashboardProjectConnectionState;
}

export interface DashboardProjectActionResult {
  action: 'start' | 'stop' | 'open-dashboard' | 'switch' | (string & {});
  error: string | null;
  deferredStopProject: DashboardProjectRuntimeScopeSummary | null;
  handoff: DashboardProjectRuntimeHandoff | null;
  ok: boolean;
  previousActiveProject: DashboardProjectRuntimeScopeSummary | null;
  snapshot: DashboardProjectsSnapshot;
  stoppedProject: DashboardProjectRuntimeScopeSummary | null;
  targetProject: DashboardProjectRuntimeScopeSummary | null;
}

export interface ProjectData {
  rootSpec: {
  recipes?: {
    dir: string;
  };
  };
  recipes: Recipe[];
  /** V3: 按 category 分组的知识条目 */
  candidates: Record<string, {
  targetName: string;
  scanTime: number;
  items: KnowledgeEntry[];
  }>;
  projectRoot: string;
  projectName: string;
  watcherStatus?: string;
  runtimeBoundary?: RuntimeBoundary;
  /** 当前使用的 AI 提供商与模型（供 UI 展示） */
  aiConfig?: { provider: string; model: string };
  /** 全局 ID→标题 查找表 (UUID → 人类可读标题) */
  idTitleMap?: Record<string, string>;
}

/** v3.2 统一模块目标（多语言） */
export interface ModuleTarget {
  name: string;
  /** 包名（SPM: Package 名, Go: module path, Node: package.json name） */
  packageName: string;
  /** 包配置文件路径（SPM: Package.swift, Go: go.mod, Node: package.json） */
  packagePath: string;
  /** Target 根目录 */
  targetDir: string;
  /** 扩展信息（SPM: target 解析结果, Go: modulePath 等） */
  info: any;
  /** 原始路径（Discoverer 返回的 path） */
  path?: string;
  /** target 类型 (library / application / test / directory) */
  type?: string;
  /** 模块发现器 ID（spm / node / go / jvm / python / generic / folder-scan） */
  discovererId?: string;
  /** 模块发现器显示名称 */
  discovererName?: string;
  /** 检测到的语言 */
  language?: string;
  /** 框架 */
  framework?: string;
  /** Go: go.mod metadata 等 */
  metadata?: any;
  /** 是否为手动添加的虚拟目录 */
  isVirtual?: boolean;
}

/** @deprecated 使用 ModuleTarget — 向后兼容别名 */
export type SPMTarget = ModuleTarget;

/** 扫描返回的文件条目 */
export interface ScannedFile {
  /** 文件名 */
  name: string;
  /** 相对路径 */
  path: string;
  /** 所属 target（全项目扫描时存在） */
  targetName?: string;
}

/** 项目目录条目（供目录浏览器使用） */
export interface ProjectDirectory {
  /** 目录名 */
  name: string;
  /** 相对于项目根目录的路径 */
  path: string;
  /** 目录深度 */
  depth: number;
  /** 检测到的主要语言 */
  language: string;
  /** 源码文件数量（浅层统计） */
  sourceFileCount: number;
  /** 是否包含源码文件 */
  hasSourceFiles: boolean;
}

export interface ExtractedRecipe {
  title: string;
  /** 统一描述（取代 summary_cn / summary_en） */
  description?: string;
  /** 兼容旧字段 */
  summary?: string;
  trigger: string;
  category?: string;
  language: string;
  code: string;
  /** AI extractRecipes 返回的完整方法体/项目特写 Markdown */
  article?: string;
  usageGuide?: string;
  headers?: string[];
  /** 每条 header 相对于 target 根目录的路径，与 create/headName 一致，用于 // as:include <M/H.h> [path] */
  headerPaths?: string[];
  /** target/模块名，用于角括号格式 // as:include <TargetName/Header.h> */
  moduleName?: string;
  /** 是否引入头文件：true 时 snippet 内写入 // as:include 标记，watch 按标记注入依赖 */
  includeHeaders?: boolean;
  /** 难度等级：beginner / intermediate / advanced */
  difficulty?: 'beginner' | 'intermediate' | 'advanced';
  /** 权威分 1～5，审核人员可设置初始值 */
  authority?: number;
  /** 知识类型 */
  knowledgeType?: 'code-pattern' | 'architecture' | 'best-practice' | 'rule' | 'dev-document';
  /** 复杂度 */
  complexity?: 'beginner' | 'intermediate' | 'advanced';
  /** 适用范围 */
  scope?: 'universal' | 'project-specific' | 'target-specific';
  /** 设计原理（英文） */
  rationale?: string;
  /** 实施步骤 */
  steps?: string[];
  /** 前置条件 */
  preconditions?: string[];
  /** 质量评分 (0-1) */
  qualityScore?: number;
  /** 质量等级 (A-F) */
  qualityGrade?: string;
  /** 自由标签 */
  tags?: string[];
  /** 版本号 */
  version?: string;
  /** 更新时间戳（毫秒） */
  updatedAt?: number;
  // ── Delivery fields ──
  kind?: KnowledgeKind;
  doClause?: string;
  dontClause?: string;
  whenClause?: string;
  coreCode?: string;
  topicHint?: string;
}

// ── V2 Candidate 类型已删除 — 前端统一使用 V3 KnowledgeEntry ──

/** Guard 审计摘要（全项目扫描返回） */
export interface GuardAuditSummary {
  totalFiles: number;
  totalViolations: number;
  errors: number;
  warnings: number;
}

/* ═══════════════════════════════════════════
 *  V3 Knowledge Entry — 统一知识实体
 * ═══════════════════════════════════════════ */

export type KnowledgeLifecycle = 'pending' | 'staging' | 'active' | 'evolving' | 'decaying' | 'deprecated';
export type KnowledgeKind = 'rule' | 'pattern' | 'fact';

export interface KnowledgeContent {
  pattern?: string;
  markdown?: string;
  rationale?: string;
  steps?: Array<{ title?: string; description?: string; code?: string }>;
  codeChanges?: Array<{ file: string; before: string; after: string; explanation: string }>;
  verification?: { method?: string; expectedResult?: string; testCode?: string } | null;
}

export interface KnowledgeReasoning {
  whyStandard: string;
  sources: string[];
  confidence: number;
  qualitySignals?: Record<string, unknown>;
  alternatives?: string[];
}

export interface KnowledgeQuality {
  completeness: number;
  adaptation: number;
  documentation: number;
  overall: number;
  grade: string;
}

export interface KnowledgeStats {
  views: number;
  adoptions: number;
  applications: number;
  guardHits: number;
  searchHits: number;
  authority: number;
}

export interface KnowledgeConstraints {
  guards?: Array<{ id?: string; type?: string; pattern: string; severity: string; message?: string; fixSuggestion?: string }>;
  boundaries?: string[];
  preconditions?: string[];
  sideEffects?: string[];
}

export interface KnowledgeRelations {
  inherits?: Array<{ target: string; description?: string }>;
  extends?: Array<{ target: string; description?: string }>;
  dependsOn?: Array<{ target: string; description?: string }>;
  conflicts?: Array<{ target: string; description?: string }>;
  related?: Array<{ target: string; description?: string }>;
  implements?: Array<{ target: string; description?: string }>;
  calls?: Array<{ target: string; description?: string }>;
  dataFlow?: Array<{ target: string; description?: string }>;
  [key: string]: Array<{ target: string; description?: string }> | undefined;
}

/** V3 统一知识条目（API 返回的 wire format — 全 camelCase） */
export interface KnowledgeEntry {
  id: string;
  title: string;
  trigger: string;
  description: string;
  lifecycle: KnowledgeLifecycle;
  lifecycleHistory?: Array<{ from: string; to: string; at: number; by?: string }>;
  autoApprovable?: boolean;
  language: string;
  /** Bootstrap / rescan dimension id, e.g. architecture. */
  dimensionId?: string;
  category: string;
  kind: KnowledgeKind;
  knowledgeType: string;
  complexity: string;
  scope?: string;
  difficulty?: string;
  tags: string[];
  // ── Delivery fields ──
  doClause?: string;
  dontClause?: string;
  whenClause?: string;
  coreCode?: string;
  topicHint?: string;
  // ── Structured sub-objects ──
  content: KnowledgeContent;
  relations: KnowledgeRelations;
  constraints: KnowledgeConstraints;
  reasoning: KnowledgeReasoning;
  quality: KnowledgeQuality;
  stats: KnowledgeStats;
  headers: string[];
  headerPaths?: string[];
  moduleName?: string;
  includeHeaders?: boolean;
  agentNotes?: string[] | null;
  aiInsight?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: number | null;
  rejectionReason?: string | null;
  source: string;
  sourceFile?: string | null;
  sourceCandidateId?: string | null;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  publishedAt?: number | null;
  publishedBy?: string | null;
}

/** 知识条目列表分页响应 */
export interface KnowledgePaginatedResponse {
  data: KnowledgeEntry[];
  pagination: { page: number; pageSize: number; total: number };
}

/** 知识条目统计（后端返回扁平 key） */
export interface KnowledgeStatsResponse {
  total: number;
  pending: number;
  active: number;
  deprecated: number;
  rules: number;
  patterns: number;
  facts: number;
  [key: string]: number;  // 允许按 key 索引
}

export interface GuardAuditResult {
  summary: GuardAuditSummary;
  files?: Array<{
    filePath: string;
    violations: Array<{ rule: string; severity: string; message: string; line?: number }>;
    summary: { errors: number; warnings: number };
  }>;
}

/**
 * 审核页面使用的条目类型 — 直接使用 V3 KnowledgeEntry 统一数据模型。
 * 从候选页进入审核时直接传入 KnowledgeEntry，仅需补充 mode/lang 等审核控制字段。
 * 从模块扫描时由后端返回的 ExtractedRecipe 数据映射为 V3 结构。
 *
 * 不使用兼容字段（summary/usageGuide/code 等），直接使用：
 *   description、content.pattern、content.markdown 等 KnowledgeEntry 原生字段。
 */
export type ScanResultItem = Partial<KnowledgeEntry> & {
  /** 保存模式：full = Snippet+Recipe，preview = Recipe Only */
  mode: 'full' | 'preview';
  /** 当前显示语言：cn / en */
  lang: 'cn' | 'en';
  /** 来源场景：target 扫描 / 全项目扫描 */
  scanMode?: 'target' | 'project';
  /** 关联的候选 target 名称 */
  candidateTargetName?: string;
  /** 关联的候选 ID（= KnowledgeEntry.id，保存后用于从候选池移除） */
  candidateId?: string;
  /** 权威分 1-5（top-level override，编辑时直接写入） */
  authority?: number;
};

/* ════════════════════════════════════════════════════════
 *  Evolution — Proposal & Warning 类型
 * ════════════════════════════════════════════════════════ */

export type ProposalType = 'update' | 'deprecate';
export type ProposalSource =
  | 'host-agent'
  | 'alembic-agent'
  | 'host-edit'
  | 'ide-agent'
  | 'ide-edit'
  | 'metabolism'
  | 'decay-scan'
  | 'consolidation'
  | 'relevance-audit'
  | 'file-change'
  | 'rescan-evolution';
export type ProposalStatus = 'pending' | 'observing' | 'executed' | 'rejected' | 'expired';

export interface ProposalRecord {
  id: string;
  type: ProposalType;
  targetRecipeId: string;
  relatedRecipeIds: string[];
  confidence: number;
  source: ProposalSource;
  description: string;
  evidence: Record<string, unknown>[];
  status: ProposalStatus;
  proposedAt: number;
  expiresAt: number;
  resolvedAt: number | null;
  resolvedBy: string | null;
  resolution: string | null;
}

export type WarningType = 'contradiction' | 'redundancy';
export type WarningStatus = 'open' | 'resolved' | 'dismissed';

export interface WarningRecord {
  id: string;
  type: WarningType;
  targetRecipeId: string;
  relatedRecipeIds: string[];
  confidence: number;
  description: string;
  evidence: string[];
  status: WarningStatus;
  detectedAt: number;
  resolvedAt: number | null;
  resolvedBy: string | null;
  resolution: string | null;
}
