/**
 * sse — SSE 统一协议事件类型与投影（W7-f 自 api.ts 拆出）。
 * 消费方：modules 族流式扫描 + 契约测试执行级断言。
 */

import type { ExtractedRecipe, ScannedFile } from '../types';
import { asRuntimeRecord, firstNumber, firstString, type UnknownRecord } from './client';


// ═══════════════════════════════════════════════════════
//  SSE Stream Consumer — 统一协议 v2
// ═══════════════════════════════════════════════════════

/** SSE 统一协议事件类型 */
export type SSEEventType =
  | 'stream:start' | 'stream:done' | 'stream:error'
  | 'step:start' | 'step:end'
  | 'tool:start' | 'tool:end'
  | 'text:start' | 'text:delta' | 'text:end'
  | 'data:progress' | 'data:preview'
  | 'scan:result'
  | 'ping';

export interface SSEEvent {
  type: SSEEventType;
  // SSE payloads stay dynamic at transport ingress; adapters below project typed UI fields.
  [key: string]: unknown;
}

export interface ScanStreamResultProjection {
  recipes: ExtractedRecipe[];
  scannedFiles: ScannedFile[];
  message: string;
  noAi: boolean;
}

function sseString(event: SSEEvent, key: string): string | undefined {
  const value = event[key];
  return typeof value === 'string' ? value : undefined;
}

function sseRecord(value: unknown): UnknownRecord | undefined {
  return asRuntimeRecord(value) ?? undefined;
}

export function projectSseTextDelta(event: SSEEvent): string {
  return sseString(event, 'delta') ?? sseString(event, 'text') ?? '';
}

export function projectSseErrorMessage(event: SSEEvent, fallbackMessage: string): string {
  return sseString(event, 'message') ?? fallbackMessage;
}

export function projectSseScanResult(event: SSEEvent): ScanStreamResultProjection {
  return {
    recipes: Array.isArray(event.recipes) ? event.recipes as ExtractedRecipe[] : [],
    scannedFiles: Array.isArray(event.scannedFiles) ? event.scannedFiles as ScannedFile[] : [],
    message: sseString(event, 'message') ?? '',
    noAi: event.noAi === true,
  };
}

export function projectProviderSseMessage(value: unknown): SSEEvent | null {
  const root = asRuntimeRecord(value);
  const data = asRuntimeRecord(root?.data) ?? root;
  if (!data) {
    return null;
  }

  const rawType = firstString(data.type, root?.type);
  if (rawType === 'text_delta') {
    return {
      type: 'text:delta',
      delta: firstString(data.delta, data.text) ?? '',
    };
  }
  if (rawType === 'progress') {
    return {
      type: 'data:progress',
      completed: firstNumber(data.completed),
      total: firstNumber(data.total),
      message: firstString(data.message),
    };
  }
  if (rawType === 'preview') {
    return {
      type: 'data:preview',
      candidateId: firstString(data.candidateId),
      preview: sseRecord(data.preview),
    };
  }
  if (rawType === 'stream:done' || rawType === 'stream:error' || rawType === 'scan:result') {
    return { ...data, type: rawType };
  }
  return null;
}
