/**
 * Main strict-test-dimension 的唯一 Dashboard transport adapter。
 *
 * 请求和实际 HTTP 响应都先经过 Main 生成的 operation validator；任何未声明
 * status 或 schema drift 都在进入 UI 状态机前失败关闭。这里不包含 legacy
 * 冷启动兼容分支，避免 Candidates 入口在失败后悄悄切换执行权威。
 */

import type {
  DashboardApiInputFormatValidators,
  DashboardStrictTestOrdinaryProblemV1,
  DashboardStrictTestPreflightPublicDtoV1,
  DashboardStrictTestPreflightRequestV1,
  DashboardStrictTestPreflightSuccessV1,
  DashboardStrictTestProblemDetailV1,
  DashboardStrictTestReportPublicDtoV1,
  DashboardStrictTestReportSuccessV1,
  DashboardStrictTestRunRequestV1,
  DashboardStrictTestRunStatusPublicDtoV1,
  DashboardStrictTestRunStatusSuccessV1,
  DashboardStrictTestStartProblemV1,
} from '../generated/api-types';
import {
  validateDashboardStrictTestOperationRequest,
  validateDashboardStrictTestOperationResponse,
} from '../generated/api-types';
import { http } from './client';

const CANONICAL_ABSOLUTE_PATH_FORMAT = 'alembic-canonical-absolute-path-v1' as const;

export interface StrictTestHttpRequest {
  method: 'GET' | 'POST';
  url: string;
  data?: unknown;
  signal?: AbortSignal;
  validateStatus: () => true;
}

export interface StrictTestHttpResponse {
  status: number;
  data: unknown;
}

export interface StrictTestHttpTransport {
  request(request: StrictTestHttpRequest): Promise<StrictTestHttpResponse>;
}

export class StrictTestContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StrictTestContractError';
  }
}

export class StrictTestApiProblem extends Error {
  readonly status: number;
  readonly problem: DashboardStrictTestProblemDetailV1;
  readonly durableStatus: DashboardStrictTestRunStatusPublicDtoV1 | null;

  constructor(
    status: number,
    problem: DashboardStrictTestProblemDetailV1,
    durableStatus: DashboardStrictTestRunStatusPublicDtoV1 | null = null,
  ) {
    super(problem.message);
    this.name = 'StrictTestApiProblem';
    this.status = status;
    this.problem = problem;
    this.durableStatus = durableStatus;
  }
}

export function isStrictTestApiProblem(error: unknown): error is StrictTestApiProblem {
  return error instanceof StrictTestApiProblem;
}

function providerPathValidators(projectRoot: string): DashboardApiInputFormatValidators {
  return {
    // 浏览器不解释 Node path dialect；只承认 Main runtime/project-info 发出的原值。
    [CANONICAL_ABSOLUTE_PATH_FORMAT]: (value: string) =>
      projectRoot.trim().length > 0 && value === projectRoot,
  };
}

function failRequestContract(operationId: string): never {
  console.error('[strict-test] request contract rejected', { operationId });
  throw new StrictTestContractError(`Strict-test request contract rejected for ${operationId}`);
}

function failResponseContract(operationId: string, status: number): never {
  console.error('[strict-test] response schema drift rejected', { operationId, status });
  throw new StrictTestContractError(
    `Strict-test response schema drift for ${operationId} (${status})`,
  );
}

function throwProblem(
  status: number,
  envelope: DashboardStrictTestOrdinaryProblemV1 | DashboardStrictTestStartProblemV1,
): never {
  const durableStatus = 'data' in envelope && envelope.data
    ? envelope.data as DashboardStrictTestRunStatusPublicDtoV1
    : null;
  console.warn('[strict-test] authoritative problem response', {
    status,
    code: envelope.error.code,
    retryPolicy: envelope.error.retryPolicy,
    durablePhase: durableStatus?.phase ?? null,
  });
  throw new StrictTestApiProblem(status, envelope.error, durableStatus);
}

const defaultTransport: StrictTestHttpTransport = {
  async request(request) {
    const response = await http.request<unknown>({
      method: request.method,
      url: request.url,
      data: request.data,
      signal: request.signal,
      validateStatus: request.validateStatus,
    });
    return { status: response.status, data: response.data };
  },
};

export interface StrictTestApiClient {
  preflight(
    request: DashboardStrictTestPreflightRequestV1,
    providerProjectRoot: string,
    signal?: AbortSignal,
  ): Promise<DashboardStrictTestPreflightPublicDtoV1>;
  start(
    request: DashboardStrictTestRunRequestV1,
    signal?: AbortSignal,
  ): Promise<DashboardStrictTestRunStatusPublicDtoV1>;
  status(runId: string, signal?: AbortSignal): Promise<DashboardStrictTestRunStatusPublicDtoV1>;
  report(runId: string, signal?: AbortSignal): Promise<DashboardStrictTestReportPublicDtoV1>;
}

export function createStrictTestApi(
  transport: StrictTestHttpTransport = defaultTransport,
): StrictTestApiClient {
  async function executeRequest(
    operationId: string,
    input: StrictTestHttpRequest,
  ): Promise<StrictTestHttpResponse> {
    console.info('[strict-test] HTTP request', {
      operationId,
      method: input.method,
      url: input.url,
    });
    const response = await transport.request(input);
    console.info('[strict-test] HTTP response', {
      operationId,
      method: input.method,
      url: input.url,
      status: response.status,
    });
    return response;
  }

  return {
    async preflight(request, providerProjectRoot, signal) {
      const operationId = 'preflightStrictTestDimension';
      const operationRequest = { body: request, pathParameters: {}, query: {} };
      if (!validateDashboardStrictTestOperationRequest(
        operationId,
        operationRequest,
        providerPathValidators(providerProjectRoot),
      )) {
        return failRequestContract(operationId);
      }

      const response = await executeRequest(operationId, {
        method: 'POST',
        url: '/strict-test-dimension/preflight',
        data: request,
        signal,
        validateStatus: () => true,
      });
      if (!validateDashboardStrictTestOperationResponse(
        operationId,
        response.status,
        response.data,
      )) {
        return failResponseContract(operationId, response.status);
      }
      if (response.status === 200) {
        return (response.data as DashboardStrictTestPreflightSuccessV1).data;
      }
      return throwProblem(
        response.status,
        response.data as DashboardStrictTestOrdinaryProblemV1,
      );
    },

    async start(request, signal) {
      const operationId = 'startStrictTestDimensionRun';
      const operationRequest = { body: request, pathParameters: {}, query: {} };
      if (!validateDashboardStrictTestOperationRequest(operationId, operationRequest, {})) {
        return failRequestContract(operationId);
      }

      const response = await executeRequest(operationId, {
        method: 'POST',
        url: '/strict-test-dimension/runs',
        data: request,
        signal,
        validateStatus: () => true,
      });
      if (!validateDashboardStrictTestOperationResponse(
        operationId,
        response.status,
        response.data,
      )) {
        return failResponseContract(operationId, response.status);
      }
      if (response.status === 202) {
        return (response.data as DashboardStrictTestRunStatusSuccessV1).data;
      }
      return throwProblem(
        response.status,
        response.data as DashboardStrictTestOrdinaryProblemV1 | DashboardStrictTestStartProblemV1,
      );
    },

    async status(runId, signal) {
      const operationId = 'getStrictTestDimensionRun';
      const operationRequest = { pathParameters: { runId }, query: {} };
      if (!validateDashboardStrictTestOperationRequest(operationId, operationRequest, {})) {
        return failRequestContract(operationId);
      }

      const response = await executeRequest(operationId, {
        method: 'GET',
        url: `/strict-test-dimension/runs/${encodeURIComponent(runId)}`,
        signal,
        validateStatus: () => true,
      });
      if (!validateDashboardStrictTestOperationResponse(
        operationId,
        response.status,
        response.data,
      )) {
        return failResponseContract(operationId, response.status);
      }
      if (response.status === 200) {
        return (response.data as DashboardStrictTestRunStatusSuccessV1).data;
      }
      return throwProblem(
        response.status,
        response.data as DashboardStrictTestOrdinaryProblemV1,
      );
    },

    async report(runId, signal) {
      const operationId = 'getStrictTestDimensionReport';
      const operationRequest = { pathParameters: { runId }, query: {} };
      if (!validateDashboardStrictTestOperationRequest(operationId, operationRequest, {})) {
        return failRequestContract(operationId);
      }

      const response = await executeRequest(operationId, {
        method: 'GET',
        url: `/strict-test-dimension/runs/${encodeURIComponent(runId)}/report`,
        signal,
        validateStatus: () => true,
      });
      if (!validateDashboardStrictTestOperationResponse(
        operationId,
        response.status,
        response.data,
      )) {
        return failResponseContract(operationId, response.status);
      }
      if (response.status === 200) {
        return (response.data as DashboardStrictTestReportSuccessV1).data;
      }
      return throwProblem(
        response.status,
        response.data as DashboardStrictTestOrdinaryProblemV1,
      );
    },
  };
}

export const strictTestApi = createStrictTestApi();
