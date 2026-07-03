/**
 * fetchData — 聚合族（W7-f 自 api.ts 拆出）：并发拉取 /knowledge + /ai/config +
 * /modules/project-info + /daemon/health 组装 ProjectData，并承载 runtime boundary
 * 归一化（其唯一消费方）。聚合族允许向下引用 knowledge/projectScope 族；
 * 其余族间横向依赖禁止（单向：各族→client/problem/sse）。
 */

import {
  asRuntimeRecord,
  booleanOrNull,
  firstBoolean,
  firstRecord,
  firstString,
  firstStringArray,
  http,
  stringRecord,
  type UnknownRecord,
} from './client';
import { candidateGroupKey, toRecipe } from './knowledge';
import { normalizeProjectScopeSummary } from './projectScope';
import type { KnowledgeEntry, KnowledgeLifecycle, ProjectData, RuntimeBoundary } from '../types';


function runtimeBoundarySource(
  daemonRuntimeBoundary: UnknownRecord | null,
  daemonCapabilityRuntimeBoundary: UnknownRecord | null,
  projectInfoRuntimeBoundary: UnknownRecord | null,
  projectInfoCapabilityRuntimeBoundary: UnknownRecord | null,
): string | null {
  if (daemonRuntimeBoundary) {
    return 'data.runtimeBoundary';
  }
  if (daemonCapabilityRuntimeBoundary) {
    return 'capabilities.runtimeBoundary';
  }
  if (projectInfoRuntimeBoundary) {
    return 'projectInfo.runtimeBoundary';
  }
  return projectInfoCapabilityRuntimeBoundary ? 'projectInfo.capabilities.runtimeBoundary' : null;
}

function normalizeRuntimeDaemon(runtimeDaemon: UnknownRecord | null): RuntimeBoundary['daemon'] {
  if (!runtimeDaemon) {
    return undefined;
  }
  return {
    apiBaseUrl: firstString(runtimeDaemon.apiBaseUrl),
    owner: firstString(runtimeDaemon.owner),
    stateContract: firstString(runtimeDaemon.stateContract),
  };
}

function normalizeRuntimeProjectIdentity(params: {
  daemon: UnknownRecord;
  projectInfo: UnknownRecord;
  runtimeWorkspace: UnknownRecord | null;
  serviceProjectIdentity: UnknownRecord | null;
  serviceProjectScope: unknown;
}): RuntimeBoundary['project'] {
  const { daemon, projectInfo, runtimeWorkspace, serviceProjectIdentity, serviceProjectScope } = params;
  const workspaceMode = firstString(runtimeWorkspace?.mode);
  const projectRoot = firstString(daemon.projectRoot, runtimeWorkspace?.projectRoot, projectInfo.projectRoot) ?? '';
  const dataRoot = firstString(daemon.dataRoot, runtimeWorkspace?.dataRoot, projectInfo.dataRoot, projectRoot) ?? '';
  const dataRootSource = firstString(
    daemon.dataRootSource,
    runtimeWorkspace?.dataRootSource,
    projectInfo.dataRootSource,
    workspaceMode === 'ghost' ? 'ghost-registry' : null,
    workspaceMode === 'standard' ? 'project-root' : null
  ) ?? 'unknown';

  return {
    projectRoot,
    dataRoot,
    projectId: firstString(daemon.projectId, runtimeWorkspace?.projectId, projectInfo.projectId),
    projectScope: normalizeProjectScopeSummary(serviceProjectScope) ??
      normalizeProjectScopeSummary(daemon.projectScope) ??
      normalizeProjectScopeSummary(runtimeWorkspace?.projectScope) ??
      normalizeProjectScopeSummary(projectInfo.projectScope),
    projectScopeId: firstString(
      daemon.projectScopeId,
      serviceProjectIdentity?.projectScopeId,
      asRuntimeRecord(serviceProjectScope)?.projectScopeId,
      runtimeWorkspace?.projectScopeId,
      projectInfo.projectScopeId
    ),
    dataRootSource,
    runtimeDir: firstString(daemon.runtimeDir, runtimeWorkspace?.runtimeDir, projectInfo.runtimeDir),
    databasePath: firstString(daemon.databasePath, runtimeWorkspace?.databasePath, projectInfo.databasePath),
    schemaMigrationVersion: firstString(daemon.schemaMigrationVersion, projectInfo.schemaMigrationVersion),
    workspaceMode: workspaceMode ?? 'unknown',
    workspaceContract: firstString(runtimeWorkspace?.contract),
  };
}

function normalizeRuntimeCapabilities(params: {
  apiAiCapability: UnknownRecord | null;
  apiCapability: UnknownRecord | null;
  dashboardCapability: UnknownRecord | null;
  fileMonitorCapability: UnknownRecord | null;
  jobsCapability: UnknownRecord | null;
  projectScopeCapability: UnknownRecord | null;
  runtimeApiAi: UnknownRecord | null;
  runtimeDashboard: UnknownRecord | null;
  runtimeDaemon: UnknownRecord | null;
  runtimeFileMonitor: UnknownRecord | null;
  runtimeJobs: UnknownRecord | null;
  runtimeProjectScopeCapability: UnknownRecord | null;
}): RuntimeBoundary['capabilities'] {
  const {
    apiAiCapability,
    apiCapability,
    dashboardCapability,
    fileMonitorCapability,
    jobsCapability,
    projectScopeCapability,
    runtimeApiAi,
    runtimeDashboard,
    runtimeDaemon,
    runtimeFileMonitor,
    runtimeJobs,
    runtimeProjectScopeCapability,
  } = params;

  return {
    api: apiCapability || runtimeDaemon
      ? {
          available: booleanOrNull(apiCapability?.available),
          baseUrl: firstString(apiCapability?.baseUrl, runtimeDaemon?.apiBaseUrl),
          healthPath: firstString(apiCapability?.healthPath),
        }
      : undefined,
    dashboard: dashboardCapability || runtimeDashboard
      ? {
          available: firstBoolean(dashboardCapability?.available),
          url: firstString(dashboardCapability?.url, runtimeDashboard?.url),
          frontendOwner: firstString(runtimeDashboard?.frontendOwner),
          handoff: firstString(runtimeDashboard?.handoff),
          serverOwner: firstString(runtimeDashboard?.serverOwner),
        }
      : undefined,
    fileMonitor: fileMonitorCapability || runtimeFileMonitor
      ? {
          available: firstBoolean(fileMonitorCapability?.available, runtimeFileMonitor?.available),
          mode: firstString(fileMonitorCapability?.mode, runtimeFileMonitor?.mode, runtimeFileMonitor?.source),
          endpoint: firstString(fileMonitorCapability?.endpoint, runtimeFileMonitor?.endpoint),
          acceptedEventSources: firstStringArray(
            fileMonitorCapability?.acceptedEventSources,
            runtimeFileMonitor?.acceptedEventSources
          ),
          dispatcher: firstString(runtimeFileMonitor?.dispatcher),
          longLivedOwner: firstString(runtimeFileMonitor?.longLivedOwner),
        }
      : undefined,
    jobs: jobsCapability || runtimeJobs
      ? {
          available: firstBoolean(jobsCapability?.available),
          kinds: firstStringArray(jobsCapability?.kinds, runtimeJobs?.kinds),
          endpoints: stringRecord(jobsCapability?.endpoints) ?? stringRecord(runtimeJobs?.endpoints),
          owner: firstString(runtimeJobs?.owner),
          store: firstString(runtimeJobs?.store),
        }
      : undefined,
    apiAi: apiAiCapability || runtimeApiAi
      ? {
          available: firstBoolean(apiAiCapability?.available, runtimeApiAi?.available),
          configSource: firstString(apiAiCapability?.configSource, runtimeApiAi?.configSource) ?? 'unknown',
          provider: firstString(apiAiCapability?.provider, runtimeApiAi?.provider),
          model: firstString(apiAiCapability?.model, runtimeApiAi?.model),
          owner: firstString(runtimeApiAi?.owner),
          runtimeOwner: firstString(runtimeApiAi?.runtimeOwner),
        }
      : undefined,
    projectScope: projectScopeCapability || runtimeProjectScopeCapability
      ? {
          available: firstBoolean(projectScopeCapability?.available, runtimeProjectScopeCapability?.available),
          endpoints: stringRecord(projectScopeCapability?.endpoints) ?? stringRecord(runtimeProjectScopeCapability?.endpoints),
          owner: firstString(projectScopeCapability?.owner, runtimeProjectScopeCapability?.owner),
          source: firstString(projectScopeCapability?.source, runtimeProjectScopeCapability?.source),
        }
      : undefined,
  };
}

function normalizeRuntimeHostAgentRoute(hostAgentRoute: UnknownRecord | null): RuntimeBoundary['hostAgentRoute'] {
  if (!hostAgentRoute) {
    return undefined;
  }
  return {
    available: booleanOrNull(hostAgentRoute.available),
    owner: firstString(hostAgentRoute.owner),
    source: firstString(hostAgentRoute.source),
  };
}

export function normalizeRuntimeBoundary(projectInfoValue: unknown, daemonHealthValue: unknown): RuntimeBoundary {
  const projectInfo = asRuntimeRecord(projectInfoValue) ?? {};
  const daemon = asRuntimeRecord(daemonHealthValue) ?? {};
  const daemonCapabilities = asRuntimeRecord(daemon.capabilities);
  const projectInfoCapabilities = asRuntimeRecord(projectInfo.capabilities);
  const enhancement = asRuntimeRecord(daemon.enhancement) ?? asRuntimeRecord(projectInfo.enhancement) ?? {};
  const capabilities = daemonCapabilities ?? projectInfoCapabilities ?? {};
  const daemonRuntimeBoundary = asRuntimeRecord(daemon.runtimeBoundary);
  const daemonCapabilityRuntimeBoundary = asRuntimeRecord(daemonCapabilities?.runtimeBoundary);
  const projectInfoRuntimeBoundary = asRuntimeRecord(projectInfo.runtimeBoundary);
  const projectInfoCapabilityRuntimeBoundary = asRuntimeRecord(projectInfoCapabilities?.runtimeBoundary);
  const runtimeBoundary = firstRecord(
    daemonRuntimeBoundary,
    daemonCapabilityRuntimeBoundary,
    projectInfoRuntimeBoundary,
    projectInfoCapabilityRuntimeBoundary
  );
  const source = runtimeBoundarySource(
    daemonRuntimeBoundary,
    daemonCapabilityRuntimeBoundary,
    projectInfoRuntimeBoundary,
    projectInfoCapabilityRuntimeBoundary
  );
  const runtimeWorkspace = asRuntimeRecord(runtimeBoundary?.workspace);
  const runtimeDaemon = asRuntimeRecord(runtimeBoundary?.daemon);
  const runtimeDashboard = asRuntimeRecord(runtimeBoundary?.dashboard);
  const runtimeFileMonitor = asRuntimeRecord(runtimeBoundary?.fileMonitor);
  const runtimeJobs = asRuntimeRecord(runtimeBoundary?.jobs);
  const runtimeApiAi = asRuntimeRecord(runtimeBoundary?.apiAi);
  const runtimeProjectScopeCapability = asRuntimeRecord(runtimeBoundary?.projectScope);
  const serviceScope = asRuntimeRecord(daemon.serviceScope);
  const serviceProjectIdentity = asRuntimeRecord(serviceScope?.projectIdentity);
  const serviceProjectScope = serviceProjectIdentity?.projectScope;
  const apiCapability = asRuntimeRecord(capabilities.api);
  const dashboardCapability = asRuntimeRecord(capabilities.dashboard);
  const fileMonitorCapability = asRuntimeRecord(capabilities.fileMonitor);
  const jobsCapability = asRuntimeRecord(capabilities.jobs);
  const apiAiCapability = asRuntimeRecord(capabilities.apiAi);
  const projectScopeCapability = asRuntimeRecord(capabilities.projectScope);
  const hostAgentRoute =
    asRuntimeRecord(daemon.hostAgentRoute) ??
    asRuntimeRecord(enhancement.hostAgentRoute) ??
    asRuntimeRecord(projectInfo.hostAgentRoute);

  return {
    owner: firstString(runtimeBoundary?.owner),
    source,
    mode: firstString(daemon.mode, runtimeDaemon?.mode, projectInfo.runtimeMode) ?? 'unknown',
    route: firstString(enhancement.route, runtimeBoundary?.route, daemon.route, projectInfo.route) ?? 'unknown',
    apiVersion: firstString(enhancement.apiVersion),
    packageName: firstString(enhancement.packageName),
    version: firstString(enhancement.version, daemon.version, projectInfo.version),
    dashboardUrl: firstString(daemon.dashboardUrl, dashboardCapability?.url, runtimeDashboard?.url),
    daemon: normalizeRuntimeDaemon(runtimeDaemon),
    project: normalizeRuntimeProjectIdentity({
      daemon,
      projectInfo,
      runtimeWorkspace,
      serviceProjectIdentity,
      serviceProjectScope,
    }),
    capabilities: normalizeRuntimeCapabilities({
      apiAiCapability,
      apiCapability,
      dashboardCapability,
      fileMonitorCapability,
      jobsCapability,
      projectScopeCapability,
      runtimeApiAi,
      runtimeDashboard,
      runtimeDaemon,
      runtimeFileMonitor,
      runtimeJobs,
      runtimeProjectScopeCapability,
    }),
    hostAgentRoute: normalizeRuntimeHostAgentRoute(hostAgentRoute),
  };
}

function watcherStatusFromRuntime(boundary: RuntimeBoundary): string {
  const available = boundary.capabilities.fileMonitor?.available;
  if (available === true) {
    return 'active';
  }
  if (available === false) {
    return 'unavailable';
  }
  return 'unknown';
}

export const fetchDataApi = {
  // ── Data (bulk fetch) ──────

  async fetchData(): Promise<ProjectData> {
    const [knowledgeRes, aiConfigRes, projectInfoRes, daemonHealthRes] = await Promise.all([
      http.get('/knowledge?limit=1000').catch(() => ({ data: { success: true, data: { data: [] } } })),
      http.get('/ai/config').catch(() => ({ data: { success: true, data: { provider: '', model: '' } } })),
      http.get('/modules/project-info').catch(() => ({ data: { success: true, data: { projectRoot: '' } } })),
      http.get('/daemon/health').catch(() => null),
    ]);

    // All knowledge entries from V3 backend
    const allEntries: KnowledgeEntry[] = knowledgeRes.data?.data?.data || knowledgeRes.data?.data?.items || [];

    // Recipes = active + evolving lifecycle entries
    const activeEntries = allEntries.filter((e) => e.lifecycle === 'active' || e.lifecycle === 'evolving');
    const recipes = activeEntries.map(toRecipe);

    // Candidates = pending + staging（两者都需要人工审核）。字面量绑定到生成的
    // KnowledgeLifecycle 联合：契约中生命周期改名时这里在编译期失败，而不是静默漏数据。
    const CANDIDATE_STATES: ReadonlySet<string> = new Set<KnowledgeLifecycle>(['pending', 'staging']);
    const rawEntries = allEntries.filter((e) => CANDIDATE_STATES.has(e.lifecycle));
    const candidates: ProjectData['candidates'] = {};
    for (const entry of rawEntries) {
      const target = candidateGroupKey(entry);
      if (!candidates[target]) {
        candidates[target] = { targetName: target, scanTime: entry.createdAt, items: [] };
      }
      candidates[target].items.push(entry);
    }

    // AI Config
    const aiConfig = aiConfigRes.data?.data || { provider: '', model: '' };

    // 全局 ID→标题 查找表 (将 UUID 关联解析为可读标题)
    const idTitleMap: Record<string, string> = {};
    for (const e of allEntries) {
      if (e.id && e.title) idTitleMap[e.id] = e.title;
    }

    // Project/runtime identity comes from backend contracts. Dashboard only normalizes it for display.
    const projectInfo = projectInfoRes.data?.data || {};
    const runtimeBoundary = normalizeRuntimeBoundary(projectInfo, daemonHealthRes?.data?.data);
    const projectRoot = runtimeBoundary.project.projectRoot || '';
    const projectName = firstString(projectInfo.projectName) || '';

    return {
      rootSpec: {},
      recipes,
      candidates,
      projectRoot,
      projectName,
      watcherStatus: watcherStatusFromRuntime(runtimeBoundary),
      runtimeBoundary,
      aiConfig: { provider: aiConfig.provider || '', model: aiConfig.model || '' },
      idTitleMap,
    };
  },

  // ── Misc ────────────────────────────────────────────

  /** Stub — not fully implemented */
  async insertAtSearchMark(_data: Record<string, unknown>): Promise<{ success: boolean }> {
    return { success: false };
  },
};
