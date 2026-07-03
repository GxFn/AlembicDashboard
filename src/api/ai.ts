/**
 * ai — /ai 路由族：Provider 信息/探测/Skill 生成/LLM 工作区配置/Token 用量/语言偏好
 * （W7-f 自 api.ts 拆出）。
 */

import { http } from './client';


/** 模型能力声明 */
export interface ModelCapabilities {
  toolCalling: boolean;
  vision: boolean;
  embedding: boolean;
  jsonMode: boolean;
  streaming: boolean;
}

/** 模型推理能力声明 */
export interface ModelReasoning {
  supported: boolean;
  mode?: string;
  defaultEffort?: string;
  effortLevels?: string[];
}

/** AI 模型信息 */
export interface AiProviderModelInfo {
  id: string;
  name: string;
  contextWindow: number;
  maxOutputTokens?: number;
  deprecated?: boolean;
  capabilities?: ModelCapabilities;
  reasoning?: ModelReasoning;
}

/** AI 服务商信息 */
export interface AiProviderInfo {
  id: string;
  label: string;
  defaultModel: string;
  hasKey?: boolean;
  isActive?: boolean;
  keyEnvVar?: string;
  baseUrl?: string;
  models?: AiProviderModelInfo[];
  [key: string]: unknown;
}

/** /ai/providers 接口返回 */
export interface AiProvidersResponse {
  providers: AiProviderInfo[];
  active: { provider: string; model: string };
}

/** /ai/probe 探测结果 */
export interface AiProbeResult {
  provider: string;
  status: 'connected' | 'error';
  latencyMs?: number;
  model?: string;
  error?: string;
  statusCode?: number;
}

export const aiApi = {
  // ── AI ──────────────────────────────────────────────

  async getAiProviders(): Promise<AiProviderInfo[]> {
    const res = await http.get('/ai/providers');
    const data = res.data?.data;
    if (data?.providers) {
      return data.providers;
    }
    return Array.isArray(data) ? data : [];
  },

  async probeProvider(provider: string, apiKey?: string): Promise<AiProbeResult> {
    const res = await http.post('/ai/probe', { provider, apiKey });
    return res.data?.data || { provider, status: 'error', error: 'Unknown error' };
  },

  /** AI 生成 Skill 内容（通过 API AI 能力） */
  async aiGenerateSkill(prompt: string): Promise<{ reply: string; hasContext?: boolean }> {
    const systemPrompt = `你是一个 Alembic Skill 文档生成助手。用户会描述他们想创建的 Skill，你需要生成完整的 SKILL.md 内容。

Skill 文档格式要求：
1. 开头用 Markdown 标题说明 Skill 的目的
2. 包含清晰的使用场景说明
3. 列出具体的操作步骤和指南
4. 如有必要，包含代码示例
5. 使用中文撰写

请严格按以下格式输出（不要用代码块包裹 JSON）：

第一行：一个 JSON 对象，包含 name（kebab-case，3-64 字符）和 description（一句话中文描述）
第二行：空行
第三行起：Skill 文档正文内容（Markdown 格式，不含 frontmatter）

示例输出：
{"name": "swiftui-animation-guide", "description": "SwiftUI 动画最佳实践指南"}

# SwiftUI 动画最佳实践

## 使用场景
...`;

    const res = await http.post('/ai/chat', {
      prompt: `${systemPrompt}\n\n用户需求：${prompt}`,
      history: [],
    });
    return res.data?.data || { reply: '' };
  },

  // ── LLM workspace settings ─────────────────────────

  /** 读取 Alembic 工作区中的 LLM 配置 */
  async getLlmEnvConfig(): Promise<{
    vars: Record<string, string>;
    hasSettingsFile?: boolean;
    hasSecretsFile?: boolean;
    settingsPath?: string;
    secretsPath?: string;
    configSource?: 'workspace-settings' | 'process-env' | 'empty';
    llmReady: boolean;
  }> {
    const res = await http.get('/ai/env-config');
    return res.data?.data || { vars: {}, llmReady: false };
  },

  /** 近 7 日 Token 消耗报告 */
  async getTokenUsage7Days(): Promise<{
    daily: Array<{ date: string; input_tokens: number; output_tokens: number; total_tokens: number; call_count: number }>;
    bySource: Array<{ source: string; input_tokens: number; output_tokens: number; total_tokens: number; call_count: number }>;
    summary: { input_tokens: number; output_tokens: number; total_tokens: number; call_count: number; avg_per_call: number };
  }> {
    const res = await http.get('/ai/token-usage');
    return res.data?.data || { daily: [], bySource: [], summary: { input_tokens: 0, output_tokens: 0, total_tokens: 0, call_count: 0, avg_per_call: 0 } };
  },

  /** 写入 / 更新 Alembic 工作区中的 LLM 配置 */
  async saveLlmEnvConfig(config: {
    provider: string;
    model?: string;
    apiKey?: string;
    proxy?: string;
    reasoningEffort?: string;
    embedProvider?: string;
    embedModel?: string;
    embedBaseUrl?: string;
    embedApiKey?: string;
    providerKeys?: Record<string, string>;
  }): Promise<{
    vars: Record<string, string>;
    hasSettingsFile?: boolean;
    hasSecretsFile?: boolean;
    settingsPath?: string;
    secretsPath?: string;
    configSource?: 'workspace-settings' | 'process-env' | 'empty';
    llmReady: boolean;
  }> {
    const res = await http.post('/ai/env-config', config);
    return res.data?.data || { vars: {}, llmReady: false };
  },

  // ── Language preference ──────

  /** 获取服务端默认 UI 语言 */
  async getLang(): Promise<'zh' | 'en'> {
    const res = await http.get('/ai/lang');
    return res.data?.data?.lang || 'zh';
  },

  /** 同步 UI 语言偏好到服务端 */
  async setLang(lang: 'zh' | 'en'): Promise<void> {
    await http.post('/ai/lang', { lang });
  },
};
