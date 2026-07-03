import { useCallback, useState } from 'react';
import api from '../api';

/**
 * useLlmStatus — LLM 配置就绪状态 + 配置弹窗开关（W7-e 自 App.tsx 搬出）。
 *
 * llmReady 默认 true：加载失败时保持默认值，不影响正常使用（与原 App 行为一致，
 * 失败路径静默——Header 仅据此显示"未配置"提示，真实裁决在后端）。
 */
export function useLlmStatus() {
  const [llmReady, setLlmReady] = useState(true); // 默认 true，加载后更新
  const [showLlmConfig, setShowLlmConfig] = useState(false);

  const fetchLlmStatus = useCallback(async () => {
    try {
      const data = await api.getLlmEnvConfig();
      setLlmReady(data.llmReady);
    } catch {
      // 加载失败时保持默认值（true），不影响正常使用
    }
  }, []);

  return { llmReady, showLlmConfig, setShowLlmConfig, fetchLlmStatus };
}
