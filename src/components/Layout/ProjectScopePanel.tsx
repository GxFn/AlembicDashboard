import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, Database, FolderGit2, FolderPlus, RefreshCw, SearchCheck, Server } from 'lucide-react';
import api from '../../api';
import { useI18n } from '../../i18n';
import { cn } from '../../lib/utils';
import { notify } from '../../utils/notification';
import { getErrorMessage } from '../../utils/error';
import type { ProjectScopeFolderSummary, ProjectScopeSummary, RuntimeBoundary } from '../../types';
import { Button } from '../ui/Button';

function compactPath(path: string | null | undefined): string {
  if (!path) {
    return '—';
  }
  const normalized = path.replace(/\\/g, '/');
  const parts = normalized.split('/').filter(Boolean);
  if (parts.length <= 4) {
    return path;
  }
  return `…/${parts.slice(-4).join('/')}`;
}

function pathKey(path: string | null | undefined): string {
  return (path ?? '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

function sourceFoldersFor(
  folders: ProjectScopeFolderSummary[],
  summary: ProjectScopeSummary | null,
): ProjectScopeFolderSummary[] {
  const controlRootKey = pathKey(summary?.controlRoot);
  return folders.filter((folder) => pathKey(folder.path) !== controlRootKey);
}

function projectDisplayNameFromRuntime(runtimeBoundary?: RuntimeBoundary): string | null {
  const projectRoot = runtimeBoundary?.project.projectRoot?.replace(/\\/g, '/').replace(/\/+$/, '');
  const folderName = projectRoot?.split('/').filter(Boolean).pop();
  return folderName || runtimeBoundary?.project.projectId || null;
}

function ProjectScopeField({
  label,
  value,
  className,
}: {
  label: string;
  value: string | null | undefined;
  className?: string;
}) {
  const displayValue = value || '—';
  return (
    <div className={cn('min-w-0 rounded-[var(--radius-md)] border border-[var(--border-muted)] bg-[var(--bg-subtle)]/60 px-2 py-1.5', className)}>
      <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--fg-muted)]">{label}</p>
      <p className="mt-0.5 truncate text-xs font-medium text-[var(--fg-default)]" title={displayValue}>
        {compactPath(displayValue)}
      </p>
    </div>
  );
}

export function ProjectScopePanel({ runtimeBoundary }: { runtimeBoundary?: RuntimeBoundary }) {
  const { t } = useI18n();
  const capability = runtimeBoundary?.capabilities.projectScope;
  const isSupported = capability?.available === true;
  const [summary, setSummary] = useState<ProjectScopeSummary | null>(runtimeBoundary?.project.projectScope ?? null);
  const [folders, setFolders] = useState<ProjectScopeFolderSummary[]>(runtimeBoundary?.project.projectScope?.folders ?? []);
  const [folderPath, setFolderPath] = useState('');
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolutionText, setResolutionText] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const sourceFolders = useMemo(() => sourceFoldersFor(folders, summary), [folders, summary]);
  const displayName = summary?.displayName ?? projectDisplayNameFromRuntime(runtimeBoundary) ?? t('header.projectScopeTitle');
  const storageKind = summary?.storageKind ?? '—';
  const readyText = loading ? t('header.projectScopeLoading') : t('header.projectScopeReady');
  const folderCountText = t('header.projectScopeFolderCount', { count: sourceFolders.length });

  const loadProjectScope = useCallback(async () => {
    if (!isSupported) {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [scopeResult, foldersResult] = await Promise.all([
        api.getProjectScope(),
        api.listProjectScopeFolders(),
      ]);
      const nextSummary = scopeResult.summary ?? scopeResult.projectScope ?? runtimeBoundary?.project.projectScope ?? null;
      setSummary(nextSummary);
      setFolders(foldersResult.folders.length > 0 ? foldersResult.folders : nextSummary?.folders ?? []);
    } catch (err: unknown) {
      setError(getErrorMessage(err, t('header.projectScopeLoadFailed')));
    } finally {
      setLoading(false);
    }
  }, [isSupported, runtimeBoundary?.project.projectScope, t]);

  useEffect(() => {
    if (isSupported) {
      void loadProjectScope();
    }
  }, [isSupported, loadProjectScope]);

  const handleAddFolder = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const trimmedPath = folderPath.trim();
    if (!trimmedPath) {
      return;
    }

    setAdding(true);
    setError(null);
    try {
      const result = await api.addProjectScopeFolder({
        folderPath: trimmedPath,
        projectScopeId: summary?.projectScopeId ?? undefined,
        role: sourceFolders.length === 0 ? 'primary-source' : 'source',
      });
      const nextSummary = result.summary ?? result.projectScope ?? summary;
      setSummary(nextSummary);
      setFolders(nextSummary?.folders ?? []);
      setFolderPath('');
      notify(t('header.projectScopeAddSuccess'), {
        title: t('header.projectScopeTitle'),
        type: 'success',
      });
      void loadProjectScope();
    } catch (err: unknown) {
      notify(getErrorMessage(err, t('header.projectScopeAddFailed')), {
        title: t('header.projectScopeAddFailed'),
        type: 'error',
      });
    } finally {
      setAdding(false);
    }
  };

  const handleResolveFolder = async () => {
    const trimmedPath = folderPath.trim();
    if (!trimmedPath) {
      return;
    }

    setResolving(true);
    setError(null);
    setResolutionText(null);
    try {
      const result = await api.resolveProjectScopeFolder(trimmedPath);
      const nextSummary = result.summary ?? result.projectScope ?? summary;
      setSummary(nextSummary);
      setResolutionText(result.resolution?.currentFolderPath ?? result.resolution?.controlRoot ?? nextSummary?.projectScopeId ?? null);
    } catch (err: unknown) {
      setError(getErrorMessage(err, t('header.projectScopeResolveFailed')));
    } finally {
      setResolving(false);
    }
  };

  if (!isSupported) {
    return (
      <section className="px-2 py-2" aria-label={t('header.projectScopeTitle')}>
        <div className="rounded-[var(--radius-md)] border border-amber-300/40 bg-amber-500/10 p-2 text-xs text-amber-600">
          <div className="flex items-center gap-1.5 font-medium">
            <AlertTriangle size={13} />
            {t('header.projectScopeUnavailable')}
          </div>
          <p className="mt-1 text-[var(--fg-subtle)]">{t('header.projectScopeUnavailableHint')}</p>
        </div>
      </section>
    );
  }

  return (
    <section className="px-2 py-2" aria-label={t('header.projectScopeTitle')}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <Server size={13} className="text-emerald-500" />
          <p className="truncate text-xs font-semibold text-[var(--fg-default)]">{t('header.projectScopeTitle')}</p>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          type="button"
          aria-label={t('header.projectScopeRefresh')}
          loading={loading}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void loadProjectScope();
          }}
        >
          <RefreshCw size={13} />
        </Button>
      </div>

      <div className="mt-2 rounded-[var(--radius-md)] border border-[var(--border-muted)] bg-[var(--bg-surface)] px-2.5 py-2">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-[var(--fg-default)]" title={displayName}>
              {displayName}
            </p>
            <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5 text-[11px] text-[var(--fg-subtle)]">
              <span className="rounded-full border border-emerald-300/40 bg-emerald-500/10 px-1.5 py-0.5 font-medium text-emerald-600">
                {readyText}
              </span>
              <span className="rounded-full border border-[var(--border-muted)] bg-[var(--bg-subtle)] px-1.5 py-0.5">
                {storageKind}
              </span>
              <span className="rounded-full border border-[var(--border-muted)] bg-[var(--bg-subtle)] px-1.5 py-0.5">
                {folderCountText}
              </span>
            </div>
          </div>
          <span className="shrink-0 rounded-full border border-[var(--border-muted)] bg-[var(--bg-subtle)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--fg-subtle)]">
            {summary?.projectScopeId ? t('header.projectScopeBound') : t('header.projectScopeUnbound')}
          </span>
        </div>
        <button
          type="button"
          className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-[var(--accent)] hover:text-[var(--accent-hover)]"
          aria-expanded={detailsOpen}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setDetailsOpen((value) => !value);
          }}
        >
          <ChevronDown
            size={13}
            className={cn('transition-transform', detailsOpen ? 'rotate-180' : '')}
          />
          {detailsOpen ? t('header.projectScopeHideDetails') : t('header.projectScopeDetails')}
        </button>
      </div>

      {detailsOpen && (
        <div className="mt-2 space-y-2 rounded-[var(--radius-md)] border border-[var(--border-muted)] bg-[var(--bg-subtle)]/40 p-2">
          <div className="grid grid-cols-2 gap-1.5">
            <ProjectScopeField label={t('header.projectScopeControlRoot')} value={summary?.controlRoot} className="col-span-2" />
            <ProjectScopeField label={t('header.projectScopeDataRoot')} value={summary?.dataRoot} />
            <ProjectScopeField label={t('header.projectScopeStorageKind')} value={summary?.storageKind} />
            <ProjectScopeField label={t('header.projectScopeId')} value={summary?.projectScopeId ?? runtimeBoundary?.project.projectScopeId} className="col-span-2" />
          </div>

          <div className="rounded-[var(--radius-md)] border border-[var(--border-muted)] bg-[var(--bg-surface)] p-2">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="inline-flex min-w-0 items-center gap-1.5 text-xs font-medium text-[var(--fg-default)]">
                <FolderGit2 size={13} className="text-sky-500" />
                {t('header.projectScopeFolders')}
              </span>
              <span className="shrink-0 rounded-full bg-[var(--bg-subtle)] px-1.5 py-0.5 text-[10px] text-[var(--fg-subtle)]">
                {sourceFolders.length}
              </span>
            </div>
            {sourceFolders.length === 0 ? (
              <p className="text-xs text-[var(--fg-subtle)]">{t('header.projectScopeFoldersEmpty')}</p>
            ) : (
              <div className="space-y-1">
                {sourceFolders.map((folder) => (
                  <div
                    key={`${folder.folderId}:${folder.path}`}
                    className="rounded-[var(--radius-sm)] border border-[var(--border-muted)] bg-[var(--bg-subtle)]/60 px-2 py-1"
                  >
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className="rounded-full bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-medium text-sky-600">
                        {folder.role}
                      </span>
                      <span className="truncate text-xs font-medium text-[var(--fg-default)]">{folder.displayName}</span>
                    </div>
                    <p className="mt-0.5 truncate text-[11px] text-[var(--fg-subtle)]" title={folder.path}>
                      {compactPath(folder.path)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <form className="space-y-1.5" onSubmit={handleAddFolder}>
            <div className="flex items-center gap-1.5 text-xs font-medium text-[var(--fg-default)]">
              <FolderPlus size={13} className="text-emerald-500" />
              {t('header.projectScopeManage')}
            </div>
            <label className="sr-only" htmlFor="project-scope-folder-path">{t('header.projectScopeFolderPath')}</label>
            <input
              id="project-scope-folder-path"
              value={folderPath}
              onChange={(event) => setFolderPath(event.target.value)}
              onClick={(event) => event.stopPropagation()}
              placeholder={t('header.projectScopeFolderPlaceholder')}
              className="h-8 w-full rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-surface)] px-2 text-xs text-[var(--fg-default)] outline-none placeholder:text-[var(--fg-muted)] focus:border-[var(--accent)]/50"
            />
            <div className="flex items-center gap-1.5">
              <Button
                variant="secondary"
                size="sm"
                type="button"
                disabled={!folderPath.trim()}
                loading={resolving}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  void handleResolveFolder();
                }}
              >
                <SearchCheck size={13} />
                {t('header.projectScopeResolve')}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                type="submit"
                disabled={!folderPath.trim()}
                loading={adding}
              >
                <FolderPlus size={13} />
                {t('header.projectScopeAddFolder')}
              </Button>
            </div>
          </form>
        </div>
      )}

      {resolutionText && (
        <p className="mt-1.5 truncate text-[11px] text-emerald-600" title={resolutionText}>
          {t('header.projectScopeResolved')}: {compactPath(resolutionText)}
        </p>
      )}
      {error && (
        <p className="mt-1.5 text-[11px] text-red-500">
          {error}
        </p>
      )}
      {!summary && !loading && !error && (
        <div className="mt-2 flex items-start gap-1.5 rounded-[var(--radius-md)] border border-[var(--border-muted)] bg-[var(--bg-subtle)]/60 p-2 text-xs text-[var(--fg-subtle)]">
          <Database size={13} className="mt-0.5 shrink-0" />
          {t('header.projectScopeEmpty')}
        </div>
      )}
    </section>
  );
}
