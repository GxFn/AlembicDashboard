import { useCallback, useState } from 'react';
import api from '../api';
import { getErrorMessage } from '../utils/error';
import type { DashboardProjectActionResult, DashboardProjectsSnapshot } from '../types';

/**
 * useProjectsControl — 项目运行时控制快照 + 项目动作完成后的刷新编排
 * （W7-e 自 App.tsx 搬出；仅喂 Header 的 4 个 props，形态不变）。
 *
 * 边界（底稿 D2 ③）：SPM 扫描状态（targets/scanResults 等）冻结在 App，
 * 本 hook 通过注入的回调触达——
 *   - resetProjectScopedUi：项目切换后清空 project-scoped UI 状态（App 持有）
 *   - fetchData / fetchTargets：App 的全局数据与 targets 刷新（fetchTargets 写 SPM 状态）
 */
export function useProjectsControl(options: {
  resetProjectScopedUi: () => void;
  fetchData: () => Promise<void>;
  fetchTargets: () => Promise<void>;
}) {
  const { resetProjectScopedUi, fetchData, fetchTargets } = options;
  const [projectsSnapshot, setProjectsSnapshot] = useState<DashboardProjectsSnapshot | null>(null);
  const [projectsLoading, setProjectsLoading] = useState(false);

  const fetchProjectsSnapshot = useCallback(async () => {
    setProjectsLoading(true);
    try {
      const snapshot = await api.getProjectsSnapshot();
      setProjectsSnapshot(snapshot);
    } catch (err: unknown) {
      setProjectsSnapshot(null);
      console.warn('项目控制状态加载失败:', getErrorMessage(err));
    } finally {
      setProjectsLoading(false);
    }
  }, []);

  const handleProjectActionCompleted = useCallback(async (
    result: DashboardProjectActionResult,
    action: DashboardProjectActionResult['action'],
  ) => {
    setProjectsSnapshot(result.snapshot);
    resetProjectScopedUi();
    if (action === 'stop' && result.deferredStopProject) {
      return;
    }
    const settled = await Promise.allSettled([
      fetchData(),
      fetchTargets(),
      fetchProjectsSnapshot(),
    ]);
    const failed = settled.find((item) => item.status === 'rejected');
    if (failed) {
      console.warn('项目切换后刷新失败:', failed.reason);
    }
  }, [resetProjectScopedUi, fetchData, fetchTargets, fetchProjectsSnapshot]);

  return { projectsSnapshot, projectsLoading, fetchProjectsSnapshot, handleProjectActionCompleted };
}
