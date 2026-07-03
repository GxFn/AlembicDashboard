/**
 * projects — /projects 路由族：项目运行时控制快照/动作与 source-of-truth 诊断归一化
 * （W7-f 自 api.ts 拆出）。
 */

import {
  asRuntimeRecord,
  booleanOrFalse,
  booleanOrNull,
  fallbackDisplayName,
  firstNumber,
  firstString,
  http,
  isPrivateProviderFieldKey,
  providerDataRecord,
  recordArray,
  stringArray,
  stripPrivateProviderFields,
  type UnknownRecord,
} from './client';
import type {
  DashboardProjectActionResult,
  DashboardProjectRuntimeControlDiagnostic,
  DashboardProjectRuntimeControlSource,
  DashboardProjectRuntimeControlState,
  DashboardProjectRuntimeControlStateCleanup,
  DashboardProjectRuntimeDaemonSummary,
  DashboardProjectRuntimeFailureEnvelope,
  DashboardProjectRuntimeFlags,
  DashboardProjectRuntimeHandoff,
  DashboardProjectRuntimeProjectRef,
  DashboardProjectRuntimeReadiness,
  DashboardProjectRuntimeScopeSummary,
  DashboardProjectRuntimeSourceOfTruth,
  DashboardProjectsSnapshot,
} from '../types';


function normalizeProjectRuntimeControlState(value: unknown): DashboardProjectRuntimeControlState {
  const record = asRuntimeRecord(value) ?? {};
  return {
    activeProjectId: firstString(record.activeProjectId),
    activeProjectRoot: firstString(record.activeProjectRoot),
    schemaVersion: firstNumber(record.schemaVersion),
    selectedAt: firstString(record.selectedAt),
    selectedProjectId: firstString(record.selectedProjectId),
    selectedProjectRoot: firstString(record.selectedProjectRoot),
    updatedAt: firstString(record.updatedAt),
  };
}

function normalizeProjectRuntimeDaemon(value: unknown): DashboardProjectRuntimeDaemonSummary {
  const record = asRuntimeRecord(value) ?? {};
  return {
    dashboardUrl: firstString(record.dashboardUrl),
    message: firstString(record.message),
    pid: firstNumber(record.pid),
    pidAlive: booleanOrNull(record.pidAlive),
    ready: booleanOrNull(record.ready),
    status: firstString(record.status) ?? 'unknown',
    url: firstString(record.url),
  };
}

function normalizeProjectRuntimeFlags(value: unknown): DashboardProjectRuntimeFlags {
  const record = asRuntimeRecord(value) ?? {};
  return {
    activeRuntime: booleanOrFalse(record.activeRuntime),
    missing: booleanOrFalse(record.missing),
    selected: booleanOrFalse(record.selected),
    stale: booleanOrFalse(record.stale),
    unavailable: booleanOrFalse(record.unavailable),
  };
}

const PROJECT_RUNTIME_DIAGNOSTIC_KNOWN_FIELDS = new Set([
  'action',
  'code',
  'detailRefs',
  'message',
  'blockingCondition',
  'projectId',
  'projectRoot',
  'reasonCode',
  'severity',
  'source',
  'sourceRefs',
]);

function projectRuntimeDiagnosticExtraFields(record: UnknownRecord): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(record)
      .filter(([key]) => !PROJECT_RUNTIME_DIAGNOSTIC_KNOWN_FIELDS.has(key) && !isPrivateProviderFieldKey(key))
      .map(([key, nestedValue]) => [key, stripPrivateProviderFields(nestedValue)]),
  );
}

function normalizeProjectRuntimeDiagnostic(value: unknown): DashboardProjectRuntimeControlDiagnostic | null {
  const record = asRuntimeRecord(value);
  if (!record) {
    return null;
  }

  const reasonCode = firstString(record.reasonCode, record.code) ?? 'unknown';
  const message = firstString(record.message, record.blockingCondition, reasonCode) ?? reasonCode;
  return {
    action: firstString(record.action),
    code: firstString(record.code),
    detailRefs: stringArray(record.detailRefs),
    // Preserve backend diagnostic extensions instead of silently dropping them.
    extraFields: projectRuntimeDiagnosticExtraFields(record),
    message,
    projectId: firstString(record.projectId),
    projectRoot: firstString(record.projectRoot),
    reasonCode,
    severity: firstString(record.severity) ?? 'info',
    source: firstString(record.source),
    sourceRefs: stringArray(record.sourceRefs),
  };
}

function normalizeProjectRuntimeDiagnostics(value: unknown): DashboardProjectRuntimeControlDiagnostic[] {
  return recordArray(value)
    .map(normalizeProjectRuntimeDiagnostic)
    .filter((diagnostic): diagnostic is DashboardProjectRuntimeControlDiagnostic => diagnostic !== null);
}

function normalizeProjectRuntimeStateCleanup(value: unknown): DashboardProjectRuntimeControlStateCleanup {
  const record = asRuntimeRecord(value) ?? {};
  const activeState = asRuntimeRecord(record.activeState) ?? {};
  return {
    activeState: {
      cleaned: activeState.cleaned === true,
      cleanedAt: firstString(activeState.cleanedAt),
      message: firstString(activeState.message),
      previousProjectId: firstString(activeState.previousProjectId),
      previousProjectRoot: firstString(activeState.previousProjectRoot),
      reasonCode: firstString(activeState.reasonCode),
    },
  };
}

function normalizeProjectRuntimeProjectRef(value: unknown): DashboardProjectRuntimeProjectRef | null {
  const record = asRuntimeRecord(value);
  if (!record) {
    return null;
  }
  const projectRoot = firstString(record.projectRoot);
  if (!projectRoot) {
    return null;
  }

  return {
    activeRuntime: booleanOrFalse(record.activeRuntime),
    dataRoot: firstString(record.dataRoot),
    dataRootSource: firstString(record.dataRootSource),
    projectId: firstString(record.projectId),
    projectRoot,
    projectScopeId: firstString(record.projectScopeId),
    ready: booleanOrFalse(record.ready),
    selected: booleanOrFalse(record.selected),
    stale: booleanOrFalse(record.stale),
    status: firstString(record.status) ?? 'unknown',
  };
}

function normalizeProjectRuntimeReadiness(value: unknown): DashboardProjectRuntimeReadiness {
  const record = asRuntimeRecord(value) ?? {};
  const capabilities = asRuntimeRecord(record.capabilities) ?? {};
  const daemon = asRuntimeRecord(record.daemon) ?? {};
  return {
    capabilities: {
      apiAiAvailable: booleanOrNull(capabilities.apiAiAvailable),
      dashboardAvailable: booleanOrNull(capabilities.dashboardAvailable),
      dashboardUrl: firstString(capabilities.dashboardUrl),
      fileMonitorAvailable: booleanOrNull(capabilities.fileMonitorAvailable),
      fileMonitorMode: firstString(capabilities.fileMonitorMode),
      jobsAvailable: booleanOrNull(capabilities.jobsAvailable),
      projectScopeAvailable: booleanOrNull(capabilities.projectScopeAvailable),
    },
    daemon: {
      dashboardUrl: firstString(daemon.dashboardUrl),
      logPath: firstString(daemon.logPath),
      message: firstString(daemon.message),
      pidAlive: booleanOrNull(daemon.pidAlive),
      ready: booleanOrNull(daemon.ready),
      statePath: firstString(daemon.statePath),
      status: firstString(daemon.status) ?? 'unknown',
      url: firstString(daemon.url),
    },
    ready: booleanOrFalse(record.ready),
    reasonCode: firstString(record.reasonCode) ?? 'unknown',
    stale: booleanOrFalse(record.stale),
    status: firstString(record.status) ?? 'unknown',
  };
}

function normalizeProjectRuntimeFailure(
  value: unknown,
): DashboardProjectRuntimeFailureEnvelope | null {
  const record = asRuntimeRecord(value);
  if (!record) {
    return null;
  }

  const reasonCode = firstString(record.reasonCode) ?? 'unknown';
  return {
    blockedFallbacks: stringArray(record.blockedFallbacks),
    blockingCondition: firstString(record.blockingCondition, reasonCode) ?? reasonCode,
    detailRefs: stringArray(record.detailRefs),
    diagnostics: normalizeProjectRuntimeDiagnostics(record.diagnostics),
    nextActions: stringArray(record.nextActions),
    observedSource: firstString(record.observedSource),
    reasonCode,
    retryable: booleanOrNull(record.retryable),
    sourceRefs: stringArray(record.sourceRefs),
  };
}

function normalizeProjectRuntimeControlSource(
  value: unknown,
  fallback: {
    diagnostics: DashboardProjectRuntimeControlDiagnostic[];
    state: DashboardProjectRuntimeControlState;
    stateCleanup: DashboardProjectRuntimeControlStateCleanup;
  },
): DashboardProjectRuntimeControlSource | null {
  const record = asRuntimeRecord(value);
  if (!record) {
    return null;
  }
  const diagnostics = normalizeProjectRuntimeDiagnostics(record.diagnostics);
  const projects = asRuntimeRecord(record.projects) ?? {};
  return {
    activeMatchesCurrentProject: booleanOrNull(record.activeMatchesCurrentProject),
    activeProject: normalizeProjectRuntimeProjectRef(record.activeProject),
    activeReadyProject: normalizeProjectRuntimeProjectRef(record.activeReadyProject),
    activeStateTrusted: booleanOrNull(record.activeStateTrusted),
    diagnostics: diagnostics.length > 0 ? diagnostics : fallback.diagnostics,
    projects: {
      missing: firstNumber(projects.missing),
      ready: firstNumber(projects.ready),
      stale: firstNumber(projects.stale),
      total: firstNumber(projects.total),
      unavailable: firstNumber(projects.unavailable),
    },
    readOnly: booleanOrNull(record.readOnly),
    selectedMatchesCurrentProject: booleanOrNull(record.selectedMatchesCurrentProject),
    selectedProject: normalizeProjectRuntimeProjectRef(record.selectedProject),
    state: record.state ? normalizeProjectRuntimeControlState(record.state) : fallback.state,
    stateCleanup: record.stateCleanup
      ? normalizeProjectRuntimeStateCleanup(record.stateCleanup)
      : fallback.stateCleanup,
    statePath: firstString(record.statePath),
  };
}

function normalizeProjectRuntimeSourceOfTruth(
  value: unknown,
  fallback: {
    diagnostics: DashboardProjectRuntimeControlDiagnostic[];
    state: DashboardProjectRuntimeControlState;
    stateCleanup: DashboardProjectRuntimeControlStateCleanup;
  },
): DashboardProjectRuntimeSourceOfTruth | null {
  const record = asRuntimeRecord(value);
  if (!record) {
    return null;
  }

  const explicitActions = asRuntimeRecord(record.explicitActions) ?? {};
  const operation = asRuntimeRecord(record.operation) ?? {};
  const requiredService = asRuntimeRecord(record.requiredService) ?? {};
  const writePolicy = asRuntimeRecord(record.writePolicy) ?? {};
  const diagnostics = normalizeProjectRuntimeDiagnostics(record.diagnostics);
  return {
    contractVersion: firstNumber(record.contractVersion),
    detailRefs: stringArray(record.detailRefs),
    diagnostics: diagnostics.length > 0 ? diagnostics : fallback.diagnostics,
    explicitActions: {
      daemonLifecycle: stringArray(explicitActions.daemonLifecycle),
      projectScopeRegistry: stringArray(explicitActions.projectScopeRegistry),
      runtimeControl: stringArray(explicitActions.runtimeControl),
    },
    failure: normalizeProjectRuntimeFailure(record.failure),
    generatedAt: firstString(record.generatedAt),
    operation: {
      explicitRuntimeActionRequired: booleanOrNull(operation.explicitRuntimeActionRequired),
      implicitRuntimeActionAllowed: booleanOrNull(operation.implicitRuntimeActionAllowed),
      mode: firstString(operation.mode),
      readOnly: booleanOrNull(operation.readOnly),
    },
    owner: firstString(record.owner),
    readiness: normalizeProjectRuntimeReadiness(record.readiness),
    requiredService: {
      kind: firstString(requiredService.kind),
      owner: firstString(requiredService.owner),
      route: firstString(requiredService.route),
    },
    route: firstString(record.route),
    runtimeControl: normalizeProjectRuntimeControlSource(record.runtimeControl, fallback),
    sourceRefs: stringArray(record.sourceRefs),
    targetProject: normalizeProjectRuntimeProjectRef(record.targetProject),
    writePolicy: {
      activeStateWriteAllowed: booleanOrNull(writePolicy.activeStateWriteAllowed),
      daemonLifecycleWriteAllowed: booleanOrNull(writePolicy.daemonLifecycleWriteAllowed),
      jobStoreWriteAllowed: booleanOrNull(writePolicy.jobStoreWriteAllowed),
      projectScopeRegistryWriteAllowed: booleanOrNull(writePolicy.projectScopeRegistryWriteAllowed),
      selectedStateWriteAllowed: booleanOrNull(writePolicy.selectedStateWriteAllowed),
      writeOwner: firstString(writePolicy.writeOwner),
    },
  };
}

function normalizeProjectRuntimeScope(value: unknown): DashboardProjectRuntimeScopeSummary | null {
  const record = asRuntimeRecord(value);
  if (!record) {
    return null;
  }

  const daemon = normalizeProjectRuntimeDaemon(record.daemon);
  const projectId = firstString(record.projectId, record.id);
  const projectRoot = firstString(record.projectRoot, record.root, record.path) ?? '';
  const ghost = booleanOrFalse(record.ghost);
  return {
    cacheKey: firstString(record.cacheKey, projectId, projectRoot) ?? '',
    dashboardUrl: firstString(record.dashboardUrl, daemon.dashboardUrl),
    dataRoot: firstString(record.dataRoot, projectRoot) ?? '',
    dataRootSource: firstString(record.dataRootSource, ghost ? 'ghost-registry' : null) ?? 'unknown',
    daemon,
    displayName: firstString(record.displayName, record.name, record.label, projectId) ??
      fallbackDisplayName(projectRoot),
    flags: normalizeProjectRuntimeFlags(record.flags),
    ghost,
    mode: firstString(record.mode, ghost ? 'ghost' : null) ?? 'unknown',
    projectExists: booleanOrFalse(record.projectExists),
    projectId,
    projectRealpath: firstString(record.projectRealpath, record.realpath, projectRoot) ?? '',
    projectRoot,
    registered: booleanOrFalse(record.registered),
    runtimeDir: firstString(record.runtimeDir) ?? '',
    status: firstString(record.status) ?? 'unknown',
    workspaceExists: booleanOrFalse(record.workspaceExists),
  };
}

function normalizeNullableProjectRuntimeScope(value: unknown): DashboardProjectRuntimeScopeSummary | null {
  return value === null || value === undefined ? null : normalizeProjectRuntimeScope(value);
}

export function normalizeProjectsSnapshot(value: unknown): DashboardProjectsSnapshot {
  const record = providerDataRecord(value);
  const diagnostics = normalizeProjectRuntimeDiagnostics(record.diagnostics);
  const state = normalizeProjectRuntimeControlState(record.state);
  const stateCleanup = normalizeProjectRuntimeStateCleanup(record.stateCleanup);
  return {
    activeRuntimeProject: normalizeNullableProjectRuntimeScope(record.activeRuntimeProject),
    diagnostics,
    generatedAt: firstString(record.generatedAt),
    projects: recordArray(record.projects)
      .map(normalizeProjectRuntimeScope)
      .filter((project): project is DashboardProjectRuntimeScopeSummary => project !== null),
    selectedProject: normalizeNullableProjectRuntimeScope(record.selectedProject),
    state,
    stateCleanup,
    sourceOfTruth: normalizeProjectRuntimeSourceOfTruth(record.sourceOfTruth, {
      diagnostics,
      state,
      stateCleanup,
    }),
  };
}

function normalizeProjectHandoff(value: unknown): DashboardProjectRuntimeHandoff | null {
  const record = asRuntimeRecord(value);
  if (!record) {
    return null;
  }
  return {
    apiBaseUrl: firstString(record.apiBaseUrl),
    dashboardUrl: firstString(record.dashboardUrl),
    projectId: firstString(record.projectId),
    projectRoot: firstString(record.projectRoot) ?? '',
    status: firstString(record.status) ?? 'unknown',
  };
}

export function normalizeProjectActionResult(value: unknown, fallbackAction: DashboardProjectActionResult['action']): DashboardProjectActionResult {
  const record = asRuntimeRecord(value) ?? {};
  return {
    action: firstString(record.action) ?? fallbackAction,
    error: firstString(record.error),
    deferredStopProject: normalizeNullableProjectRuntimeScope(record.deferredStopProject),
    handoff: normalizeProjectHandoff(record.handoff),
    ok: booleanOrFalse(record.ok),
    previousActiveProject: normalizeNullableProjectRuntimeScope(record.previousActiveProject),
    snapshot: normalizeProjectsSnapshot(record.snapshot),
    stoppedProject: normalizeNullableProjectRuntimeScope(record.stoppedProject),
    targetProject: normalizeNullableProjectRuntimeScope(record.targetProject),
  };
}

async function postProjectAction(
  projectId: string,
  action: 'open-dashboard' | 'switch' | 'stop',
): Promise<DashboardProjectActionResult> {
  const res = await http.post(
    `/projects/${encodeURIComponent(projectId)}/${action}`,
    { waitUntilReadyMs: 10000 },
    { validateStatus: (status) => status < 500 },
  );
  const result = normalizeProjectActionResult(res.data?.data, action);
  if (res.data?.success === false && !result.error) {
    return { ...result, ok: false, error: firstString(res.data?.error) ?? 'Project action failed' };
  }
  return result;
}

export const projectsApi = {
  // ── Projects runtime control (Alembic-owned HTTP contract) ──────

  async getProjectsSnapshot(): Promise<DashboardProjectsSnapshot> {
    const res = await http.get('/projects');
    return normalizeProjectsSnapshot(res.data?.data);
  },

  async getCurrentProjectSnapshot(): Promise<DashboardProjectsSnapshot> {
    const res = await http.get('/projects/current');
    const data = res.data?.data ?? {};
    return normalizeProjectsSnapshot({
      ...data,
      projects: [],
      generatedAt: null,
    });
  },

  async openProjectDashboard(projectId: string): Promise<DashboardProjectActionResult> {
    return postProjectAction(projectId, 'open-dashboard');
  },

  async switchProject(projectId: string): Promise<DashboardProjectActionResult> {
    return postProjectAction(projectId, 'switch');
  },

  async stopProject(projectId: string): Promise<DashboardProjectActionResult> {
    return postProjectAction(projectId, 'stop');
  },
};
