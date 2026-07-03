/**
 * modules — /modules(+/commands) 路由族（W7-f 自 api.ts 拆出）。
 *
 * ⚠️ SPM 冻结段（底稿 0a，2026-07-02 用户决策：SPM 整链纯冻结）：fetchTargets/
 * getTargetFiles/scanTarget/scanTargetStream/scanProject/browseDirectories/
 * scanFolderStream/refreshProject 8 方法自 api.ts 原字节整段搬入（决策项①），
 * 方法名/HTTP 串/fetch+EventSource 形态一概未改；文件级搬迁仅调整了
 * 类型位动态引用的相对路径（同级 types → 上级 ../types）。
 * 其余为 generate 环方法（bootstrap/rescan 等，不冻结）。
 */

import { http } from './client';
import { projectSseErrorMessage, projectSseScanResult } from './sse';
import type { ExtractedRecipe, SPMTarget, ScannedFile } from '../types';


export const modulesApi = {
  // ── Modules (多语言统一模块扫描) ───────

  async fetchTargets(): Promise<SPMTarget[]> {
    const res = await http.get('/modules/targets');
    const data = res.data?.data || {};
    return data.targets || [];
  },

  async getTargetFiles(target: SPMTarget, signal?: AbortSignal) {
    const res = await http.post('/modules/target-files', { target }, { signal });
    const data = res.data?.data || {};
    return { files: data.files || [], count: data.total || data.files?.length || 0 };
  },

  async scanTarget(target: SPMTarget, signal?: AbortSignal): Promise<{ recipes: ExtractedRecipe[]; scannedFiles: ScannedFile[]; message: string; noAi: boolean }> {
    const res = await http.post('/modules/scan', { target }, { signal, timeout: 600000 });
    const data = res.data?.data || {};
    const recipes = data.recipes || data.result || [];
    return { recipes, scannedFiles: (data.scannedFiles || []) as ScannedFile[], message: data.message || '', noAi: !!data.noAi };
  },

  /**
   * 流式 Target 扫描 — SSE Session + EventSource 架构
   * POST 创建 session → EventSource 消费进度事件 → scan:result 携带最终结果
   */
  async scanTargetStream(
    target: SPMTarget,
    onEvent: (event: Record<string, unknown>) => void,
    signal?: AbortSignal,
  ): Promise<{ recipes: ExtractedRecipe[]; scannedFiles: ScannedFile[]; message: string; noAi?: boolean }> {
    // Step 1: POST 创建流式扫描会话
    let sessionId: string;
    const startRes = await fetch('/api/v1/modules/scan/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target }),
      signal,
    });
    if (!startRes.ok) throw new Error(`Scan stream start failed: ${startRes.status}`);
    const startData = await startRes.json();
    sessionId = startData.sessionId;
    if (!sessionId) throw new Error(`No sessionId returned`);

    // Step 2: EventSource 消费 SSE 事件
    return new Promise((resolve, reject) => {
      const esUrl = `/api/v1/modules/scan/events/${sessionId}`;
      const es = new EventSource(esUrl);
      let resolved = false;
      let finalResult = { recipes: [] as ExtractedRecipe[], scannedFiles: [] as ScannedFile[], message: '', noAi: false };

      function cleanup() { es.close(); }

      es.onmessage = (e) => {
        try {
          const evt = JSON.parse(e.data);
          onEvent(evt);

          if (evt.type === 'scan:result') {
            finalResult = projectSseScanResult(evt);
          }

          if (evt.type === 'stream:done') {
            cleanup();
            resolved = true;
            resolve(finalResult);
          }

          if (evt.type === 'stream:error') {
            cleanup();
            resolved = true;
            reject(new Error(projectSseErrorMessage(evt, 'Scan stream error')));
          }
        } catch { /* ignore JSON parse errors */ }
      };

      es.onerror = () => {
        if (!resolved) {
          cleanup();
          resolved = true;
          // If we already have results, resolve with them
          if (finalResult.recipes.length > 0) {
            resolve(finalResult);
          } else {
            reject(new Error('EventSource connection failed'));
          }
        }
      };

      if (signal) {
        const onAbort = () => {
          if (!resolved) {
            cleanup();
            resolved = true;
            reject(new DOMException('The operation was aborted.', 'AbortError'));
          }
        };
        if (signal.aborted) { onAbort(); return; }
        signal.addEventListener('abort', onAbort, { once: true });
      }
    });
  },

  /** 全项目扫描：AI 提取 + Guard 审计 */
  async scanProject(signal?: AbortSignal): Promise<{
    targets: string[];
    recipes: ExtractedRecipe[];
    guardAudit: import('../types').GuardAuditResult | null;
    scannedFiles: ScannedFile[];
    partial: boolean;
  }> {
    const res = await http.post('/modules/scan-project', {}, { signal, timeout: 600000 });
    const data = res.data?.data || {};
    return {
      targets: data.targets || [],
      recipes: data.recipes || [],
      guardAudit: data.guardAudit || null,
      scannedFiles: (data.scannedFiles || []) as ScannedFile[],
      partial: data.partial || false,
    };
  },

  /**
   * 浏览项目目录结构 — 供目录选择器使用
   */
  async browseDirectories(basePath = '', depth = 3): Promise<import('../types').ProjectDirectory[]> {
    const params = new URLSearchParams();
    if (basePath) params.set('path', basePath);
    if (depth) params.set('depth', String(depth));
    const res = await http.get(`/modules/browse-dirs?${params.toString()}`);
    return res.data?.data?.directories || [];
  },

  /**
   * 流式扫描任意目录 — SSE Session 架构
   * 复用已有 scan-events SSE 通道
   */
  async scanFolderStream(
    folderPath: string,
    onEvent: (event: Record<string, unknown>) => void,
    signal?: AbortSignal,
  ): Promise<{ recipes: ExtractedRecipe[]; scannedFiles: ScannedFile[]; message: string; noAi?: boolean }> {
    // Step 1: POST 创建流式扫描会话
    const startRes = await fetch('/api/v1/modules/scan-folder/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: folderPath }),
      signal,
    });
    if (!startRes.ok) throw new Error(`Scan folder start failed: ${startRes.status}`);
    const startData = await startRes.json();
    const sessionId = startData.sessionId;
    if (!sessionId) throw new Error('No sessionId returned');

    // Step 2: EventSource 消费 SSE 事件（复用已有通道）
    return new Promise((resolve, reject) => {
      const esUrl = `/api/v1/modules/scan/events/${sessionId}`;
      const es = new EventSource(esUrl);
      let resolved = false;
      let finalResult = { recipes: [] as ExtractedRecipe[], scannedFiles: [] as ScannedFile[], message: '', noAi: false };

      function cleanup() { es.close(); }

      es.onmessage = (e) => {
        try {
          const evt = JSON.parse(e.data);
          onEvent(evt);

          if (evt.type === 'scan:result') {
            finalResult = projectSseScanResult(evt);
          }

          if (evt.type === 'stream:done') {
            cleanup();
            resolved = true;
            resolve(finalResult);
          }

          if (evt.type === 'stream:error') {
            cleanup();
            resolved = true;
            reject(new Error(projectSseErrorMessage(evt, 'Scan folder stream error')));
          }
        } catch { /* ignore */ }
      };

      es.onerror = () => {
        if (!resolved) {
          cleanup();
          resolved = true;
          if (finalResult.recipes.length > 0) {
            resolve(finalResult);
          } else {
            reject(new Error('EventSource connection failed'));
          }
        }
      };

      if (signal) {
        const onAbort = () => {
          if (!resolved) {
            cleanup();
            resolved = true;
            reject(new DOMException('The operation was aborted.', 'AbortError'));
          }
        };
        if (signal.aborted) { onAbort(); return; }
        signal.addEventListener('abort', onAbort, { once: true });
      }
    });
  },

  /** 冷启动：快速骨架 + 异步逐维度填充（v5） */
  async bootstrap(signal?: AbortSignal) {
    const res = await http.post('/modules/bootstrap', {}, { signal, timeout: 300000 });
    const data = res.data?.data || {};
    return {
      report: data.report || {},
      targets: data.targets || [],
      filesByTarget: data.filesByTarget || {},
      dependencyGraph: data.dependencyGraph || null,
      languageStats: data.languageStats || {},
      primaryLanguage: data.primaryLanguage || '',
      guardSummary: data.guardSummary || null,
      guardViolationFiles: data.guardViolationFiles || [],
      bootstrapCandidates: data.bootstrapCandidates || { created: 0, failed: 0 },
      bootstrapSession: data.bootstrapSession || null,
      asyncFill: data.asyncFill || false,
      job: data.job || null,
      jobId: data.jobId || data.job?.id || '',
      message: data.message || '',
    };
  },

  /** 查询 bootstrap 异步填充进度（Socket.io 不可用时的 fallback） */
  async getBootstrapStatus() {
    const res = await http.get('/modules/bootstrap/status');
    return res.data?.data || { status: 'idle' };
  },

  /** 查询当前测试模式配置 */
  async getTestModeConfig(): Promise<{
    enabled: boolean;
    bootstrapDims: string[];
    rescanDims: string[];
    terminal: { enabled: boolean; toolset: string };
    sandbox: { mode: string; available: boolean };
  }> {
    const res = await http.get('/modules/test-mode');
    return res.data?.data || {
      enabled: false,
      bootstrapDims: [],
      rescanDims: [],
      terminal: { enabled: false, toolset: 'baseline' },
      sandbox: { mode: 'enforce', available: false },
    };
  },

  /** 取消正在运行的 bootstrap / rescan 异步填充 */
  async cancelBootstrap(reason?: string): Promise<{ success: boolean }> {
    const res = await http.post('/modules/bootstrap/cancel', { reason });
    return res.data || { success: true };
  },

  /** 增量扫描：保留已有 Recipe，重新分析项目，API AI 补齐缺失知识 */
  async rescan(opts?: { reason?: string; dimensions?: string[] }, signal?: AbortSignal) {
    const res = await http.post('/modules/rescan', opts || {}, { signal, timeout: 300000 });
    const data = res.data?.data || {};
    return {
      rescan: data.rescan || {},
      relevanceAudit: data.relevanceAudit || {},
      gapAnalysis: data.gapAnalysis || {},
      bootstrapSession: data.bootstrapSession || null,
      asyncFill: data.asyncFill || false,
      job: data.job || null,
      jobId: data.jobId || data.job?.id || '',
      status: data.status || 'complete',
      message: res.data?.message || '',
    };
  },

  async getDepGraph(level: string) {
    const res = await http.get(`/modules/dep-graph?level=${level}`);
    return res.data?.data || {};
  },

  // ── Commands ────────────────────────────────────────

  async refreshProject(): Promise<void> {
    try {
      await http.post('/modules/update-map');
    } catch {
      await http.post('/commands/spm-map');
    }
  },
};
