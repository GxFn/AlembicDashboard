import type {
  DashboardProjectRuntimeControlDiagnostic,
  DashboardProjectRuntimeSourceOfTruth,
} from './types';

export interface RuntimeDiagnosticsFieldRow {
  key: string;
  labelKey: string;
  value: string;
  valueKey?: string;
}

const EMPTY_VALUE = '—';

function textValue(value: string | null | undefined): string {
  return value?.trim() || EMPTY_VALUE;
}

function booleanValue(value: boolean | null | undefined): RuntimeDiagnosticsFieldRow['valueKey'] {
  if (value === true) {
    return 'header.projectDiagnosticsValueTrue';
  }
  if (value === false) {
    return 'header.projectDiagnosticsValueFalse';
  }
  return 'header.projectDiagnosticsValueUnknown';
}

function textRow(key: string, labelKey: string, value: string | null | undefined): RuntimeDiagnosticsFieldRow {
  return { key, labelKey, value: textValue(value) };
}

function booleanRow(key: string, labelKey: string, value: boolean | null | undefined): RuntimeDiagnosticsFieldRow {
  return { key, labelKey, value: '', valueKey: booleanValue(value) };
}

export function runtimeDiagnosticsRowValue(row: RuntimeDiagnosticsFieldRow, t: (key: string) => string): string {
  return row.valueKey ? t(row.valueKey) : row.value;
}

export function formatRuntimeDiagnosticExtraValue(value: unknown): string {
  if (value === null || value === undefined) {
    return EMPTY_VALUE;
  }
  if (typeof value === 'string') {
    return textValue(value);
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function buildRuntimeDiagnosticsFieldRows(
  sourceOfTruth: DashboardProjectRuntimeSourceOfTruth,
): RuntimeDiagnosticsFieldRow[] {
  const failure = sourceOfTruth.failure;
  const rows = [
    textRow('readiness-reason', 'header.projectDiagnosticsReason', sourceOfTruth.readiness.reasonCode),
    textRow('readiness-status', 'header.projectDiagnosticsStatus', sourceOfTruth.readiness.status),
    textRow('route', 'header.projectDiagnosticsRoute', sourceOfTruth.route),
    textRow('generated-at', 'header.projectDiagnosticsGeneratedAt', sourceOfTruth.generatedAt),
    textRow('operation-mode', 'header.projectDiagnosticsOperationMode', sourceOfTruth.operation.mode),
    booleanRow('operation-read-only', 'header.projectDiagnosticsOperationReadOnly', sourceOfTruth.operation.readOnly),
    booleanRow(
      'operation-explicit-required',
      'header.projectDiagnosticsExplicitRuntimeActionRequired',
      sourceOfTruth.operation.explicitRuntimeActionRequired,
    ),
    booleanRow(
      'operation-implicit-allowed',
      'header.projectDiagnosticsImplicitRuntimeActionAllowed',
      sourceOfTruth.operation.implicitRuntimeActionAllowed,
    ),
    textRow('required-service-kind', 'header.projectDiagnosticsRequiredServiceKind', sourceOfTruth.requiredService.kind),
    textRow('required-service-owner', 'header.projectDiagnosticsRequiredServiceOwner', sourceOfTruth.requiredService.owner),
    textRow('required-service-route', 'header.projectDiagnosticsRequiredServiceRoute', sourceOfTruth.requiredService.route),
    textRow('write-owner', 'header.projectDiagnosticsWriteOwner', sourceOfTruth.writePolicy.writeOwner),
    booleanRow('write-active-state', 'header.projectDiagnosticsWriteActiveState', sourceOfTruth.writePolicy.activeStateWriteAllowed),
    booleanRow(
      'write-selected-state',
      'header.projectDiagnosticsWriteSelectedState',
      sourceOfTruth.writePolicy.selectedStateWriteAllowed,
    ),
    booleanRow(
      'write-daemon-lifecycle',
      'header.projectDiagnosticsWriteDaemonLifecycle',
      sourceOfTruth.writePolicy.daemonLifecycleWriteAllowed,
    ),
    booleanRow('write-job-store', 'header.projectDiagnosticsWriteJobStore', sourceOfTruth.writePolicy.jobStoreWriteAllowed),
    booleanRow(
      'write-project-scope',
      'header.projectDiagnosticsWriteProjectScope',
      sourceOfTruth.writePolicy.projectScopeRegistryWriteAllowed,
    ),
  ];

  if (!failure) {
    return rows;
  }

  return rows.concat([
    textRow('failure-reason', 'header.projectDiagnosticsFailureReason', failure.reasonCode),
    textRow('failure-blocking-condition', 'header.projectDiagnosticsFailureBlockingCondition', failure.blockingCondition),
    textRow('failure-observed-source', 'header.projectDiagnosticsFailureObservedSource', failure.observedSource),
    booleanRow('failure-retryable', 'header.projectDiagnosticsFailureRetryable', failure.retryable),
  ]);
}

export function buildRuntimeDiagnosticExtraRows(
  diagnostic: DashboardProjectRuntimeControlDiagnostic,
): RuntimeDiagnosticsFieldRow[] {
  return Object.entries(diagnostic.extraFields)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => ({
      key,
      labelKey: key,
      value: formatRuntimeDiagnosticExtraValue(value),
    }));
}
