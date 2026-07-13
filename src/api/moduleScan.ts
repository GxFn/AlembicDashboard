import type { GuardAuditResult, ScannedFile } from '../types';

const MODULE_SCAN_PROJECTION_AUTHORITY = 'persisted-knowledge-submit-results-only' as const;

export type ModuleScanOutcomeStatus = 'completed' | 'empty' | 'failed' | 'partial' | 'skipped';

export interface ModuleScanRecipe extends Record<string, unknown> {
  id: string;
  candidateId: string;
  status: 'created';
  lifecycle: 'pending' | 'staging';
}

export interface ModuleScanError {
  code: string;
  message: string;
  batch?: string;
  operationMayContinue?: boolean;
}

export interface ModuleScanBatchOutcome {
  batch: string;
  fileCount: number;
  recipeCount: number;
  persistenceOutcome: string;
  diagnostics: Record<string, unknown> | null;
  error: ModuleScanError | null;
}

export interface ModuleScanNormalizationIssue {
  code:
    | 'outcome-invalid'
    | 'outcome-recipe-inconsistent'
    | 'projection-authority-invalid'
    | 'recipe-invalid'
    | 'recipe-status-invalid'
    | 'recipe-lifecycle-invalid'
    | 'recipe-id-blank'
    | 'recipe-id-mismatch';
  message: string;
  recipeIndex?: number;
}

export interface ModuleScanProjectResult {
  targets: string[];
  recipes: ModuleScanRecipe[];
  guardAudit: GuardAuditResult | null;
  scannedFiles: ScannedFile[];
  partial: boolean;
  errors: ModuleScanError[];
  outcome: {
    status: ModuleScanOutcomeStatus;
    recipeCount: number;
    projectionAuthority: typeof MODULE_SCAN_PROJECTION_AUTHORITY | string;
    batches: ModuleScanBatchOutcome[];
    reason?: string;
  };
  message?: string;
  normalizationIssues: ModuleScanNormalizationIssue[];
}

export interface ModuleScanViewModel {
  status: ModuleScanOutcomeStatus;
  reviewableRecipeCount: number;
  errorCount: number;
  batchCount: number;
  operationMayContinue: boolean;
  reason: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function numberValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function normalizeError(value: unknown): ModuleScanError | null {
  if (!isRecord(value)) return null;
  const code = stringValue(value.code);
  const message = stringValue(value.message);
  if (!code || !message) return null;
  const batch = stringValue(value.batch);
  return {
    code,
    message,
    ...(batch ? { batch } : {}),
    ...(value.operationMayContinue === true ? { operationMayContinue: true } : {}),
  };
}

function normalizeBatch(value: unknown): ModuleScanBatchOutcome | null {
  if (!isRecord(value)) return null;
  const error = normalizeError(value.error);
  return {
    batch: stringValue(value.batch) || 'unknown-batch',
    fileCount: numberValue(value.fileCount),
    recipeCount: numberValue(value.recipeCount),
    persistenceOutcome: stringValue(value.persistenceOutcome) || 'unknown',
    diagnostics: isRecord(value.diagnostics) ? value.diagnostics : null,
    error,
  };
}

function normalizeScannedFile(value: unknown): ScannedFile | null {
  if (!isRecord(value)) return null;
  const name = stringValue(value.name);
  const path = stringValue(value.path);
  if (!name || !path) return null;
  const targetName = stringValue(value.targetName);
  return { name, path, ...(targetName ? { targetName } : {}) };
}

function normalizeRecipe(
  value: unknown,
  recipeIndex: number,
  issues: ModuleScanNormalizationIssue[],
): ModuleScanRecipe | null {
  if (!isRecord(value)) {
    issues.push({
      code: 'recipe-invalid',
      message: `Recipe result ${recipeIndex + 1} is not an object.`,
      recipeIndex,
    });
    return null;
  }
  if (value.status !== 'created') {
    issues.push({
      code: 'recipe-status-invalid',
      message: `Recipe result ${recipeIndex + 1} was not created by the authoritative producer.`,
      recipeIndex,
    });
    return null;
  }
  if (value.lifecycle !== 'pending' && value.lifecycle !== 'staging') {
    issues.push({
      code: 'recipe-lifecycle-invalid',
      message: `Recipe result ${recipeIndex + 1} is not pending or staging.`,
      recipeIndex,
    });
    return null;
  }
  const id = stringValue(value.id);
  const candidateId = stringValue(value.candidateId);
  if (!id || !candidateId) {
    issues.push({
      code: 'recipe-id-blank',
      message: `Recipe result ${recipeIndex + 1} is missing an existing ID.`,
      recipeIndex,
    });
    return null;
  }
  if (id !== candidateId) {
    issues.push({
      code: 'recipe-id-mismatch',
      message: `Recipe result ${recipeIndex + 1} has mismatched existing IDs.`,
      recipeIndex,
    });
    return null;
  }
  return {
    ...value,
    id,
    candidateId,
    status: 'created',
    lifecycle: value.lifecycle,
  };
}

function outcomeStatus(value: unknown): ModuleScanOutcomeStatus | null {
  return value === 'completed' || value === 'empty' || value === 'failed' ||
    value === 'partial' || value === 'skipped'
    ? value
    : null;
}

/**
 * Normalize the Alembic P10 ModuleScanProjectResult without guessing IDs or
 * treating a successful HTTP response/scanned file list as Recipe production.
 */
export function normalizeModuleScanProjectResult(value: unknown): ModuleScanProjectResult {
  const data = isRecord(value) ? value : {};
  const outcome = isRecord(data.outcome) ? data.outcome : {};
  const issues: ModuleScanNormalizationIssue[] = [];
  const status = outcomeStatus(outcome.status);
  if (!status) {
    issues.push({
      code: 'outcome-invalid',
      message: 'Module scan response is missing a recognized outcome status.',
    });
  }
  const projectionAuthority = stringValue(outcome.projectionAuthority);
  if (projectionAuthority !== MODULE_SCAN_PROJECTION_AUTHORITY) {
    issues.push({
      code: 'projection-authority-invalid',
      message: 'Module scan response is not backed by persisted knowledge submit results.',
    });
  }

  const normalizedRecipes = (Array.isArray(data.recipes) ? data.recipes : [])
    .map((item, index) => normalizeRecipe(item, index, issues))
    .filter((item): item is ModuleScanRecipe => item !== null);
  const outcomeAllowsReviewer = status === 'completed' || status === 'partial';
  if (normalizedRecipes.length > 0 && !outcomeAllowsReviewer) {
    issues.push({
      code: 'outcome-recipe-inconsistent',
      message: 'Module scan returned Recipes for an outcome that cannot enter review.',
    });
  }
  const recipes = projectionAuthority === MODULE_SCAN_PROJECTION_AUTHORITY && outcomeAllowsReviewer
    ? normalizedRecipes
    : [];
  const batches = (Array.isArray(outcome.batches) ? outcome.batches : [])
    .map(normalizeBatch)
    .filter((item): item is ModuleScanBatchOutcome => item !== null);
  const errors = (Array.isArray(data.errors) ? data.errors : [])
    .map(normalizeError)
    .filter((item): item is ModuleScanError => item !== null);
  const scannedFiles = (Array.isArray(data.scannedFiles) ? data.scannedFiles : [])
    .map(normalizeScannedFile)
    .filter((item): item is ScannedFile => item !== null);
  const reason = stringValue(outcome.reason);
  const message = stringValue(data.message);

  return {
    targets: (Array.isArray(data.targets) ? data.targets : [])
      .map(stringValue)
      .filter(Boolean),
    recipes,
    guardAudit: isRecord(data.guardAudit) ? data.guardAudit as unknown as GuardAuditResult : null,
    scannedFiles,
    partial: data.partial === true,
    errors,
    outcome: {
      status: status || 'failed',
      recipeCount: numberValue(outcome.recipeCount),
      projectionAuthority,
      batches,
      ...(reason ? { reason } : {}),
    },
    ...(message ? { message } : {}),
    normalizationIssues: issues,
  };
}

/** User-visible state is domain outcome plus local contract validation. */
export function buildModuleScanViewModel(result: ModuleScanProjectResult): ModuleScanViewModel {
  const status = result.normalizationIssues.length > 0
    ? result.recipes.length > 0 ? 'partial' : 'failed'
    : result.outcome.status;
  const batchErrors = result.outcome.batches
    .map((batch) => batch.error)
    .filter((error): error is ModuleScanError => error !== null);
  return {
    status,
    reviewableRecipeCount: result.recipes.length,
    errorCount: result.errors.length + result.normalizationIssues.length,
    batchCount: result.outcome.batches.length,
    operationMayContinue: [...result.errors, ...batchErrors]
      .some((error) => error.operationMayContinue === true),
    reason: result.outcome.reason || null,
  };
}
