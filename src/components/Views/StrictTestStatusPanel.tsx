import type { StrictTestRunState } from '../../strictTest/StrictTestRunController';

export interface StrictTestStatusPanelProps {
  state: StrictTestRunState;
}

function valueOrDash(value: string | number | null | undefined): string {
  return value === null || value === undefined || value === '' ? '—' : String(value);
}

export function StrictTestStatusPanel({ state }: StrictTestStatusPanelProps) {
  if (state.kind === 'idle') {
    return null;
  }

  const { preflight, status, report, problem } = state;
  const selection = status?.automaticSelection;
  const terminal = status?.terminal;
  const isBusy = state.kind === 'preflight' || state.kind === 'starting' || state.kind === 'running';

  return (
    <section
      className="mb-4 rounded-xl border border-violet-500/25 bg-[var(--bg-surface)] p-4 shadow-sm"
      data-testid="strict-test-status-panel"
      data-state={state.kind}
      data-phase={status?.phase ?? preflight?.phase ?? state.kind}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${isBusy ? 'animate-pulse bg-violet-500' : terminal?.terminalState === 'STRICT_TEST_FAILED' || problem ? 'bg-red-500' : 'bg-emerald-500'}`} />
            <h3 className="text-sm font-bold text-[var(--fg-primary)]">Strict-test dimension run</h3>
          </div>
          <p className="mt-1 text-xs text-[var(--fg-muted)]">
            Main owns automatic selection, phase, terminal state, and the durable report.
          </p>
        </div>
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-700 dark:text-amber-300">
          <strong>Private strict test only</strong>
          <div className="mt-1 font-mono">productionFinalized=false · publicRouteChanged=false</div>
        </div>
      </div>

      <dl className="mt-4 grid gap-2 text-xs sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg bg-[var(--bg-subtle)] p-2.5">
          <dt className="text-[var(--fg-muted)]">Run</dt>
          <dd className="mt-1 break-all font-mono text-[var(--fg-secondary)]">{valueOrDash(state.authority?.runId)}</dd>
        </div>
        <div className="rounded-lg bg-[var(--bg-subtle)] p-2.5">
          <dt className="text-[var(--fg-muted)]">Authoritative phase</dt>
          <dd className="mt-1 break-words font-semibold text-[var(--fg-secondary)]">{valueOrDash(status?.phase ?? preflight?.phase)}</dd>
        </div>
        <div className="rounded-lg bg-[var(--bg-subtle)] p-2.5">
          <dt className="text-[var(--fg-muted)]">Backend recommendation</dt>
          <dd className="mt-1 break-words font-semibold text-[var(--fg-secondary)]">{valueOrDash(preflight?.recommendation.dimensionId)}</dd>
        </div>
        <div className="rounded-lg bg-[var(--bg-subtle)] p-2.5">
          <dt className="text-[var(--fg-muted)]">Automatically selected</dt>
          <dd className="mt-1 break-words font-semibold text-[var(--fg-secondary)]">{valueOrDash(selection?.selectedDimensionId)}</dd>
        </div>
      </dl>

      {preflight?.fullUniverse && (
        <div className="mt-3 rounded-lg border border-[var(--border-default)] p-3 text-xs text-[var(--fg-secondary)]">
          <strong>Full universe</strong>
          <span className="ml-3">dimensions {preflight.fullUniverse.dimensionCount}</span>
          <span className="ml-3">cells {preflight.fullUniverse.cellCount}</span>
          <span className="ml-3">eligible {preflight.fullUniverse.eligibleCellCount}</span>
          <span className="ml-3">excluded {preflight.fullUniverse.excludedCellCount}</span>
        </div>
      )}

      {problem && (
        <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-700 dark:text-red-300" role="alert">
          <div className="font-bold">{problem.code}{problem.status ? ` · HTTP ${problem.status}` : ''}</div>
          <p className="mt-1">{problem.message}</p>
          <p className="mt-1 opacity-80">Fail closed; no legacy fallback and no second run was started.</p>
        </div>
      )}

      {terminal && (
        <div className={`mt-3 rounded-lg border p-3 text-xs ${terminal.terminalState === 'STRICT_TEST_FAILED' ? 'border-red-500/30 bg-red-500/10' : 'border-emerald-500/30 bg-emerald-500/10'}`}>
          <strong>{terminal.terminalState}</strong>
          {terminal.failedStage && <span className="ml-3">failedStage={terminal.failedStage}</span>}
          {terminal.errorCode && <span className="ml-3">errorCode={terminal.errorCode}</span>}
        </div>
      )}

      {report && (
        <div className="mt-3 grid gap-3 text-xs lg:grid-cols-2" data-testid="strict-test-report">
          <div className="rounded-lg border border-[var(--border-default)] p-3">
            <strong>Canonical report</strong>
            <p className="mt-1 break-all font-mono text-[var(--fg-muted)]">{report.reportHash}</p>
            <p className="mt-2">executed dimension: {valueOrDash(report.executedProjection?.dimensionId)}</p>
            <p>executed cells: {valueOrDash(report.executedProjection?.cellCount)}</p>
            {report.failure && <p className="mt-2 text-red-600">{report.failure.failedStage} · {report.failure.errorCode}</p>}
          </div>
          <div className="rounded-lg border border-[var(--border-default)] p-3">
            <strong>Unexecuted dimensions (no completion inference)</strong>
            <p className="mt-2 break-words text-[var(--fg-muted)]">
              {report.unexecutedDimensionIds?.length ? report.unexecutedDimensionIds.join(', ') : '—'}
            </p>
            <strong className="mt-3 block">Evidence refs</strong>
            <p className="mt-1 break-words text-[var(--fg-muted)]">
              {report.evidenceRefs.length ? report.evidenceRefs.join(', ') : '—'}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}

export default StrictTestStatusPanel;
