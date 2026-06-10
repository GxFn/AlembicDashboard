/**
 * 流式聊天事件处理器 — 提取自 AiChatView / GlobalChatDrawer 的公共逻辑
 *
 * 将 SSE 事件流驱动的状态机封装为可复用的回调工厂，避免两个聊天界面维护重复代码。
 *
 * @module hooks/useChatStream
 */

import type { SSEEvent } from '../api';

/** i18n t 函数签名（与 useI18n().t 一致） */
type TFn = (key: string, vars?: Record<string, string | number>) => string;
type ToolEventArgs = Record<string, unknown>;

function asToolEventArgs(value: unknown): ToolEventArgs | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as ToolEventArgs
    : undefined;
}

function argString(args: ToolEventArgs | undefined, ...keys: string[]): string {
  if (!args) {
    return '';
  }
  for (const key of keys) {
    const value = args[key];
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
  }
  return '';
}

function argStringArray(args: ToolEventArgs | undefined, key: string): string[] {
  const value = args?.[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function basename(value: string): string {
  return value.split('/').filter(Boolean).pop() || value;
}

function truncateDisplay(value: string, maxLength = 40): string {
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

function eventString(event: SSEEvent, key: string): string {
  const value = event[key];
  return typeof value === 'string' ? value : '';
}

function eventNumber(event: SSEEvent, key: string): number {
  const value = event[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/** 将工具名转为人类可读标签（通过 i18n），未知工具保留原名 */
function toolLabel(t: TFn, name: string): string {
  const key = `chatStream.tools.${name}`;
  const label = t(key);
  // t() 对未知 key 会原样返回，检测到时 fallback 到原始工具名
  return label === key ? name : label;
}

/**
 * 从 tool:start 的 args 中提取简短上下文摘要
 * 例: read_project_file({filePath:"src/App.tsx"}) → "App.tsx"
 */
export function toolContext(t: TFn, tool: string, args: ToolEventArgs | undefined): string {
  if (!args) return '';
  switch (tool) {
    case 'read_project_file': {
      // 支持单文件 filePath 和批量 filePaths
      const p = argString(args, 'filePath') || argStringArray(args, 'filePaths')[0] || '';
      if (!p) return '';
      const files = argStringArray(args, 'filePaths');
      const extra = files.length > 1
        ? t('chatStream.andNFiles', { n: files.length })
        : '';
      return `${basename(p)}${extra}`;
    }
    case 'list_project_structure': {
      return argString(args, 'directory', 'path');
    }
    case 'search_project_code': {
      const patterns = argStringArray(args, 'patterns');
      if (patterns.length > 0) {
        return patterns.slice(0, 2).join(', ') + (patterns.length > 2 ? ' ...' : '');
      }
      return truncateDisplay(argString(args, 'pattern', 'query'));
    }
    case 'semantic_search_code':
    case 'search_knowledge':
    case 'search_recipes':
    case 'search_candidates': {
      return truncateDisplay(argString(args, 'query', 'keyword'));
    }
    case 'get_class_info':
    case 'get_protocol_info': {
      return argString(args, 'className', 'name', 'protocolName');
    }
    case 'get_file_summary': {
      const fp = argString(args, 'filePath');
      return fp ? basename(fp) : '';
    }
    case 'summarize_code':
    case 'analyze_code': {
      return argString(args, 'language');
    }
    case 'get_class_hierarchy': {
      return argString(args, 'rootClass');
    }
    default:
      return '';
  }
}

/** 组合标签 + 上下文为一行摘要 */
export function toolSummary(t: TFn, tool: string, args?: ToolEventArgs): string {
  const label = toolLabel(t, tool);
  const ctx = toolContext(t, tool, args);
  return ctx ? `${label}: ${ctx}` : label;
}

/**
 * 创建 SSE 事件状态机回调 + 局部状态容器
 *
 * 使用方式:
 * ```ts
 * const { onEvent, getState } = createStreamEventHandler(assistantId, setMessages);
 * const result = await api.chatStream(text, history, onEvent, signal);
 * // result.text / getState().answerText 均可获取最终文本
 * ```
 */
export function createStreamEventHandler(
  assistantId: string,
  setMessages: React.Dispatch<React.SetStateAction<any[]>>,
  t: TFn,
) {
  const toolLogs: string[] = [];
  /** 只保留展示摘要，避免在 UI 状态里保存 tool args 原始载荷。 */
  const toolMeta: Array<{ summary: string }> = [];
  let answerText = '';

  /** 更新指定 assistant 消息的内容 */
  function updateContent(content: string) {
    setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content } : m));
  }

  function onEvent(evt: SSEEvent) {
    switch (evt.type) {
      case 'step:start': {
        const phase = eventString(evt, 'phase');
        const phaseLabel = phase === 'user' || !phase ? '' : ` [${phase}]`;
        const stepLine = t('chatStream.stepProgress', {
          step: eventNumber(evt, 'step'),
          maxSteps: eventNumber(evt, 'maxSteps'),
        }) + phaseLabel + '...';
        const statusText = toolLogs.length > 0
          ? toolLogs.join('\n') + '\n\n' + stepLine
          : stepLine;
        updateContent(statusText);
        break;
      }
      case 'tool:start': {
        const tool = eventString(evt, 'tool') || 'unknown';
        const summary = toolSummary(t, tool, asToolEventArgs(evt['args']));
        toolLogs.push(`🔧 ${summary}...`);
        toolMeta.push({ summary });
        updateContent(toolLogs.join('\n'));
        break;
      }
      case 'tool:end': {
        const lastIdx = toolLogs.length - 1;
        if (lastIdx >= 0) {
          const meta = toolMeta[lastIdx];
          const summary = meta?.summary || toolSummary(t, eventString(evt, 'tool') || 'unknown');
          const duration = eventNumber(evt, 'duration');
          const resultSize = eventNumber(evt, 'resultSize');
          if (eventString(evt, 'status') === 'error' || Boolean(evt['error'])) {
            toolLogs[lastIdx] = `❌ ${summary} ${t('chatStream.toolFailed')} (${duration}ms)`;
          } else {
            const sizeStr = resultSize > 1000
              ? `${(resultSize / 1024).toFixed(1)}KB`
              : t('chatStream.toolResultChars', { size: resultSize });
            toolLogs[lastIdx] = `✅ ${summary} → ${sizeStr} (${duration}ms)`;
          }
          updateContent(toolLogs.join('\n'));
        }
        break;
      }
      case 'text:start': {
        answerText = '';
        break;
      }
      case 'text:delta': {
        answerText += eventString(evt, 'delta');
        const prefix = toolLogs.length > 0 ? toolLogs.join('\n') + '\n\n---\n\n' : '';
        updateContent(prefix + answerText);
        break;
      }
      // text:end, step:end, stream:start, stream:done — 不需要额外 UI 处理
    }
  }

  return {
    onEvent,
    /** 获取当前局部状态（answerText、toolLogs） */
    getState: () => ({ answerText, toolLogs }),
  };
}
