import React, { useState, useEffect, useCallback } from 'react';
import { ArrowRightLeft, Cpu, ChevronDown, ChevronRight, Settings, Search, Zap, FlaskConical, FlaskRound, TerminalSquare, ShieldCheck, ShieldAlert, Eye, Server, FolderGit2, ExternalLink, RefreshCw, Power, CheckCircle2, AlertTriangle, CircleOff, Loader2 } from 'lucide-react';
import api from '../../api';
import { getSocket } from '../../lib/socket';
import { useI18n } from '../../i18n';
import { cn } from '../../lib/utils';
import { notify } from '../../utils/notification';
import { getErrorMessage } from '../../utils/error';
import type { DashboardProjectActionResult, DashboardProjectRuntimeScopeSummary, DashboardProjectsSnapshot, RuntimeBoundary } from '../../types';
import { Button } from '../ui/Button';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '../ui/Tooltip';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuLabel,
} from '../ui/DropdownMenu';
import { TabType } from '../../constants';

/** 格式化 token 数字：1234 → "1.2k", 1234567 → "1.2M" */
function fmtTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k';
  return String(n);
}

/** 中间省略：保留前后字符，中间用 … 替代 */
function midEllipsis(s: string, max: number): string {
  if (s.length <= max) return s;
  const keep = Math.floor((max - 1) / 2);
  return s.slice(0, keep) + '…' + s.slice(s.length - keep);
}

function runtimeRouteLabelKey(route: string): string {
  switch (route) {
    case 'local-alembic':
    case 'local-alembic-daemon':
      return 'header.runtimeRouteLocalAlembic';
    case 'embedded-runtime':
    case 'embedded-plugin-runtime':
      return 'header.runtimeRouteEmbedded';
    case 'local-install':
    case 'local-alembic-install':
      return 'header.runtimeRouteLocalInstall';
    case 'unavailable':
      return 'header.runtimeRouteUnavailable';
    case 'unknown':
      return 'header.runtimeRouteUnknown';
    default:
      return '';
  }
}

function runtimeRouteTone(route: string): string {
  switch (route) {
    case 'local-alembic':
    case 'local-alembic-daemon':
      return 'bg-emerald-500/10 text-emerald-600 border-emerald-300/40';
    case 'embedded-runtime':
    case 'embedded-plugin-runtime':
    case 'local-install':
    case 'local-alembic-install':
      return 'bg-sky-500/10 text-sky-600 border-sky-300/40';
    case 'unavailable':
      return 'bg-red-500/10 text-red-600 border-red-300/40';
    default:
      return 'bg-[var(--bg-subtle)] text-[var(--fg-subtle)] border-[var(--border-default)]';
  }
}

function availabilityLabelKey(value: boolean | null | undefined): string {
  if (value === true) {
    return 'header.runtimeAvailable';
  }
  if (value === false) {
    return 'header.runtimeUnavailable';
  }
  return 'header.runtimeUnknown';
}

function sandboxLabelKey(sandbox: { mode: string; available: boolean }): string {
  if (!sandbox.available && sandbox.mode !== 'disabled') {
    return 'sandbox.unavailable';
  }
  switch (sandbox.mode) {
    case 'enforce':
      return 'sandbox.enforce';
    case 'audit':
      return 'sandbox.audit';
    case 'disabled':
      return 'sandbox.disabled';
    default:
      return 'sandbox.unavailable';
  }
}

function sandboxHintKey(sandbox: { mode: string; available: boolean }): string {
  if (!sandbox.available && sandbox.mode !== 'disabled') {
    return 'sandbox.unavailableHint';
  }
  switch (sandbox.mode) {
    case 'enforce':
      return 'sandbox.enforceHint';
    case 'audit':
      return 'sandbox.auditHint';
    case 'disabled':
      return 'sandbox.disabledHint';
    default:
      return 'sandbox.unavailableHint';
  }
}

function SandboxStatusIcon({ sandbox }: { sandbox: { mode: string; available: boolean } }) {
  if (!sandbox.available && sandbox.mode !== 'disabled') {
    return <ShieldAlert size={11} className="text-[var(--fg-muted)]" />;
  }
  if (sandbox.mode === 'enforce') {
    return <ShieldCheck size={11} className="text-emerald-500" />;
  }
  if (sandbox.mode === 'audit') {
    return <Eye size={11} className="text-blue-500" />;
  }
  return <ShieldAlert size={11} className="text-red-500" />;
}

function projectStatusLabelKey(status: string): string {
  switch (status) {
    case 'ready':
      return 'header.projectStatusReady';
    case 'stopped':
      return 'header.projectStatusStopped';
    case 'starting':
      return 'header.projectStatusStarting';
    case 'stale':
      return 'header.projectStatusStale';
    case 'failed':
      return 'header.projectStatusFailed';
    case 'missing':
      return 'header.projectStatusMissing';
    case 'unavailable':
      return 'header.projectStatusUnavailable';
    default:
      return 'header.projectStatusUnknown';
  }
}

function projectStatusTone(project: DashboardProjectRuntimeScopeSummary): string {
  if (project.flags.missing || project.status === 'missing') {
    return 'bg-red-500/10 text-red-600 border-red-300/40';
  }
  if (project.flags.unavailable || project.status === 'unavailable' || project.status === 'failed') {
    return 'bg-amber-500/10 text-amber-600 border-amber-300/40';
  }
  if (project.status === 'ready') {
    return 'bg-emerald-500/10 text-emerald-600 border-emerald-300/40';
  }
  return 'bg-[var(--bg-subtle)] text-[var(--fg-subtle)] border-[var(--border-default)]';
}

function ProjectStatusIcon({ project }: { project: DashboardProjectRuntimeScopeSummary }) {
  if (project.flags.missing || project.status === 'missing') {
    return <AlertTriangle size={12} />;
  }
  if (project.flags.unavailable || project.status === 'unavailable' || project.status === 'failed') {
    return <CircleOff size={12} />;
  }
  if (project.status === 'ready') {
    return <CheckCircle2 size={12} />;
  }
  return <Power size={12} />;
}

function projectActionKey(
  action: DashboardProjectActionResult['action'],
  project: DashboardProjectRuntimeScopeSummary,
): string {
  return `${action}:${project.projectId || project.cacheKey || project.projectRoot}`;
}

function projectActionLabelKey(action: DashboardProjectActionResult['action']): string {
  switch (action) {
    case 'open-dashboard':
      return 'header.projectActionOpen';
    case 'switch':
      return 'header.projectActionSwitch';
    case 'stop':
      return 'header.projectActionStop';
    default:
      return 'header.projectAction';
  }
}

function compactProjectRoot(projectRoot: string): string {
  const normalized = projectRoot.replace(/\\/g, '/');
  const parts = normalized.split('/').filter(Boolean);
  if (parts.length <= 3) {
    return projectRoot || '—';
  }
  return `…/${parts.slice(-3).join('/')}`;
}

function isSameProject(
  left: DashboardProjectRuntimeScopeSummary | null | undefined,
  right: DashboardProjectRuntimeScopeSummary | null | undefined,
): boolean {
  if (!left || !right) {
    return false;
  }
  if (left.projectId && right.projectId) {
    return left.projectId === right.projectId;
  }
  return left.cacheKey === right.cacheKey || left.projectRoot === right.projectRoot;
}

function isDifferentOrigin(url: string | null | undefined): boolean {
  if (!url) {
    return false;
  }
  try {
    return new URL(url, window.location.href).origin !== window.location.origin;
  } catch {
    return false;
  }
}

interface AiProvider {
  id: string;
  label: string;
  defaultModel: string;
  hasKey?: boolean;
}

/** Tab → 显示名称映射 (i18n 兼容) */
const TAB_LABELS: Record<TabType, string> = {
  recipes: 'sidebar.recipes',
  spm: 'sidebar.moduleExplorer',
  candidates: 'sidebar.candidates',
  knowledge: 'sidebar.batchManage',
  guard: 'sidebar.guard',
  panorama: 'sidebar.panorama',
  skills: 'sidebar.skills',
  jobs: 'sidebar.jobs',
  wiki: 'sidebar.repoWiki',
  signals: 'sidebar.signals',
  ai: 'sidebar.aiAssistant',
  help: 'sidebar.help',
};

interface HeaderProps {
  aiConfig?: { provider: string; model: string };
  llmReady?: boolean;
  onOpenLlmConfig?: () => void;
  onBeforeAiSwitch?: () => void;
  onAiConfigChange?: () => void;
  /** 当前激活的 Tab (用于面包屑) */
  activeTab?: TabType;
  /** 打开 ⌘K Command Palette */
  onOpenCommandPalette?: () => void;
  /** 项目名称 */
  projectName?: string;
  /** 后端运行路线与能力摘要（只展示，不决定策略） */
  runtimeBoundary?: RuntimeBoundary;
  /** Alembic-owned multi-project runtime control snapshot */
  projectsSnapshot?: DashboardProjectsSnapshot | null;
  projectsLoading?: boolean;
  onRefreshProjects?: () => Promise<void> | void;
  onProjectActionCompleted?: (
    result: DashboardProjectActionResult,
    action: DashboardProjectActionResult['action'],
  ) => Promise<void> | void;
  /** 候选总数（用于面包屑插值） */
  candidateCount?: number;
}

const Header: React.FC<HeaderProps> = ({
  aiConfig, llmReady = true, onOpenLlmConfig,
  onBeforeAiSwitch, onAiConfigChange,
  activeTab,
  onOpenCommandPalette,
  projectName,
  runtimeBoundary,
  projectsSnapshot,
  projectsLoading = false,
  onRefreshProjects,
  onProjectActionCompleted,
  candidateCount = 0,
}) => {
  const { t } = useI18n();
  const [aiProviders, setAiProviders] = useState<AiProvider[]>([]);
  const [aiSwitching, setAiSwitching] = useState(false);
  const [projectActionPending, setProjectActionPending] = useState<string | null>(null);

  const projects = projectsSnapshot?.projects ?? [];
  const selectedProject = projectsSnapshot?.selectedProject ?? null;
  const activeRuntimeProject = projectsSnapshot?.activeRuntimeProject ?? null;
  const selectedAndActiveSame = isSameProject(selectedProject, activeRuntimeProject);
  const displayProject = selectedProject ?? activeRuntimeProject;
  const projectSwitcherLabel = displayProject?.displayName || projectName || 'Alembic';

  const handleProjectAction = async (
    project: DashboardProjectRuntimeScopeSummary,
    action: 'open-dashboard' | 'switch' | 'stop',
  ) => {
    if (!project.projectId) {
      notify(t('header.projectActionMissingId'), {
        title: t('header.projectActionFailed'),
        type: 'error',
      });
      return;
    }

    const pendingKey = projectActionKey(action, project);
    setProjectActionPending(pendingKey);
    try {
      const result = action === 'open-dashboard'
        ? await api.openProjectDashboard(project.projectId)
        : action === 'switch'
          ? await api.switchProject(project.projectId)
          : await api.stopProject(project.projectId);

      if (!result.ok) {
        throw new Error(result.error || t('header.projectActionFailed'));
      }

      notify(t('header.projectActionSuccess', { action: t(projectActionLabelKey(action)) }), {
        title: project.displayName,
      });

      const dashboardUrl = result.handoff?.dashboardUrl;
      if ((action === 'open-dashboard' || action === 'switch') && dashboardUrl && isDifferentOrigin(dashboardUrl)) {
        window.location.assign(dashboardUrl);
        return;
      }

      await onProjectActionCompleted?.(result, action);
    } catch (err: unknown) {
      notify(getErrorMessage(err, t('header.projectActionFailed')), {
        title: t('header.projectActionFailed'),
        type: 'error',
      });
    } finally {
      setProjectActionPending(null);
    }
  };

  const handleRefreshProjects = async () => {
    setProjectActionPending('refresh');
    try {
      await onRefreshProjects?.();
    } catch (err: unknown) {
      notify(getErrorMessage(err, t('header.projectsLoadFailed')), {
        title: t('header.projectsLoadFailed'),
        type: 'error',
      });
    } finally {
      setProjectActionPending(null);
    }
  };

  /* ── 测试模式标识（全局持久展示） ── */
  const [testMode, setTestMode] = useState<{
    enabled: boolean;
    bootstrapDims: string[];
    rescanDims: string[];
    terminal: { enabled: boolean; toolset: string };
    sandbox: { mode: string; available: boolean };
  } | null>(null);
  useEffect(() => {
    api.getTestModeConfig().then(cfg => {
      if (cfg.enabled || cfg.terminal.enabled || cfg.sandbox.mode !== 'disabled') {
        setTestMode(cfg);
      }
    }).catch(() => { /* best-effort */ });
  }, []);

  /* ── Token 消耗指标（事件驱动刷新） ── */
  const [tokenSummary, setTokenSummary] = useState<{ total_tokens: number; call_count: number } | null>(null);
  const refreshTokens = useCallback(() => {
    api.getTokenUsage7Days()
      .then(d => setTokenSummary(d.summary))
      .catch(() => { /* intentionally ignored: token usage is a non-critical metric */ });
  }, []);

  useEffect(() => {
    refreshTokens();
    const socket = getSocket();
    const onTokenChange = () => refreshTokens();
    socket.on('candidate-created', onTokenChange);
    socket.on('bootstrap:all-completed', onTokenChange);
    socket.on('token-usage-updated', onTokenChange);
    return () => {
      socket.off('candidate-created', onTokenChange);
      socket.off('bootstrap:all-completed', onTokenChange);
      socket.off('token-usage-updated', onTokenChange);
    };
  }, [refreshTokens]);

  /* ── AI 提供商切换 ── */
  const handleSelectAi = async (provider: AiProvider) => {
    const isSwitchingFromMock = aiConfig?.provider === 'mock' && provider.id !== 'mock';
    const isSwitchingToMock = aiConfig?.provider !== 'mock' && provider.id === 'mock';

    // 切换到 Mock 模式时，提醒用户
    if (isSwitchingToMock) {
      if (!window.confirm(t('header.mockSwitchToConfirm'))) {
        return;
      }
    }

    // 从 Mock 切出时，询问是否清理伪造数据
    if (isSwitchingFromMock) {
      const shouldClean = window.confirm(t('header.mockSwitchFromConfirm'));
      if (shouldClean) {
        try {
          const result = await api.cleanupMockData();
          notify(t('header.mockCleanupSuccessBody', { count: result.deleted }), {
            title: t('header.mockCleanupSuccessTitle'),
            type: 'success',
          });
        } catch (err: unknown) {
          notify(getErrorMessage(err, t('header.mockCleanupFailedBody')), {
            title: t('header.mockCleanupFailedTitle'),
            type: 'error',
          });
        }
      }
    }

    setAiSwitching(true);
    try {
      onBeforeAiSwitch?.();
      await api.saveLlmEnvConfig({
        provider: provider.id,
        model: provider.defaultModel,
      });
      if (onAiConfigChange) {
        onAiConfigChange();
      }
    } catch (e) {
      console.error('AI config update failed', e);
    } finally {
      setAiSwitching(false);
    }
  };

  const loadProviders = useCallback(() => {
    if (aiProviders.length === 0) {
      api.getAiProviders().then(setAiProviders).catch(() => { /* intentionally ignored: provider list load is best-effort */ });
    }
  }, [aiProviders.length]);

  // Eagerly load providers so we know hasKey for the status dot
  useEffect(() => { loadProviders(); }, [loadProviders]);

  // Derive current provider's key availability
  const currentProviderHasKey = aiConfig
    ? aiProviders.find(p => p.id === aiConfig.provider)?.hasKey
    : undefined;

  const tabLabel = activeTab ? t(TAB_LABELS[activeTab], { count: candidateCount }) : '';
  const runtimeRouteLabel = runtimeBoundary
    ? runtimeRouteLabelKey(runtimeBoundary.route)
      ? t(runtimeRouteLabelKey(runtimeBoundary.route))
      : runtimeBoundary.route
    : '';
  const fileMonitorLabel = runtimeBoundary
    ? t(availabilityLabelKey(runtimeBoundary.capabilities.fileMonitor?.available))
    : '';
  const internalAiLabel = runtimeBoundary
    ? t(availabilityLabelKey(runtimeBoundary.capabilities.internalAi?.available))
    : '';
  const dashboardHandoff = runtimeBoundary?.capabilities.dashboard?.handoff;
  const terminalCapability = testMode?.terminal.enabled ? testMode.terminal : null;
  const sandboxStatus = testMode?.sandbox ?? null;
  const hasNestedRuntimeDetails = Boolean(terminalCapability || sandboxStatus);

  return (
    <TooltipProvider>
      <header
        className="h-[var(--topbar-height)] flex items-center justify-between px-5 border-b border-[var(--border-muted)] glass shrink-0 gap-3 select-none z-10"
      >
        {/* ── 左侧：面包屑 + 测试模式标识 ── */}
        <div className="flex items-center gap-2 min-w-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 min-w-0 max-w-[220px] px-2 text-[var(--fg-subtle)] hover:text-[var(--fg-default)]"
              >
                {projectsLoading ? <Loader2 size={14} className="animate-spin shrink-0" /> : <FolderGit2 size={14} className="shrink-0" />}
                <span className="truncate" title={projectSwitcherLabel}>{projectSwitcherLabel}</span>
                <ChevronDown size={12} className="shrink-0 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-[440px] max-w-[calc(100vw-2rem)]">
              <div className="flex items-center justify-between gap-2 px-2 py-1.5">
                <DropdownMenuLabel className="px-0 py-0">{t('header.projectsControl')}</DropdownMenuLabel>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t('header.projectsRefresh')}
                      loading={projectActionPending === 'refresh'}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        handleRefreshProjects();
                      }}
                    >
                      <RefreshCw size={13} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t('header.projectsRefresh')}</TooltipContent>
                </Tooltip>
              </div>
              <DropdownMenuSeparator />
              <div className="px-2 py-1 text-xs text-[var(--fg-subtle)] space-y-1">
                {selectedAndActiveSame ? (
                  <p>{t('header.projectsCurrent')}: {selectedProject?.displayName || t('header.projectsNone')}</p>
                ) : (
                  <>
                    <p>{t('header.projectsSelected')}: {selectedProject?.displayName || t('header.projectsNone')}</p>
                    <p>{t('header.projectsActive')}: {activeRuntimeProject?.displayName || t('header.projectsNone')}</p>
                  </>
                )}
              </div>
              <DropdownMenuSeparator />
              <div className="max-h-[420px] overflow-y-auto py-1">
                {projects.length === 0 ? (
                  <div className="px-3 py-6 text-center text-sm text-[var(--fg-subtle)]">
                    {projectsLoading ? t('header.projectsLoading') : t('header.projectsUnavailable')}
                  </div>
                ) : (
                  projects.map((project) => {
                    const canAddress = Boolean(project.projectId);
                    const cannotUse = project.flags.missing || !project.projectExists;
                    const openPending = projectActionPending === projectActionKey('open-dashboard', project);
                    const switchPending = projectActionPending === projectActionKey('switch', project);
                    const stopPending = projectActionPending === projectActionKey('stop', project);
                    return (
                      <div
                        key={project.cacheKey || project.projectRoot}
                        className="mx-1 my-1 rounded-[var(--radius-md)] border border-[var(--border-muted)] bg-[var(--bg-surface)] px-2 py-2"
                      >
                        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className={cn(
                                'inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium shrink-0',
                                projectStatusTone(project),
                              )}>
                                <ProjectStatusIcon project={project} />
                                {t(projectStatusLabelKey(project.status))}
                              </span>
                              {project.flags.selected && project.flags.activeRuntime ? (
                                <span className="rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-600">
                                  {t('header.projectsCurrentBadge')}
                                </span>
                              ) : project.flags.selected ? (
                                <span className="rounded-full bg-[var(--bg-subtle)] px-1.5 py-0.5 text-[10px] text-[var(--fg-subtle)]">
                                  {t('header.projectsSelectedBadge')}
                                </span>
                              ) : project.flags.activeRuntime ? (
                                <span className="rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-600">
                                  {t('header.projectsActiveBadge')}
                                </span>
                              ) : null}
                              <span className="truncate text-sm font-medium text-[var(--fg-default)]">
                                {project.displayName}
                              </span>
                            </div>
                            <p className="mt-1 truncate text-xs text-[var(--fg-subtle)]" title={project.projectRoot}>
                              {compactProjectRoot(project.projectRoot)}
                            </p>
                            <p className="mt-0.5 text-xs text-[var(--fg-muted)]">
                              {project.ghost ? t('header.projectsGhost') : t('header.projectsStandard')}
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  aria-label={t('header.projectActionOpen')}
                                  loading={openPending}
                                  disabled={!canAddress || cannotUse}
                                  onClick={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    handleProjectAction(project, 'open-dashboard');
                                  }}
                                >
                                  <ExternalLink size={13} />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>{t('header.projectActionOpen')}</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  aria-label={t('header.projectActionSwitch')}
                                  loading={switchPending}
                                  disabled={!canAddress || cannotUse || project.flags.activeRuntime}
                                  onClick={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    handleProjectAction(project, 'switch');
                                  }}
                                >
                                  <ArrowRightLeft size={13} />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>{t('header.projectActionSwitch')}</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  aria-label={t('header.projectActionStop')}
                                  loading={stopPending}
                                  disabled={!canAddress || (!project.flags.activeRuntime && project.daemon.ready !== true)}
                                  onClick={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    handleProjectAction(project, 'stop');
                                  }}
                                >
                                  <Power size={13} />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>{t('header.projectActionStop')}</TooltipContent>
                            </Tooltip>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
          {tabLabel && (
            <>
              <ChevronRight size={14} className="text-[var(--fg-subtle)]/50 shrink-0" />
              <span className="text-sm text-[var(--fg-default)] font-semibold truncate">{tabLabel}</span>
            </>
          )}
          {runtimeBoundary && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className={cn(
                  'inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full border cursor-default shrink-0',
                  runtimeRouteTone(runtimeBoundary.route),
                )}>
                  <Server size={10} />
                  {runtimeRouteLabel}
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-sm text-xs">
                <p className="font-medium mb-1">{t('header.runtimeBoundary')}</p>
                <p>{t('header.runtimeRoute')}: {runtimeRouteLabel}</p>
                <p>{t('header.runtimeMode')}: {runtimeBoundary.mode}</p>
                {runtimeBoundary.project.projectId && (
                  <p>{t('header.runtimeProjectId')}: {runtimeBoundary.project.projectId}</p>
                )}
                <p>{t('header.runtimeDataRootSource')}: {runtimeBoundary.project.dataRootSource}</p>
                {runtimeBoundary.project.workspaceMode && runtimeBoundary.project.workspaceMode !== 'unknown' && (
                  <p>{t('header.runtimeWorkspaceMode')}: {runtimeBoundary.project.workspaceMode}</p>
                )}
                <p>{t('header.runtimeFileMonitor')}: {fileMonitorLabel}</p>
                <p>{t('header.runtimeInternalAi')}: {internalAiLabel}</p>
                {dashboardHandoff && (
                  <p>{t('header.runtimeDashboardHandoff')}: {dashboardHandoff}</p>
                )}
                {runtimeBoundary.hostAgentRoute?.source && (
                  <p>{t('header.runtimeHostAgent')}: {runtimeBoundary.hostAgentRoute.source}</p>
                )}
                {hasNestedRuntimeDetails && (
                  <div className="mt-2 space-y-1 border-t border-[var(--border-muted)] pt-2">
                    {terminalCapability && (
                      <p className="flex items-center gap-1.5">
                        <TerminalSquare size={11} className="text-sky-500" />
                        <span>{t('bootstrap.terminalCapability')}: {terminalCapability.toolset}</span>
                      </p>
                    )}
                    {sandboxStatus && (
                      <div className="space-y-0.5">
                        <p className="flex items-center gap-1.5">
                          <SandboxStatusIcon sandbox={sandboxStatus} />
                          <span>{t(sandboxLabelKey(sandboxStatus))}</span>
                        </p>
                        <p className="pl-[18px] text-[var(--fg-muted)]">{t(sandboxHintKey(sandboxStatus))}</p>
                      </div>
                    )}
                  </div>
                )}
              </TooltipContent>
            </Tooltip>
          )}
          {testMode?.enabled && (
            <div className="flex items-center gap-1.5 ml-2 shrink-0">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 border border-amber-300/40 cursor-default">
                    <FlaskRound size={10} />
                    {t('bootstrap.testMode')}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs text-xs">
                  <p className="font-medium mb-1">{t('bootstrap.testMode')}</p>
                  <p>Bootstrap: {testMode.bootstrapDims.length > 0 ? testMode.bootstrapDims.join(', ') : t('bootstrap.testModeAll')}</p>
                  <p>Rescan: {testMode.rescanDims.length > 0 ? testMode.rescanDims.join(', ') : t('bootstrap.testModeAll')}</p>
                </TooltipContent>
              </Tooltip>
            </div>
          )}
        </div>

        {/* ── 中间：⌘K 搜索触发 ── */}
        <button
          onClick={onOpenCommandPalette}
          aria-label={t('header.searchPlaceholder')}
          className={cn(
            "flex items-center gap-2 h-8 px-2.5 sm:px-3 rounded-[var(--radius-full)] border border-[var(--border-default)] bg-[var(--bg-subtle)]/60",
            "text-sm text-[var(--fg-subtle)] hover:border-[var(--accent)]/40 hover:text-[var(--fg-muted)] hover:shadow-[0_0_12px_var(--accent-glow)] transition-all",
            "shrink-0 justify-center lg:w-56 lg:justify-between xl:w-64 backdrop-blur-sm"
          )}
        >
          <div className="flex min-w-0 items-center gap-2">
            <Search size={14} className="shrink-0" />
            <span className="hidden truncate lg:block">{t('header.searchPlaceholder')}</span>
          </div>
          <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--bg-root)]/60 px-1.5 py-0.5 text-[10px] font-mono text-[var(--fg-subtle)]">
            ⌘K
          </kbd>
        </button>

        {/* ── 右侧：操作按钮 ── */}
        <div className="flex items-center gap-1 shrink-0">
          {/* LLM 配置警告 */}
          {!llmReady && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onOpenLlmConfig}
              className="text-[var(--warning)] animate-pulse"
            >
              <Settings size={14} />
              <span className="text-xs">{t('header.configureLlm')}</span>
            </Button>
          )}

          {/* AI Provider 选择器 */}
          {llmReady && aiConfig && (
            <DropdownMenu onOpenChange={(open) => open && loadProviders()}>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-1.5 focus-visible:ring-0 focus-visible:ring-offset-0">
                  <span className="relative shrink-0">
                    {aiConfig.provider === 'mock' ? (
                      <FlaskConical size={14} className="text-amber-500" />
                    ) : (
                      <Cpu size={14} />
                    )}
                    <span
                      className={cn(
                        "absolute -top-0.5 -right-0.5 w-[6px] h-[6px] rounded-full ring-1 ring-[var(--bg-root)]",
                        aiConfig.provider === 'mock'
                          ? "bg-amber-500"
                          : currentProviderHasKey === false
                            ? "bg-red-400"
                            : "bg-emerald-500"
                      )}
                    />
                  </span>
                  <span className="text-xs" title={`${aiConfig.provider}/${aiConfig.model}`}>{midEllipsis(aiConfig.model, 28)}</span>
                  {aiConfig.provider === 'mock' && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-500 font-medium shrink-0">
                      Mock
                    </span>
                  )}
                  {tokenSummary && tokenSummary.total_tokens > 0 && (
                    <span className="flex items-center gap-0.5 ml-0.5 text-[10px] text-[var(--fg-subtle)] tabular-nums shrink-0">
                      <Zap size={9} className="text-amber-500/70" />{fmtTokens(tokenSummary.total_tokens)}
                    </span>
                  )}
                  <ChevronDown size={12} className="shrink-0" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>{t('header.switchAi')}</DropdownMenuLabel>
                {aiConfig.provider === 'mock' && (
                  <div className="px-2 py-1.5 text-[11px] text-amber-500/80 bg-amber-500/5 rounded mx-1 mb-1">
                    🧪 {t('header.mockModeHint')}
                  </div>
                )}
                <DropdownMenuSeparator />
                {aiProviders.length === 0 ? (
                  <DropdownMenuItem disabled>{t('common.loading')}</DropdownMenuItem>
                ) : (
                  aiProviders.map((p) => (
                    <DropdownMenuItem
                      key={p.id}
                      onClick={() => handleSelectAi(p)}
                      disabled={aiSwitching}
                      className={cn(
                        aiConfig.provider === p.id && "bg-[var(--accent-subtle)] text-[var(--accent)] font-medium",
                        p.hasKey === false && "opacity-50"
                      )}
                    >
                      <span className="flex items-center gap-2 flex-1 min-w-0">
                        <span
                          className={cn(
                            "inline-block w-1.5 h-1.5 rounded-full shrink-0",
                            p.hasKey !== false ? "bg-emerald-500" : "bg-[var(--fg-subtle)]"
                          )}
                        />
                        <span className="flex flex-col min-w-0">
                          <span className="truncate">{p.label}</span>
                          <span className="text-[10px] text-[var(--fg-subtle)] truncate">{p.defaultModel}</span>
                        </span>
                      </span>
                      {aiConfig.provider === p.id && <span className="text-xs shrink-0">✓</span>}
                    </DropdownMenuItem>
                  ))
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onOpenLlmConfig}>
                  <Settings size={14} />
                  <span>{t('header.editEnvConfig')}</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

        </div>
      </header>
    </TooltipProvider>
  );
};

export default Header;
