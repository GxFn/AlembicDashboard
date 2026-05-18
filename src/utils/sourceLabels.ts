type TranslateFn = (key: string, vars?: Record<string, string | number>) => string;

export interface SourceLabelInfo {
  labelKey: string;
  color: string;
  compatibility?: boolean;
}

const DEFAULT_SOURCE_COLOR = 'text-[var(--fg-secondary)] bg-[var(--bg-subtle)] border-[var(--border-default)]';

const SOURCE_LABELS: Record<string, SourceLabelInfo> = {
  'host-agent': {
    labelKey: 'sources.hostAgent',
    color: 'text-blue-600 dark:text-blue-400 bg-blue-500/10 border-blue-500/20',
  },
  'alembic-agent': {
    labelKey: 'sources.alembicAgent',
    color: 'text-violet-600 dark:text-violet-400 bg-violet-500/10 border-violet-500/20',
  },
  'host-edit': {
    labelKey: 'sources.hostEdit',
    color: 'text-orange-600 dark:text-orange-400 bg-orange-500/10 border-orange-500/20',
  },
  'ide-agent': {
    labelKey: 'sources.legacyIdeAgent',
    color: 'text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/20',
    compatibility: true,
  },
  'ide-edit': {
    labelKey: 'sources.legacyIdeEdit',
    color: 'text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/20',
    compatibility: true,
  },
  agent: {
    labelKey: 'sources.legacyAgent',
    color: 'text-violet-600 dark:text-violet-400 bg-violet-500/10 border-violet-500/20',
    compatibility: true,
  },
  'bootstrap-scan': {
    labelKey: 'sources.bootstrapScan',
    color: 'text-violet-600 dark:text-violet-400 bg-violet-500/10 border-violet-500/20',
  },
  mcp: {
    labelKey: 'sources.mcp',
    color: 'text-blue-600 dark:text-blue-400 bg-blue-500/10 border-blue-500/20',
  },
  manual: {
    labelKey: 'sources.manual',
    color: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  },
  'file-watcher': {
    labelKey: 'sources.fileWatcher',
    color: 'text-orange-600 dark:text-orange-400 bg-orange-500/10 border-orange-500/20',
  },
  clipboard: {
    labelKey: 'sources.clipboard',
    color: 'text-pink-600 dark:text-pink-400 bg-pink-500/10 border-pink-500/20',
  },
  cli: {
    labelKey: 'sources.cli',
    color: DEFAULT_SOURCE_COLOR,
  },
  'submit_with_check': {
    labelKey: 'sources.submitWithCheck',
    color: 'text-teal-600 dark:text-teal-400 bg-teal-500/10 border-teal-500/20',
  },
  'bootstrap-fallback': {
    labelKey: 'sources.bootstrapFallback',
    color: 'text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/20',
  },
  'rescan-evolution': {
    labelKey: 'sources.rescanEvolution',
    color: 'text-cyan-600 dark:text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
  },
  'file-change': {
    labelKey: 'sources.fileChange',
    color: 'text-orange-600 dark:text-orange-400 bg-orange-500/10 border-orange-500/20',
  },
  'decay-scan': {
    labelKey: 'sources.decayScan',
    color: 'text-rose-600 dark:text-rose-400 bg-rose-500/10 border-rose-500/20',
  },
  consolidation: {
    labelKey: 'sources.consolidation',
    color: 'text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
  },
  'relevance-audit': {
    labelKey: 'sources.relevanceAudit',
    color: 'text-sky-600 dark:text-sky-400 bg-sky-500/10 border-sky-500/20',
  },
  metabolism: {
    labelKey: 'sources.metabolism',
    color: 'text-lime-700 dark:text-lime-300 bg-lime-500/10 border-lime-500/20',
  },
};

export function getSourceLabelInfo(source?: string | null): SourceLabelInfo {
  const normalized = source?.trim();
  if (!normalized) {
    return { labelKey: '', color: DEFAULT_SOURCE_COLOR };
  }
  return SOURCE_LABELS[normalized] || { labelKey: normalized, color: DEFAULT_SOURCE_COLOR };
}

export function formatSourceLabel(source: string | null | undefined, t: TranslateFn): string {
  const info = getSourceLabelInfo(source);
  if (!info.labelKey) {
    return '';
  }
  return info.labelKey.startsWith('sources.') ? t(info.labelKey) : info.labelKey;
}
