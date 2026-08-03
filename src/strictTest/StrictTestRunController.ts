/**
 * strict-test 的 project-scoped durable authority 控制器。
 *
 * 它只保存恢复同一 run 所需的四个字段；phase、terminal、report 等事实每次都
 * 从 Main status/report 回读。前端不合成完成态，也不会在恢复失败时创建第二 run。
 */

import type {
  DashboardStrictTestPreflightPublicDtoV1,
  DashboardStrictTestProblemDetailV1,
  DashboardStrictTestReportPublicDtoV1,
  DashboardStrictTestRunStatusPublicDtoV1,
} from '../generated/api-types';
import {
  isStrictTestApiProblem,
  type StrictTestApiClient,
  type StrictTestApiProblem,
} from '../api/strictTest';

export const STRICT_TEST_DEMAND_KEY = 'dashboard-strict-test-dimension';

export interface StrictTestRunAuthority {
  demandKey: typeof STRICT_TEST_DEMAND_KEY;
  projectRoot: string;
  runId: string;
  preflightHash: string;
}

export interface StrictTestProblemView {
  status: number | null;
  code: string;
  message: string;
  reasonCode: string;
  retryable: boolean;
}

export type StrictTestRunStateKind =
  | 'idle'
  | 'preflight'
  | 'starting'
  | 'running'
  | 'terminal'
  | 'error';

export interface StrictTestRunState {
  kind: StrictTestRunStateKind;
  authority: StrictTestRunAuthority | null;
  preflight: DashboardStrictTestPreflightPublicDtoV1 | null;
  status: DashboardStrictTestRunStatusPublicDtoV1 | null;
  report: DashboardStrictTestReportPublicDtoV1 | null;
  problem: StrictTestProblemView | null;
}

export interface StrictTestStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface StrictTestRunControllerOptions {
  api: StrictTestApiClient;
  storage: StrictTestStorage;
  randomUUID: () => string;
  sleep?: (milliseconds: number) => Promise<void>;
  pollIntervalMs?: number;
  onStateChange?: (state: StrictTestRunState) => void;
}

const IDLE_STATE: StrictTestRunState = {
  kind: 'idle',
  authority: null,
  preflight: null,
  status: null,
  report: null,
  problem: null,
};

class StrictTestStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StrictTestStateError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isTerminalStatus(status: DashboardStrictTestRunStatusPublicDtoV1 | null): boolean {
  return status?.terminal?.terminalState === 'STRICT_TEST_COMPLETED_PRIVATE' ||
    status?.terminal?.terminalState === 'STRICT_TEST_FAILED';
}

function storageKey(projectRoot: string): string {
  return `alembic:strict-test:authority:${encodeURIComponent(projectRoot)}`;
}

function problemView(error: unknown): StrictTestProblemView {
  if (isStrictTestApiProblem(error)) {
    return {
      status: error.status,
      code: error.problem.code,
      message: error.problem.message,
      reasonCode: error.problem.reasonCode,
      retryable: error.problem.retryable,
    };
  }
  if (error instanceof Error) {
    return {
      status: null,
      code: error.name || 'STRICT_TEST_DASHBOARD_ERROR',
      message: error.message,
      reasonCode: 'dashboard-fail-closed',
      retryable: false,
    };
  }
  return {
    status: null,
    code: 'STRICT_TEST_UNKNOWN_ERROR',
    message: 'Strict test failed closed because the error shape was not recognized.',
    reasonCode: 'dashboard-fail-closed',
    retryable: false,
  };
}

export class StrictTestRunController {
  private readonly api: StrictTestApiClient;
  private readonly storage: StrictTestStorage;
  private readonly randomUUID: () => string;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly pollIntervalMs: number;
  private readonly onStateChange?: (state: StrictTestRunState) => void;
  private state: StrictTestRunState = IDLE_STATE;
  private activePromise: Promise<StrictTestRunState> | null = null;
  private generation = 0;
  private disposed = false;

  constructor(options: StrictTestRunControllerOptions) {
    this.api = options.api;
    this.storage = options.storage;
    this.randomUUID = options.randomUUID;
    this.sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => {
      window.setTimeout(resolve, milliseconds);
    }));
    this.pollIntervalMs = options.pollIntervalMs ?? 1_000;
    this.onStateChange = options.onStateChange;
  }

  getState(): StrictTestRunState {
    return this.state;
  }

  dispose(): void {
    this.disposed = true;
    this.generation += 1;
  }

  start(projectRoot: string): Promise<StrictTestRunState> {
    if (this.activePromise) {
      console.info('[strict-test] duplicate start suppressed', {
        runId: this.state.authority?.runId ?? null,
        phase: this.state.status?.phase ?? this.state.kind,
      });
      return this.activePromise;
    }

    const generation = ++this.generation;
    const operation = this.startNewRun(projectRoot, generation).finally(() => {
      if (this.activePromise === operation) {
        this.activePromise = null;
      }
    });
    this.activePromise = operation;
    return operation;
  }

  restore(projectRoot: string): Promise<StrictTestRunState> {
    if (this.activePromise) {
      return this.activePromise;
    }
    const generation = ++this.generation;
    const operation = this.restoreRun(projectRoot, generation).finally(() => {
      if (this.activePromise === operation) {
        this.activePromise = null;
      }
    });
    this.activePromise = operation;
    return operation;
  }

  private setState(next: StrictTestRunState): void {
    this.state = next;
    if (!this.disposed) {
      this.onStateChange?.(next);
    }
  }

  private setError(error: unknown, retained?: Partial<StrictTestRunState>): StrictTestRunState {
    const projected = problemView(error);
    console.error('[strict-test] state machine failed closed', {
      status: projected.status,
      code: projected.code,
      reasonCode: projected.reasonCode,
      runId: retained?.authority?.runId ?? this.state.authority?.runId ?? null,
    });
    const next: StrictTestRunState = {
      kind: 'error',
      authority: retained?.authority ?? this.state.authority,
      preflight: retained?.preflight ?? this.state.preflight,
      status: retained?.status ?? this.state.status,
      report: retained?.report ?? this.state.report,
      problem: projected,
    };
    this.setState(next);
    return next;
  }

  private persistAuthority(authority: StrictTestRunAuthority): void {
    try {
      this.storage.setItem(storageKey(authority.projectRoot), JSON.stringify(authority));
    } catch (err: unknown) {
      console.error('[strict-test] authority persistence failed', {
        runId: authority.runId,
        errorName: err instanceof Error ? err.name : 'unknown',
      });
      throw new StrictTestStateError(
        'Strict-test authority could not be persisted; the run was not started.',
      );
    }
  }

  private readAuthority(projectRoot: string): StrictTestRunAuthority | null {
    let raw: string | null;
    try {
      raw = this.storage.getItem(storageKey(projectRoot));
    } catch (err: unknown) {
      console.error('[strict-test] authority restore read failed', {
        errorName: err instanceof Error ? err.name : 'unknown',
      });
      throw new StrictTestStateError('Strict-test authority storage is unavailable.');
    }
    if (!raw) {
      return null;
    }

    try {
      const parsed: unknown = JSON.parse(raw);
      if (
        !isRecord(parsed) ||
        parsed.demandKey !== STRICT_TEST_DEMAND_KEY ||
        parsed.projectRoot !== projectRoot ||
        !isNonEmptyString(parsed.runId) ||
        !isNonEmptyString(parsed.preflightHash) ||
        Object.keys(parsed).sort().join('\0') !==
          ['demandKey', 'preflightHash', 'projectRoot', 'runId'].sort().join('\0')
      ) {
        throw new StrictTestStateError('Stored strict-test authority is invalid or project-mismatched.');
      }
      return {
        demandKey: STRICT_TEST_DEMAND_KEY,
        projectRoot,
        runId: parsed.runId,
        preflightHash: parsed.preflightHash,
      };
    } catch (err: unknown) {
      console.error('[strict-test] stored authority rejected', {
        errorName: err instanceof Error ? err.name : 'unknown',
      });
      try {
        this.storage.removeItem(storageKey(projectRoot));
      } catch {
        // The invalid value remains observable through the error state when storage is unavailable.
      }
      if (err instanceof StrictTestStateError) {
        throw err;
      }
      throw new StrictTestStateError('Stored strict-test authority is not valid JSON.');
    }
  }

  private assertStatusAuthority(
    authority: StrictTestRunAuthority,
    preflight: DashboardStrictTestPreflightPublicDtoV1 | null,
    status: DashboardStrictTestRunStatusPublicDtoV1,
  ): void {
    if (
      status.demandKey !== authority.demandKey ||
      status.runId !== authority.runId ||
      status.preflightHash !== authority.preflightHash
    ) {
      throw new StrictTestStateError('Status authority does not match the persisted strict-test run.');
    }
    if (
      preflight &&
      status.automaticSelection &&
      status.automaticSelection.selectedDimensionId !== preflight.recommendation.dimensionId
    ) {
      throw new StrictTestStateError(
        'Backend automatic selection does not match the preflight recommendation.',
      );
    }
    if (
      status.terminal &&
      (status.terminal.productionFinalized !== false || status.terminal.publicRouteChanged !== false)
    ) {
      throw new StrictTestStateError('Strict-test terminal attempted to claim a production/public mutation.');
    }
  }

  private applyStatus(
    authority: StrictTestRunAuthority,
    preflight: DashboardStrictTestPreflightPublicDtoV1 | null,
    status: DashboardStrictTestRunStatusPublicDtoV1,
  ): void {
    this.assertStatusAuthority(authority, preflight, status);
    if (isTerminalStatus(this.state.status) && !isTerminalStatus(status)) {
      console.info('[strict-test] stale non-terminal status ignored', {
        runId: authority.runId,
        incomingPhase: status.phase,
        terminalPhase: this.state.status?.phase ?? null,
      });
      return;
    }
    this.setState({
      kind: isTerminalStatus(status) ? 'terminal' : 'running',
      authority,
      preflight,
      status,
      report: this.state.report,
      problem: null,
    });
  }

  private assertReportAuthority(
    authority: StrictTestRunAuthority,
    status: DashboardStrictTestRunStatusPublicDtoV1,
    report: DashboardStrictTestReportPublicDtoV1,
  ): void {
    const selection = status.automaticSelection;
    if (
      report.demandKey !== authority.demandKey ||
      report.runId !== authority.runId ||
      report.preflightHash !== authority.preflightHash ||
      report.terminalHash !== status.terminal?.terminalHash ||
      report.reportHash !== status.reportHash ||
      report.terminalState !== status.terminal?.terminalState ||
      report.productionFinalized !== false ||
      report.publicRouteChanged !== false ||
      (selection && report.automaticSelectionHash !== selection.automaticSelectionHash) ||
      (selection && report.projectionHash !== selection.projectionHash) ||
      (selection && report.executedProjection?.dimensionId !== selection.selectedDimensionId) ||
      (selection && report.executedProjection?.cellSetHash !== selection.selectedCellSetHash)
    ) {
      throw new StrictTestStateError('Report authority does not match the durable strict-test status.');
    }
  }

  private async readReport(
    authority: StrictTestRunAuthority,
    preflight: DashboardStrictTestPreflightPublicDtoV1 | null,
    status: DashboardStrictTestRunStatusPublicDtoV1,
  ): Promise<StrictTestRunState> {
    const report = await this.api.report(authority.runId);
    this.assertReportAuthority(authority, status, report);
    const next: StrictTestRunState = {
      kind: 'terminal',
      authority,
      preflight,
      status,
      report,
      problem: null,
    };
    this.setState(next);
    return next;
  }

  private async pollUntilTerminal(
    authority: StrictTestRunAuthority,
    preflight: DashboardStrictTestPreflightPublicDtoV1 | null,
    generation: number,
  ): Promise<DashboardStrictTestRunStatusPublicDtoV1> {
    while (generation === this.generation) {
      await this.sleep(this.pollIntervalMs);
      if (generation !== this.generation) {
        throw new StrictTestStateError('Strict-test polling was superseded.');
      }
      if (isTerminalStatus(this.state.status)) {
        return this.state.status as DashboardStrictTestRunStatusPublicDtoV1;
      }
      const status = await this.api.status(authority.runId);
      if (generation !== this.generation) {
        throw new StrictTestStateError('Strict-test status arrived after the run was superseded.');
      }
      this.applyStatus(authority, preflight, status);
      if (isTerminalStatus(status)) {
        return status;
      }
    }
    throw new StrictTestStateError('Strict-test polling stopped without a terminal status.');
  }

  private async startNewRun(
    projectRoot: string,
    generation: number,
  ): Promise<StrictTestRunState> {
    if (!isNonEmptyString(projectRoot)) {
      return this.setError(new StrictTestStateError(
        'A provider-issued projectRoot is required before strict test can start.',
      ));
    }

    const runId = this.randomUUID();
    this.setState({ ...IDLE_STATE, kind: 'preflight' });
    try {
      const preflight = await this.api.preflight({
        demandKey: STRICT_TEST_DEMAND_KEY,
        projectRoot,
        runId,
      }, projectRoot);
      if (
        preflight.demandKey !== STRICT_TEST_DEMAND_KEY ||
        preflight.runId !== runId ||
        preflight.canAutoSelect !== true
      ) {
        throw new StrictTestStateError(
          'Preflight did not authorize exactly one backend automatic selection.',
        );
      }

      const authority: StrictTestRunAuthority = {
        demandKey: STRICT_TEST_DEMAND_KEY,
        projectRoot,
        runId,
        preflightHash: preflight.preflightHash,
      };
      this.persistAuthority(authority);
      this.setState({
        kind: 'starting',
        authority,
        preflight,
        status: null,
        report: null,
        problem: null,
      });

      // POST /runs 可能持续较久；轮询从同一 authority 并发开始，不能等待 POST 返回后才观察。
      const pollOutcome = this.pollUntilTerminal(authority, preflight, generation)
        .then((status) => ({ status, error: null as unknown }))
        .catch((error: unknown) => ({ status: null, error }));

      let startStatus: DashboardStrictTestRunStatusPublicDtoV1;
      try {
        startStatus = await this.api.start({
          demandKey: STRICT_TEST_DEMAND_KEY,
          preflightHash: authority.preflightHash,
          runId: authority.runId,
        });
      } catch (err: unknown) {
        if (isStrictTestApiProblem(err) && err.durableStatus) {
          this.applyStatus(authority, preflight, err.durableStatus);
          startStatus = err.durableStatus;
        } else {
          throw err;
        }
      }

      // 即使并发 status 已先到 terminal，长请求自身的返回也必须属于同一权威；
      // 不能因为已有终态就跳过 start response 的 recommendation/run 校验。
      this.assertStatusAuthority(authority, preflight, startStatus);
      if (!isTerminalStatus(this.state.status)) {
        this.applyStatus(authority, preflight, startStatus);
      }
      let terminal = isTerminalStatus(this.state.status) ? this.state.status : null;
      if (!terminal) {
        const polled = await pollOutcome;
        if (polled.error) {
          throw polled.error;
        }
        terminal = polled.status;
      }
      if (!terminal || !isTerminalStatus(terminal)) {
        throw new StrictTestStateError('Strict test ended without an authoritative terminal status.');
      }
      return await this.readReport(authority, preflight, terminal);
    } catch (err: unknown) {
      if (generation === this.generation) {
        this.generation += 1;
      }
      return this.setError(err);
    }
  }

  private async restoreRun(
    projectRoot: string,
    generation: number,
  ): Promise<StrictTestRunState> {
    if (!isNonEmptyString(projectRoot)) {
      return this.setError(new StrictTestStateError(
        'A provider-issued projectRoot is required before strict test can restore.',
      ));
    }
    try {
      const authority = this.readAuthority(projectRoot);
      if (!authority) {
        this.setState(IDLE_STATE);
        return this.state;
      }
      this.setState({
        kind: 'running',
        authority,
        preflight: null,
        status: null,
        report: null,
        problem: null,
      });
      const current = await this.api.status(authority.runId);
      this.applyStatus(authority, null, current);
      const terminal = isTerminalStatus(current)
        ? current
        : await this.pollUntilTerminal(authority, null, generation);
      return await this.readReport(authority, null, terminal);
    } catch (err: unknown) {
      if (generation === this.generation) {
        this.generation += 1;
      }
      return this.setError(err);
    }
  }
}

export type { DashboardStrictTestProblemDetailV1, StrictTestApiProblem };
