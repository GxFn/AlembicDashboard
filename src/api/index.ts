/**
 * Alembic Dashboard API — 恒等聚合出口（W7-f api/ 拆分）。
 *
 * src/api.ts（原 god file）按后端路由族拆为本目录 16 个族文件；本 index 把各族
 * 方法组 spread 成与拆分前完全一致的单一 `api` 对象（default + named 出口全集
 * 恒等，W7-a 死区删除项除外），26+6 个消费文件零改。
 *
 * 族间 import 单向：各族→client/problem/sse；fetchData 是聚合族（另可引
 * knowledge/projectScope）；其余族间横向依赖禁止。area 仍为 'api'
 * （layer-contract 矩阵零回写）；recipes 族文件因 KGV 链亡（W7-a）不建。
 */

import { aiApi } from './ai';
import { authApi } from './auth';
import { evolutionApi } from './evolution';
import { extractApi } from './extract';
import { fetchDataApi } from './fetchData';
import { guardApi } from './guard';
import { jobsApi } from './jobs';
import { knowledgeApi } from './knowledge';
import { modulesApi } from './modules';
import { panoramaApi } from './panorama';
import { projectScopeApi } from './projectScope';
import { projectsApi } from './projects';
import { searchApi } from './search';
import { skillsApi } from './skills';
import { strictTestApi } from './strictTest';

export const api = {
  ...fetchDataApi,
  ...projectsApi,
  ...projectScopeApi,
  ...modulesApi,
  ...panoramaApi,
  ...jobsApi,
  ...extractApi,
  ...knowledgeApi,
  ...aiApi,
  ...searchApi,
  ...guardApi,
  ...skillsApi,
  strictTest: strictTestApi,
  ...authApi,
  ...evolutionApi,
};

export default api;

/* ── named 恒等出口（值 26） ─────────────────────────── */
export { DASHBOARD_PROVIDER_ADAPTER_POLICIES, providerDataRecord } from './client';
export {
  DASHBOARD_D25_REQUIRED_FAILURE_KINDS,
  HostManagedUnavailableError,
  isHostManagedUnavailable,
  normalizeDashboardErrorProblem,
  parseHostManagedUnavailable,
} from './problem';
export {
  projectProviderSseMessage,
  projectSseErrorMessage,
  projectSseScanResult,
  projectSseTextDelta,
} from './sse';
export { normalizeProjectActionResult, normalizeProjectsSnapshot } from './projects';
export { normalizeProjectScopeFoldersResponse, normalizeProjectScopeResponse } from './projectScope';
export {
  normalizeJobDisplaySnapshotResponse,
  normalizeJobDisplaySnapshotSummaryRef,
  normalizeJobProcessArtifactRequestPath,
  normalizeJobProcessEventsResponse,
  normalizeProcessDeveloperView,
} from './jobs';
export { normalizeSearchResponse } from './search';
export {
  normalizeGuardReportResponse,
  normalizeGuardRuleRecord,
  normalizeGuardRunRecord,
  normalizeGuardViolationRecord,
} from './guard';
export { normalizeRuntimeBoundary } from './fetchData';
export { buildModuleScanViewModel, normalizeModuleScanProjectResult } from './moduleScan';
export {
  createStrictTestApi,
  isStrictTestApiProblem,
  strictTestApi,
  StrictTestApiProblem,
  StrictTestContractError,
} from './strictTest';

/* ── named 恒等出口（类型 50） ───────────────────────── */
export type {
  DashboardAdapterDisposition,
  DashboardAdapterPolicy,
  DashboardProviderSurface,
} from './client';
export type {
  DashboardErrorProblemProjection,
  DashboardFailureKind,
  DashboardFailureProjectionSource,
  HostManagedUnavailableDetails,
} from './problem';
export type { SSEEvent, SSEEventType, ScanStreamResultProjection } from './sse';
export type {
  AgentDiagnostics,
  AgentEfficiencySummary,
  AgentGateFailure,
  DaemonJobRecord,
  DaemonJobSummary,
  JobDisplaySnapshot,
  JobDisplaySnapshotArtifactRef,
  JobDisplaySnapshotEvidenceIncomplete,
  JobDisplaySnapshotEvidenceItem,
  JobDisplaySnapshotJobIdentity,
  JobDisplaySnapshotLlmIoEntry,
  JobDisplaySnapshotLlmIoSection,
  JobDisplaySnapshotManifest,
  JobDisplaySnapshotMetadata,
  JobDisplaySnapshotPhaseTimelineItem,
  JobDisplaySnapshotRef,
  JobDisplaySnapshotResponse,
  JobDisplaySnapshotSummary,
  JobDisplaySnapshotSummaryRef,
  JobDisplaySnapshotWarning,
  JobProcessArtifactContent,
  JobProcessArtifactRef,
  JobProcessDeveloperView,
  JobProcessDisplayPolicy,
  JobProcessEndpointCapability,
  JobProcessEventKind,
  JobProcessEventsResponse,
  JobProcessSeverity,
  JobProcessSourceClass,
} from './jobs';
export type { SearchResultItem } from './search';
export type {
  KnowledgeGap,
  KnowledgeGraph,
  KnowledgeGraphEdge,
  KnowledgeGraphStats,
  PanoramaArchitectureLayer,
  PanoramaHealth,
  PanoramaHealthRadar,
  PanoramaHealthRadarDimension,
  PanoramaLayerModule,
  PanoramaOverview,
  PanoramaRecipeCount,
  PanoramaScopeBoundary,
} from './panorama';
export type {
  AiProbeResult,
  AiProviderInfo,
  AiProviderModelInfo,
  AiProvidersResponse,
  ModelCapabilities,
  ModelReasoning,
} from './ai';
export type { SkillInfo } from './skills';
export type {
  ModuleScanBatchOutcome,
  ModuleScanError,
  ModuleScanNormalizationIssue,
  ModuleScanOutcomeStatus,
  ModuleScanProjectResult,
  ModuleScanRecipe,
  ModuleScanViewModel,
} from './moduleScan';
export type {
  GuardRuleProviderRecord,
  GuardRunProviderRecord,
  GuardViolationProviderRecord,
} from './guard';
export type {
  StrictTestApiClient,
  StrictTestHttpRequest,
  StrictTestHttpResponse,
  StrictTestHttpTransport,
} from './strictTest';
