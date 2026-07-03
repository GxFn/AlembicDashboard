/**
 * problem — D25 失败分类投影 + host-managed 不可用信封（W7-f 自 api.ts 拆出）。
 * 契约测试执行级消费（normalizeDashboardErrorProblem/parseHostManagedUnavailable）。
 */

import { DASHBOARD_FAILURE_KINDS } from '../generated/api-types';
import type { DashboardFailureKind, DashboardProblemDetail } from '../generated/api-types';
import {
  asRuntimeRecord,
  dashboardPublicRecord,
  firstBoolean,
  firstNumber,
  firstString,
  firstStringArray,
  type UnknownRecord,
} from './client';


// Failure-kind vocabulary comes from the generated contract artifact; the
// D25 requirement keeps only the user-routable kinds (diagnostics-only kinds
// stay out of the required projection matrix).
const DASHBOARD_DIAGNOSTIC_ONLY_FAILURE_KINDS: ReadonlySet<DashboardFailureKind> = new Set<DashboardFailureKind>([
  'schema-drift',
  'sensitive-leak',
]);

// `needs-confirmation` (412) was retired with the decision-register removal
// (C9=B, 2026-06-18): no surviving provider produces it, so it is excluded from
// the required projection matrix even though it stays a valid kind in the
// generated taxonomy. Mirrors Core's relaxed CORE_D25_REQUIRED_FAILURE_KINDS.
const DASHBOARD_RETIRED_FAILURE_KINDS: ReadonlySet<DashboardFailureKind> = new Set<DashboardFailureKind>([
  'needs-confirmation',
]);

export const DASHBOARD_D25_REQUIRED_FAILURE_KINDS: readonly DashboardFailureKind[] =
  DASHBOARD_FAILURE_KINDS.filter(
    (kind) => !DASHBOARD_DIAGNOSTIC_ONLY_FAILURE_KINDS.has(kind) && !DASHBOARD_RETIRED_FAILURE_KINDS.has(kind),
  );

const DASHBOARD_FAILURE_KIND_SET = new Set<string>(DASHBOARD_FAILURE_KINDS);

export type { DashboardFailureKind } from '../generated/api-types';

export type DashboardFailureProjectionSource =
  | 'provider-taxonomy'
  | 'mcp-taxonomy'
  | 'agent-taxonomy';

/**
 * Dashboard-normalized projection of the wire problem envelope. The field
 * vocabulary and types come from the generated DashboardProblemDetail; the
 * normalizer only guarantees the fields listed in the intersection below and
 * adds the Dashboard-local provenance tag `source` (which taxonomy surface
 * the projection was recovered from).
 */
export type DashboardErrorProblemProjection = Partial<
  Omit<DashboardProblemDetail, 'artifactRefs' | 'detailRefs' | 'dashboardState' | 'message' | 'privateDataSafe' | 'reasonCode'>
> & {
  artifactRefs: string[];
  detailRefs: string[];
  dashboardState: DashboardFailureKind;
  message: string;
  privateDataSafe: boolean;
  reasonCode: DashboardFailureKind;
  source: DashboardFailureProjectionSource;
};

function normalizeDashboardFailureKind(value: unknown): DashboardFailureKind | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().toLowerCase().replace(/^core\.failure\./, '');
  return DASHBOARD_FAILURE_KIND_SET.has(normalized) ? normalized as DashboardFailureKind : null;
}

function firstDashboardFailureKind(...values: unknown[]): DashboardFailureKind | null {
  for (const value of values) {
    const kind = normalizeDashboardFailureKind(value);
    if (kind) {
      return kind;
    }
  }
  return null;
}

function dashboardProblemCandidateRecords(value: unknown): UnknownRecord[] {
  const root = asRuntimeRecord(value);
  if (!root) {
    return [];
  }

  const data = asRuntimeRecord(root.data);
  const error = asRuntimeRecord(root.error);
  const dataError = asRuntimeRecord(data?.error);
  const details = asRuntimeRecord(root.details) ?? asRuntimeRecord(data?.details);
  const failureTaxonomy =
    asRuntimeRecord(root.failureTaxonomy) ??
    asRuntimeRecord(data?.failureTaxonomy) ??
    asRuntimeRecord(error?.failureTaxonomy) ??
    asRuntimeRecord(dataError?.failureTaxonomy);

  const records = [
    error,
    dataError,
    failureTaxonomy,
    details,
    root,
    data,
  ].filter((record): record is UnknownRecord => record !== null && record !== undefined);

  return records.filter((record, index) => records.indexOf(record) === index);
}

function hasStableDashboardTaxonomy(record: UnknownRecord): boolean {
  return (
    firstDashboardFailureKind(
      record.dashboardState,
      record.reasonCode,
      record.mcpStatus,
      record.failureId,
      record.stableId,
      record.mcpErrorCode,
      record.kind,
    ) !== null &&
    (
      typeof record.failureId === 'string' ||
      typeof record.stableId === 'string' ||
      typeof record.dashboardState === 'string' ||
      typeof record.mcpStatus === 'string' ||
      typeof record.mcpErrorCode === 'string'
    )
  );
}

function firstProblemString(records: UnknownRecord[], key: string): string | undefined {
  for (const record of records) {
    const value = firstString(record[key]);
    if (value) {
      return value;
    }
  }
  return undefined;
}

function firstProblemNumber(records: UnknownRecord[], key: string): number | undefined {
  for (const record of records) {
    const value = firstNumber(record[key]);
    if (typeof value === 'number') {
      return value;
    }
  }
  return undefined;
}

function firstProblemBoolean(records: UnknownRecord[], key: string): boolean | undefined {
  for (const record of records) {
    const value = firstBoolean(record[key]);
    if (typeof value === 'boolean') {
      return value;
    }
  }
  return undefined;
}

function firstProblemStringArray(records: UnknownRecord[], key: string): string[] {
  for (const record of records) {
    const value = firstStringArray(record[key]);
    if (value.length > 0) {
      return value;
    }
  }
  return [];
}

function dashboardProblemSource(record: UnknownRecord, root: UnknownRecord): DashboardFailureProjectionSource {
  if (root.success === false && asRuntimeRecord(root.error) === record) {
    return 'provider-taxonomy';
  }
  if (root.ok === false || typeof root.toolName === 'string' || asRuntimeRecord(root.structuredContent) !== null) {
    return 'mcp-taxonomy';
  }
  if (
    typeof record.agentBranch === 'string' ||
    typeof record.stableId === 'string' ||
    asRuntimeRecord(root.failureTaxonomy) !== null
  ) {
    return 'agent-taxonomy';
  }
  return 'provider-taxonomy';
}

export function normalizeDashboardErrorProblem(
  value: unknown,
  status?: number,
): DashboardErrorProblemProjection | null {
  const root = asRuntimeRecord(value);
  if (!root) {
    return null;
  }

  const records = dashboardProblemCandidateRecords(root);
  const stableRecord = records.find(hasStableDashboardTaxonomy);
  const stableKind = stableRecord
    ? firstDashboardFailureKind(
        stableRecord.dashboardState,
        stableRecord.reasonCode,
        stableRecord.mcpStatus,
        stableRecord.failureId,
        stableRecord.stableId,
        stableRecord.mcpErrorCode,
        stableRecord.kind,
      )
    : null;
  const reasonCode = stableKind;

  if (!stableRecord || !reasonCode) {
    return null;
  }

  const source = dashboardProblemSource(stableRecord, root);
  const lookupRecords = [stableRecord, ...records];
  const message =
    firstString(stableRecord.message, stableRecord.publicMessage) ??
    firstProblemString(records, 'message') ??
    firstProblemString(records, 'publicMessage') ??
    firstProblemString(lookupRecords, 'summary') ??
    reasonCode;
  const mcpStatus = firstDashboardFailureKind(firstProblemString(lookupRecords, 'mcpStatus')) ?? undefined;
  const privateDataSafe = firstProblemBoolean(lookupRecords, 'privateDataSafe') === true;

  return {
    agentBranch: firstProblemString(lookupRecords, 'agentBranch'),
    artifactRefs: firstProblemStringArray(lookupRecords, 'artifactRefs'),
    canonicalHttpStatus: firstProblemNumber(lookupRecords, 'canonicalHttpStatus'),
    code: firstProblemString(lookupRecords, 'code'),
    dashboardState: firstDashboardFailureKind(firstProblemString(lookupRecords, 'dashboardState')) ?? reasonCode,
    detailExposureClass: firstProblemString(lookupRecords, 'detailExposureClass'),
    detailRefs: firstProblemStringArray(lookupRecords, 'detailRefs'),
    exposureClass: firstProblemString(lookupRecords, 'exposureClass'),
    failureId:
      firstProblemString(lookupRecords, 'failureId') ??
      firstProblemString(lookupRecords, 'stableId') ??
      firstProblemString(lookupRecords, 'mcpErrorCode'),
    failureStatus: firstProblemString(lookupRecords, 'failureStatus') ?? firstProblemString(lookupRecords, 'status'),
    mcpErrorCode: firstProblemString(lookupRecords, 'mcpErrorCode'),
    mcpStatus,
    message,
    privateDataSafe,
    problemClass: firstProblemString(lookupRecords, 'problemClass'),
    reasonCode,
    refPolicy: firstProblemString(lookupRecords, 'refPolicy'),
    retryPolicy: firstProblemString(lookupRecords, 'retryPolicy'),
    retryable: firstProblemBoolean(lookupRecords, 'retryable'),
    source,
    status: firstProblemNumber(lookupRecords, 'status') ?? status,
    taxonomyVersion: firstProblemNumber(lookupRecords, 'taxonomyVersion'),
  };
}

type HostManagedUnavailableCode =
  | 'HOST_AI_MANAGED'
  | 'HOST_AGENT_MANAGED'
  | 'CODEX_HOST_AGENT_MANAGED'
  | 'LOCAL_AI_UNAVAILABLE';

const HOST_MANAGED_UNAVAILABLE_CODES = new Set<string>([
  'HOST_AI_MANAGED',
  'HOST_AGENT_MANAGED',
  'CODEX_HOST_AGENT_MANAGED',
  'LOCAL_AI_UNAVAILABLE',
]);

export interface HostManagedUnavailableDetails {
  code: HostManagedUnavailableCode;
  message: string;
  hostManaged: true;
  hostAgentManaged?: true;
  localAiUnavailable?: true;
  unavailable?: boolean;
  status?: number;
  data?: unknown;
}

export class HostManagedUnavailableError extends Error {
  readonly code: HostManagedUnavailableCode;
  readonly hostManaged = true;
  readonly hostAgentManaged?: true;
  readonly localAiUnavailable?: true;
  readonly unavailable?: boolean;
  readonly status?: number;
  readonly data?: unknown;

  constructor(details: HostManagedUnavailableDetails) {
    super(details.message);
    this.name = 'HostManagedUnavailableError';
    this.code = details.code;
    this.hostAgentManaged = details.hostAgentManaged;
    this.localAiUnavailable = details.localAiUnavailable;
    this.unavailable = details.unavailable;
    this.status = details.status;
    this.data = details.data;
    Object.setPrototypeOf(this, HostManagedUnavailableError.prototype);
  }
}

export function isHostManagedUnavailable(err: unknown): err is HostManagedUnavailableError {
  return err instanceof HostManagedUnavailableError ||
    (typeof err === 'object' &&
      err !== null &&
      (
        ('code' in err && HOST_MANAGED_UNAVAILABLE_CODES.has(String((err as { code?: unknown }).code))) ||
        (err as { hostManaged?: unknown }).hostManaged === true ||
        (err as { hostAgentManaged?: unknown }).hostAgentManaged === true
      ));
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : null;
}

function readString(record: Record<string, unknown> | null, key: string): string | undefined {
  const value = record?.[key];
  return typeof value === 'string' ? value : undefined;
}

function readBoolean(record: Record<string, unknown> | null, key: string): boolean {
  return record?.[key] === true;
}

interface HostManagedPayloadView {
  root: Record<string, unknown> | null;
  data: Record<string, unknown> | null;
  error: Record<string, unknown> | null;
  meta: Record<string, unknown> | null;
  boundary: Record<string, unknown> | null;
}

function hostManagedPayloadView(payload: unknown): HostManagedPayloadView {
  const root = asRecord(payload);
  const data = asRecord(root?.data);
  const error = asRecord(root?.error);
  const meta = asRecord(root?.meta) || asRecord(data?.meta);
  const boundary = asRecord(root?.boundary) || asRecord(data?.boundary) || asRecord(error?.boundary);
  return { root, data, error, meta, boundary };
}

function readFirstHostManagedString(
  fields: Array<[Record<string, unknown> | null, string]>,
): string | undefined {
  for (const [record, key] of fields) {
    const value = readString(record, key);
    if (value) {
      return value;
    }
  }
  return undefined;
}

function readAnyHostManagedBoolean(fields: Array<[Record<string, unknown> | null, string]>): boolean {
  return fields.some(([record, key]) => readBoolean(record, key));
}

function readHostManagedCode(
  view: HostManagedPayloadView,
  taxonomyProblem: DashboardErrorProblemProjection | null,
): string | undefined {
  return taxonomyProblem?.code || readFirstHostManagedString([
    [view.error, 'code'],
    [view.root, 'code'],
    [view.data, 'code'],
    [view.data, 'reason'],
    [view.root, 'canonicalCode'],
    [view.data, 'canonicalCode'],
    [view.root, 'boundaryCode'],
    [view.data, 'boundaryCode'],
    [view.meta, 'boundaryCode'],
    [view.boundary, 'code'],
  ]);
}

function readHostManagedMessage(
  view: HostManagedPayloadView,
  taxonomyProblem: DashboardErrorProblemProjection | null,
  fallbackMessage: string,
): string {
  return taxonomyProblem?.message || readFirstHostManagedString([
    [view.error, 'message'],
    [view.root, 'message'],
    [view.data, 'message'],
  ]) || fallbackMessage;
}

function readHostManagedBy(view: HostManagedPayloadView): string | undefined {
  return readFirstHostManagedString([
    [view.root, 'managedBy'],
    [view.data, 'managedBy'],
    [view.meta, 'managedBy'],
    [view.boundary, 'managedBy'],
  ]);
}

function isTaxonomyHostFailure(taxonomyProblem: DashboardErrorProblemProjection | null): boolean {
  return taxonomyProblem?.dashboardState === 'host-failure' ||
    taxonomyProblem?.reasonCode === 'host-failure' ||
    taxonomyProblem?.agentBranch === 'host-failure' ||
    (typeof taxonomyProblem?.code === 'string' && HOST_MANAGED_UNAVAILABLE_CODES.has(taxonomyProblem.code));
}

function readHostAgentManaged(
  view: HostManagedPayloadView,
  taxonomyProblem: DashboardErrorProblemProjection | null,
  managedBy: string | undefined,
): boolean {
  return taxonomyProblem?.agentBranch === 'host-failure' ||
    taxonomyProblem?.dashboardState === 'host-failure' ||
    readAnyHostManagedBoolean([
      [view.root, 'hostAgentManaged'],
      [view.data, 'hostAgentManaged'],
      [view.meta, 'hostAgentManaged'],
      [view.boundary, 'hostAgentManaged'],
      [view.root, 'hostAiManaged'],
      [view.data, 'hostAiManaged'],
    ]) ||
    managedBy === 'codex-host-agent' ||
    managedBy === 'host-agent';
}

function readLocalAiUnavailable(view: HostManagedPayloadView): boolean {
  return readAnyHostManagedBoolean([
    [view.root, 'localAiUnavailable'],
    [view.data, 'localAiUnavailable'],
    [view.meta, 'localAiUnavailable'],
    [view.boundary, 'localAiUnavailable'],
  ]);
}

function hasHostManagedFlag(view: HostManagedPayloadView): boolean {
  return readAnyHostManagedBoolean([
    [view.root, 'hostManaged'],
    [view.data, 'hostManaged'],
    [view.meta, 'hostManaged'],
    [view.boundary, 'hostManaged'],
  ]);
}

function hasLegacyHostManagedSignal(
  taxonomyProblem: DashboardErrorProblemProjection | null,
  code: string | undefined,
  status: number | undefined,
): boolean {
  const stableTaxonomyPresent = taxonomyProblem !== null;
  return !stableTaxonomyPresent && (
    (typeof code === 'string' && HOST_MANAGED_UNAVAILABLE_CODES.has(code)) ||
    status === 501 ||
    status === 410
  );
}

function normalizeHostManagedUnavailableCode(code: string | undefined): HostManagedUnavailableCode {
  return typeof code === 'string' && HOST_MANAGED_UNAVAILABLE_CODES.has(code)
    ? code as HostManagedUnavailableCode
    : 'HOST_AI_MANAGED';
}

function isHostManagedUnavailableStatus(view: HostManagedPayloadView, status: number | undefined): boolean {
  return readBoolean(view.root, 'unavailable') || readBoolean(view.data, 'unavailable') || status === 501 || status === 410;
}

function hostManagedPublicData(
  view: HostManagedPayloadView,
  taxonomyProblem: DashboardErrorProblemProjection | null,
  payload: unknown,
): unknown {
  return dashboardPublicRecord({
    ...(view.data ?? view.root ?? {}),
    failureTaxonomy: taxonomyProblem ?? undefined,
  }) ?? payload;
}

export function parseHostManagedUnavailable(
  payload: unknown,
  status?: number,
  fallbackMessage = 'This AI capability is managed by the host environment.',
): HostManagedUnavailableDetails | null {
  const taxonomyProblem = normalizeDashboardErrorProblem(payload, status);
  const view = hostManagedPayloadView(payload);
  const code = readHostManagedCode(view, taxonomyProblem);
  const managedBy = readHostManagedBy(view);
  const message = readHostManagedMessage(view, taxonomyProblem, fallbackMessage);
  const hostAgentManaged = readHostAgentManaged(view, taxonomyProblem, managedBy);
  const localAiUnavailable = readLocalAiUnavailable(view);
  const hostManaged =
    isTaxonomyHostFailure(taxonomyProblem) ||
    hasHostManagedFlag(view) ||
    hostAgentManaged ||
    localAiUnavailable ||
    hasLegacyHostManagedSignal(taxonomyProblem, code, status);

  if (!hostManaged) {
    return null;
  }

  return {
    code: normalizeHostManagedUnavailableCode(code),
    message,
    hostManaged: true,
    hostAgentManaged: hostAgentManaged ? true : undefined,
    localAiUnavailable: localAiUnavailable ? true : undefined,
    unavailable: isHostManagedUnavailableStatus(view, status),
    status,
    data: hostManagedPublicData(view, taxonomyProblem, payload),
  };
}

function throwHostManagedIfPayload(payload: unknown, status?: number, fallbackMessage?: string): void {
  const details = parseHostManagedUnavailable(payload, status, fallbackMessage);
  if (details) {
    throw new HostManagedUnavailableError(details);
  }
}

function throwHostManagedFromError(err: unknown, fallbackMessage?: string): never {
  const maybeAxios = asRecord(err);
  const response = asRecord(maybeAxios?.response);
  const status = typeof response?.status === 'number' ? response.status : undefined;
  const data = response?.data;
  throwHostManagedIfPayload(data, status, fallbackMessage);
  throw err;
}

async function readJsonSafely(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
