import type { AgentEfficiencySummary, BootstrapReport, DaemonJobSummary } from '../api';

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

export function normalizeEfficiencySummary(value: unknown): AgentEfficiencySummary | null {
  if (!isRecord(value)) {
    return null;
  }

  const tokenUsage = isRecord(value.tokenUsage) ? value.tokenUsage : {};
  const summary: AgentEfficiencySummary = {
    toolCalls: finiteNumber(value.toolCalls),
    duplicateToolCalls: finiteNumber(value.duplicateToolCalls),
    cacheHits: finiteNumber(value.cacheHits),
    cacheMisses: finiteNumber(value.cacheMisses),
    tokenUsage: {
      input: finiteNumber(tokenUsage.input),
      output: finiteNumber(tokenUsage.output),
      reasoning: finiteNumber(tokenUsage.reasoning),
      cacheHit: finiteNumber(tokenUsage.cacheHit),
    },
    maxCompactionLevel: finiteNumber(value.maxCompactionLevel),
    totalCompactedItems: finiteNumber(value.totalCompactedItems),
    nudgeCount: finiteNumber(value.nudgeCount),
    replanCount: finiteNumber(value.replanCount),
    emptyRetries: finiteNumber(value.emptyRetries),
    forcedSummary: value.forcedSummary === true,
    cancelReason: stringValue(value.cancelReason),
  };

  const hasMetric = [
    summary.toolCalls,
    summary.duplicateToolCalls,
    summary.cacheHits,
    summary.cacheMisses,
    summary.tokenUsage?.input,
    summary.tokenUsage?.output,
    summary.tokenUsage?.reasoning,
    summary.tokenUsage?.cacheHit,
    summary.maxCompactionLevel,
    summary.totalCompactedItems,
    summary.nudgeCount,
    summary.replanCount,
    summary.emptyRetries,
  ].some((value) => typeof value === 'number') || summary.forcedSummary || Boolean(summary.cancelReason);

  return hasMetric ? summary : null;
}

export function getJobEfficiency(summary?: DaemonJobSummary): AgentEfficiencySummary | null {
  return normalizeEfficiencySummary(summary?.efficiency);
}

export function getReportEfficiency(report?: BootstrapReport | null): AgentEfficiencySummary | null {
  if (!report) {
    return null;
  }

  return (
    normalizeEfficiencySummary(report.efficiency) ||
    normalizeEfficiencySummary(report.totals?.efficiency) ||
    normalizeEfficiencySummary(report.session?.efficiency)
  );
}

export function getReportDimensionEfficiencies(
  report?: BootstrapReport | null
): Array<{ dimensionId: string; efficiency: AgentEfficiencySummary }> {
  if (!report?.dimensions) {
    return [];
  }

  return Object.entries(report.dimensions)
    .map(([dimensionId, dimension]) => ({
      dimensionId,
      efficiency: normalizeEfficiencySummary(dimension.efficiency),
    }))
    .filter((entry): entry is { dimensionId: string; efficiency: AgentEfficiencySummary } =>
      entry.efficiency !== null
    );
}
