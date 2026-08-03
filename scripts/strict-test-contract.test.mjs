import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const projectRoot = '/workspace/provider-issued-project';
const demandKey = 'dashboard-strict-test-dimension';
const runId = '00000000-0000-4000-8000-000000000001';
const preflightHash = `sha256:${'a'.repeat(64)}`;
const hash = (char) => `sha256:${char.repeat(64)}`;

function read(relativePath) {
  return readFileSync(path.join(root, relativePath), 'utf8');
}

const transpiledFileCache = new Map();

function resolveRelativeImport(importerRelativePath, specifier) {
  const joined = path
    .normalize(path.join(path.dirname(importerRelativePath), specifier))
    .replaceAll(path.sep, '/');
  for (const candidate of [`${joined}.ts`, `${joined}.tsx`, joined, `${joined}/index.ts`]) {
    if (existsSync(path.join(root, candidate))) {
      return candidate;
    }
  }
  assert.fail(`Cannot resolve relative import ${specifier} from ${importerRelativePath}`);
}

function transpileToTempFile(relativePath) {
  const cached = transpiledFileCache.get(relativePath);
  if (cached) {
    return cached;
  }
  const source = read(relativePath);
  let output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  output = output.replace(
    /(from\s*|import\s*\(?\s*)(["'])(\.{1,2}\/[^"']+)\2/g,
    (_match, prefix, quote, specifier) => {
      const dependency = transpileToTempFile(resolveRelativeImport(relativePath, specifier));
      return `${prefix}${quote}${pathToFileURL(dependency).href}${quote}`;
    },
  );
  const tempDir = path.join(root, 'node_modules', '.tmp', 'strict-test-contract');
  mkdirSync(tempDir, { recursive: true });
  const tempFile = path.join(
    tempDir,
    `${relativePath.replace(/[^A-Za-z0-9._-]+/g, '-')}-${Date.now()}-${transpiledFileCache.size}.mjs`,
  );
  writeFileSync(tempFile, output);
  transpiledFileCache.set(relativePath, tempFile);
  return tempFile;
}

async function importTranspiled(relativePath) {
  return import(pathToFileURL(transpileToTempFile(relativePath)).href);
}

function preflightData(overrides = {}) {
  return {
    schemaVersion: 1,
    profile: 'strict-test-dimension',
    demandKey,
    runId,
    phase: 'AUTOMATIC_SELECTION_READY',
    preflightHash,
    previewHash: hash('b'),
    canAutoSelect: true,
    recommendation: { dimensionId: 'architecture', reasonCode: 'backend-recommendation' },
    fullUniverse: {
      dimensionCount: 26,
      cellCount: 52,
      eligibleCellCount: 4,
      excludedCellCount: 48,
      fullCellUniverseHash: hash('c'),
    },
    ...overrides,
  };
}

function runStatusData(overrides = {}) {
  return {
    schemaVersion: 1,
    profile: 'strict-test-dimension',
    demandKey,
    runId,
    phase: 'PRIVATE_WORKSPACE_READY',
    preflightHash,
    automaticSelection: {
      selectedDimensionId: 'architecture',
      selectedCellIds: ['architecture:repo'],
      selectedCellSetHash: hash('d'),
      automaticSelectionHash: hash('e'),
      projectionHash: hash('f'),
    },
    terminal: null,
    reportHash: null,
    evidenceRefs: ['artifact://strict/status'],
    ...overrides,
  };
}

function terminalStatusData(overrides = {}) {
  return runStatusData({
    phase: 'STRICT_TEST_COMPLETED_PRIVATE',
    terminal: {
      terminalState: 'STRICT_TEST_COMPLETED_PRIVATE',
      terminalHash: hash('1'),
      failedStage: null,
      errorCode: null,
      productionFinalized: false,
      publicRouteChanged: false,
    },
    reportHash: hash('2'),
    ...overrides,
  });
}

function reportData(overrides = {}) {
  return {
    schemaVersion: 1,
    profile: 'strict-test-dimension',
    demandKey,
    runId,
    terminalState: 'STRICT_TEST_COMPLETED_PRIVATE',
    terminalHash: hash('1'),
    reportHash: hash('2'),
    preflightHash,
    automaticSelectionHash: hash('e'),
    projectionHash: hash('f'),
    fullUniverse: {
      dimensionCount: 26,
      cellCount: 52,
      eligibleCellCount: 4,
      excludedCellCount: 48,
      cellUniverseHash: hash('c'),
    },
    executedProjection: {
      dimensionId: 'architecture',
      cellCount: 1,
      cellSetHash: hash('d'),
    },
    unexecutedDimensionIds: ['dependencies', 'testing'],
    failure: null,
    evidenceRefs: ['artifact://strict/report'],
    productionFinalized: false,
    publicRouteChanged: false,
    ...overrides,
  };
}

function problem(status, code = 'STRICT_TEST_REQUEST_REJECTED') {
  const statusMap = {
    400: ['invalid-input', 'core.failure.invalid-input', 'request-problem'],
    404: ['not-found', 'core.failure.not-found', 'resource-problem'],
    409: ['conflict', 'core.failure.conflict', 'state-conflict'],
    422: ['invalid-input', 'core.failure.invalid-input', 'request-problem'],
  };
  const [reasonCode, failureId, problemClass] = statusMap[status];
  return {
    success: false,
    error: {
      agentBranch: 'failure',
      canonicalHttpStatus: status,
      code,
      dashboardState: reasonCode,
      detailExposureClass: 'public',
      exposureClass: 'public',
      failureId,
      failureStatus: 'failed',
      mcpErrorCode: failureId,
      mcpStatus: reasonCode,
      message: `Strict test problem ${status}`,
      privateDataSafe: true,
      problemClass,
      reasonCode,
      refPolicy: 'none',
      retryPolicy: 'after-input-change',
      retryable: false,
      status,
      taxonomyVersion: 1,
    },
  };
}

function success(data) {
  return { success: true, data };
}

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
    entries: () => [...values.entries()],
  };
}

test('generated exact strict-test contract closes requests and the actual response matrix', async () => {
  const generated = await importTranspiled('src/generated/api-types.ts');
  const formats = {
    'alembic-canonical-absolute-path-v1': (value) => value === projectRoot,
  };
  const request = {
    body: { demandKey, projectRoot, runId },
    pathParameters: {},
    query: {},
  };
  assert.equal(
    generated.validateDashboardStrictTestOperationRequest(
      'preflightStrictTestDimension', request, formats,
    ),
    true,
  );
  assert.equal(
    generated.validateDashboardStrictTestOperationRequest(
      'preflightStrictTestDimension',
      { ...request, body: { ...request.body, dimension: 'architecture' } },
      formats,
    ),
    false,
  );
  assert.equal(
    generated.validateDashboardStrictTestOperationRequest(
      'preflightStrictTestDimension', request, {},
    ),
    false,
  );

  const validByOperation = {
    preflightStrictTestDimension: { 200: success(preflightData()), 400: problem(400), 422: problem(422) },
    startStrictTestDimensionRun: {
      202: success(runStatusData()),
      400: problem(400),
      404: problem(404),
      422: { ...problem(422), data: terminalStatusData({ phase: 'STRICT_TEST_FAILED', terminal: null }) },
    },
    getStrictTestDimensionRun: { 200: success(runStatusData()), 400: problem(400), 404: problem(404), 422: problem(422) },
    getStrictTestDimensionReport: { 200: success(reportData()), 400: problem(400), 404: problem(404), 409: problem(409), 422: problem(422) },
  };

  for (const [operationId, cells] of Object.entries(validByOperation)) {
    const route = generated.DASHBOARD_API_ROUTES.find((item) => item.operationId === operationId);
    assert.deepEqual(Object.keys(route.responseSchemas).sort(), Object.keys(cells).sort());
    for (const [status, body] of Object.entries(cells)) {
      assert.equal(
        generated.validateDashboardStrictTestOperationResponse(operationId, Number(status), body),
        true,
        `${operationId} ${status} must match its declared schema`,
      );
      assert.equal(
        generated.validateDashboardStrictTestOperationResponse(
          operationId,
          Number(status),
          { ...body, undeclaredConsumerField: true },
        ),
        false,
        `${operationId} ${status} must fail closed on drift`,
      );
    }
    assert.equal(
      generated.validateDashboardStrictTestOperationResponse(operationId, 418, problem(400)),
      false,
    );
  }
});

test('strict-test adapter validates every request/response and never falls back', async () => {
  const { createStrictTestApi, StrictTestApiProblem } = await importTranspiled('src/api/strictTest.ts');
  const responses = [
    { status: 200, data: success(preflightData()) },
    { status: 202, data: success(runStatusData()) },
    { status: 200, data: success(terminalStatusData()) },
    { status: 200, data: success(reportData()) },
  ];
  const calls = [];
  const api = createStrictTestApi({
    request: async (request) => {
      calls.push(request);
      return responses.shift();
    },
  });

  await api.preflight({ demandKey, projectRoot, runId }, projectRoot);
  await api.start({ demandKey, preflightHash, runId });
  await api.status(runId);
  await api.report(runId);

  assert.deepEqual(
    calls.map(({ method, url }) => `${method} ${url}`),
    [
      'POST /strict-test-dimension/preflight',
      'POST /strict-test-dimension/runs',
      `GET /strict-test-dimension/runs/${runId}`,
      `GET /strict-test-dimension/runs/${runId}/report`,
    ],
  );
  assert.deepEqual(calls[0].data, { demandKey, projectRoot, runId });
  assert.deepEqual(calls[1].data, { demandKey, preflightHash, runId });
  assert.equal(calls.some(({ url }) => /modules\/bootstrap|jobs\/bootstrap/.test(url)), false);

  const problemApi = createStrictTestApi({
    request: async () => ({ status: 409, data: problem(409, 'STRICT_TEST_REPORT_NOT_READY') }),
  });
  await assert.rejects(() => problemApi.report(runId), (error) => {
    assert.ok(error instanceof StrictTestApiProblem);
    assert.equal(error.status, 409);
    assert.equal(error.problem.code, 'STRICT_TEST_REPORT_NOT_READY');
    return true;
  });

  const driftApi = createStrictTestApi({
    request: async () => ({ status: 200, data: { ...success(preflightData()), extra: true } }),
  });
  await assert.rejects(() => driftApi.preflight({ demandKey, projectRoot, runId }, projectRoot), /schema drift/i);
  await assert.rejects(
    () => api.preflight({ demandKey, projectRoot: '/workspace/not-provider-issued', runId }, projectRoot),
    /request contract/i,
  );
});

test('controller polls during the long start, persists one authority, suppresses duplicates, and restores it', async () => {
  const { StrictTestRunController, STRICT_TEST_DEMAND_KEY } = await importTranspiled('src/strictTest/StrictTestRunController.ts');
  const storage = memoryStorage();
  const calls = [];
  let resolveStart;
  const startPromise = new Promise((resolve) => { resolveStart = resolve; });
  const statusQueue = [runStatusData(), terminalStatusData()];
  const api = {
    preflight: async (body) => { calls.push(['preflight', body]); return preflightData(); },
    start: async (body) => { calls.push(['start', body]); return startPromise; },
    status: async (id) => { calls.push(['status', id]); return statusQueue.shift() ?? terminalStatusData(); },
    report: async (id) => { calls.push(['report', id]); return reportData(); },
  };
  const controller = new StrictTestRunController({
    api,
    storage,
    randomUUID: () => runId,
    sleep: async () => {},
  });

  const first = controller.start(projectRoot);
  const duplicate = controller.start(projectRoot);
  for (let index = 0; index < 8 && calls.filter(([name]) => name === 'status').length < 2; index += 1) {
    await Promise.resolve();
  }
  assert.equal(calls.filter(([name]) => name === 'preflight').length, 1);
  assert.equal(calls.filter(([name]) => name === 'start').length, 1);
  assert.ok(calls.some(([name]) => name === 'status'), 'status must poll while POST /runs is pending');
  resolveStart(terminalStatusData());
  await Promise.all([first, duplicate]);

  assert.equal(STRICT_TEST_DEMAND_KEY, demandKey);
  assert.deepEqual(calls[0][1], { demandKey, projectRoot, runId });
  assert.deepEqual(calls[1][1], { demandKey, preflightHash, runId });
  assert.equal(calls.filter(([name]) => name === 'report').length, 1);
  assert.equal(controller.getState().report.reportHash, hash('2'));
  const [[, storedAuthority]] = storage.entries();
  assert.deepEqual(JSON.parse(storedAuthority), { demandKey, projectRoot, runId, preflightHash });

  const restoreCalls = [];
  const restored = new StrictTestRunController({
    api: {
      preflight: async () => { throw new Error('restore must not preflight'); },
      start: async () => { throw new Error('restore must not start a second run'); },
      status: async (id) => { restoreCalls.push(['status', id]); return terminalStatusData(); },
      report: async (id) => { restoreCalls.push(['report', id]); return reportData(); },
    },
    storage,
    randomUUID: () => '00000000-0000-4000-8000-000000000002',
    sleep: async () => {},
  });
  await restored.restore(projectRoot);
  assert.deepEqual(restoreCalls, [['status', runId], ['report', runId]]);
  assert.equal(restored.getState().authority.runId, runId);
});

test('controller fails closed for automatic-selection drift and durable failed starts', async () => {
  const { StrictTestRunController } = await importTranspiled('src/strictTest/StrictTestRunController.ts');
  const { StrictTestApiProblem } = await importTranspiled('src/api/strictTest.ts');
  const noAutoController = new StrictTestRunController({
    api: {
      preflight: async () => preflightData({ canAutoSelect: false }),
      start: async () => assert.fail('canAutoSelect=false must not start'),
      status: async () => assert.fail('canAutoSelect=false must not poll'),
      report: async () => assert.fail('canAutoSelect=false must not report'),
    },
    storage: memoryStorage(),
    randomUUID: () => runId,
    sleep: async () => {},
  });
  await noAutoController.start(projectRoot);
  assert.equal(noAutoController.getState().kind, 'error');
  assert.match(noAutoController.getState().problem.message, /automatic selection/i);

  const mismatchController = new StrictTestRunController({
    api: {
      preflight: async () => preflightData(),
      start: async () => terminalStatusData({
        automaticSelection: {
          ...runStatusData().automaticSelection,
          selectedDimensionId: 'testing',
        },
      }),
      status: async () => terminalStatusData(),
      report: async () => reportData(),
    },
    storage: memoryStorage(),
    randomUUID: () => runId,
    sleep: async () => {},
  });
  await mismatchController.start(projectRoot);
  assert.equal(mismatchController.getState().kind, 'error');
  assert.match(mismatchController.getState().problem.message, /recommendation/i);

  const failed = terminalStatusData({
    phase: 'STRICT_TEST_FAILED',
    terminal: {
      terminalState: 'STRICT_TEST_FAILED',
      terminalHash: hash('9'),
      failedStage: 'PRIVATE_SERVING_VALIDATED',
      errorCode: 'STRICT_TEST_INJECTED_FAILURE',
      productionFinalized: false,
      publicRouteChanged: false,
    },
    reportHash: hash('8'),
  });
  const durableController = new StrictTestRunController({
    api: {
      preflight: async () => preflightData(),
      start: async () => { throw new StrictTestApiProblem(422, problem(422).error, failed); },
      status: async () => failed,
      report: async () => reportData({
        terminalState: 'STRICT_TEST_FAILED',
        terminalHash: hash('9'),
        reportHash: hash('8'),
        failure: { failedStage: 'PRIVATE_SERVING_VALIDATED', errorCode: 'STRICT_TEST_INJECTED_FAILURE' },
      }),
    },
    storage: memoryStorage(),
    randomUUID: () => runId,
    sleep: async () => {},
  });
  await durableController.start(projectRoot);
  assert.equal(durableController.getState().kind, 'terminal');
  assert.equal(durableController.getState().status.terminal.terminalState, 'STRICT_TEST_FAILED');
  assert.equal(durableController.getState().report.failure.errorCode, 'STRICT_TEST_INJECTED_FAILURE');
});

test('controller preserves the same authority for restore 404 and report-not-ready 409', async () => {
  const { StrictTestRunController } = await importTranspiled('src/strictTest/StrictTestRunController.ts');
  const { StrictTestApiProblem } = await importTranspiled('src/api/strictTest.ts');
  const storage = memoryStorage();
  const initial = new StrictTestRunController({
    api: {
      preflight: async () => preflightData(),
      start: async () => terminalStatusData(),
      status: async () => terminalStatusData(),
      report: async () => reportData(),
    },
    storage,
    randomUUID: () => runId,
    sleep: async () => {},
  });
  await initial.start(projectRoot);

  const restoreCalls = [];
  const missing = new StrictTestRunController({
    api: {
      preflight: async () => assert.fail('restore 404 must not preflight'),
      start: async () => assert.fail('restore 404 must not create another run'),
      status: async (id) => {
        restoreCalls.push(['status', id]);
        throw new StrictTestApiProblem(404, problem(404, 'STRICT_TEST_RUN_NOT_FOUND').error);
      },
      report: async () => assert.fail('restore 404 must not request a report'),
    },
    storage,
    randomUUID: () => '00000000-0000-4000-8000-000000000002',
    sleep: async () => {},
  });
  await missing.restore(projectRoot);
  assert.deepEqual(restoreCalls, [['status', runId]]);
  assert.equal(missing.getState().kind, 'error');
  assert.equal(missing.getState().authority.runId, runId);
  assert.equal(missing.getState().problem.status, 404);
  assert.equal(storage.entries().length, 1, '404 must not erase or replace same-run authority');

  const reportCalls = [];
  const notReady = new StrictTestRunController({
    api: {
      preflight: async () => preflightData(),
      start: async () => terminalStatusData(),
      status: async (id) => {
        reportCalls.push(['status', id]);
        return terminalStatusData();
      },
      report: async (id) => {
        reportCalls.push(['report', id]);
        throw new StrictTestApiProblem(409, problem(409, 'STRICT_TEST_REPORT_NOT_READY').error);
      },
    },
    storage: memoryStorage(),
    randomUUID: () => runId,
    sleep: async () => {},
  });
  await notReady.start(projectRoot);
  assert.equal(notReady.getState().kind, 'error');
  assert.equal(notReady.getState().authority.runId, runId);
  assert.equal(notReady.getState().status.terminal.terminalState, 'STRICT_TEST_COMPLETED_PRIVATE');
  assert.equal(notReady.getState().problem.status, 409);
  assert.equal(reportCalls.filter(([name]) => name === 'report').length, 1);
});

test('Candidates uses one strict handler and renders durable private-only semantics', async () => {
  const app = read('src/App.tsx');
  const candidates = read('src/components/Views/CandidatesView.tsx');
  const api = read('src/api/strictTest.ts');
  const handlerStart = app.indexOf('const handleStrictTestStart');
  const handlerEnd = app.indexOf('/** 增量扫描', handlerStart);
  assert.ok(handlerStart >= 0 && handlerEnd > handlerStart);
  const handler = app.slice(handlerStart, handlerEnd);
  assert.match(handler, /strictTest\.start/);
  assert.doesNotMatch(handler, /api\.bootstrap|bootstrap\.initFromApiResponse|DaemonJob|cancelJob/);
  assert.equal((candidates.match(/onClick=\{onColdStart\}/g) ?? []).length >= 2, true);
  assert.match(candidates, /data-testid="candidates-strict-test-cold-start-header"/);
  assert.match(candidates, /data-testid="candidates-strict-test-cold-start-empty"/);
  assert.match(candidates, /data-testid="candidates-strict-test-rerun"/);
  assert.match(candidates, /strictTestRunAgain/);
  assert.doesNotMatch(candidates, /cleanRebuildBtn|cleanRebuildTitle/);
  assert.doesNotMatch(api, /modules\/bootstrap|jobs\/bootstrap|DaemonJob/);

  const { StrictTestStatusPanel } = await importTranspiled('src/components/Views/StrictTestStatusPanel.tsx');
  const markup = renderToStaticMarkup(React.createElement(StrictTestStatusPanel, {
    state: {
      kind: 'terminal',
      authority: { demandKey, projectRoot, runId, preflightHash },
      preflight: preflightData(),
      status: terminalStatusData(),
      report: reportData(),
      problem: null,
    },
  }));
  assert.match(markup, /Private strict test only/i);
  assert.match(markup, /productionFinalized=false/);
  assert.match(markup, /publicRouteChanged=false/);
  assert.match(markup, /architecture/);
  assert.match(markup, /dependencies/);
  assert.doesNotMatch(markup, /production finalized|cleaning|deleting|清理重建/i);
});
