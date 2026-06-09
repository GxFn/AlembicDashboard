type TranslateFn = (key: string, vars?: Record<string, string | number>) => string;

export interface SourceLabelInfo {
  labelKey: string;
  color: string;
  disposition: 'provider-source' | 'display-compatibility' | 'unmapped-display';
  compatibility?: boolean;
  compatibilityOwner?: string;
  cleanupTrigger?: string;
}

const DEFAULT_SOURCE_COLOR = 'text-[var(--fg-secondary)] bg-[var(--bg-subtle)] border-[var(--border-default)]';
const DISPLAY_COMPATIBILITY_OWNER = 'AlembicDashboard display adapter';
const DISPLAY_COMPATIBILITY_CLEANUP_TRIGGER =
  'Remove after accepted provider fixtures and source scans no longer emit this legacy source label.';

function displayCompatibilityLabel(labelKey: string, color: string): SourceLabelInfo {
  return {
    labelKey,
    color,
    disposition: 'display-compatibility',
    compatibility: true,
    compatibilityOwner: DISPLAY_COMPATIBILITY_OWNER,
    cleanupTrigger: DISPLAY_COMPATIBILITY_CLEANUP_TRIGGER,
  };
}

function providerSourceLabel(labelKey: string, color: string): SourceLabelInfo {
  return {
    labelKey,
    color,
    disposition: 'provider-source',
  };
}

const SOURCE_LABELS: Record<string, SourceLabelInfo> = {
  'host-agent': providerSourceLabel(
    'sources.hostAgent',
    'text-blue-600 dark:text-blue-400 bg-blue-500/10 border-blue-500/20',
  ),
  'alembic-agent': providerSourceLabel(
    'sources.alembicAgent',
    'text-violet-600 dark:text-violet-400 bg-violet-500/10 border-violet-500/20',
  ),
  'host-edit': providerSourceLabel(
    'sources.hostEdit',
    'text-orange-600 dark:text-orange-400 bg-orange-500/10 border-orange-500/20',
  ),
  'ide-agent': displayCompatibilityLabel(
    'sources.legacyIdeAgent',
    'text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/20',
  ),
  'ide-edit': displayCompatibilityLabel(
    'sources.legacyIdeEdit',
    'text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/20',
  ),
  agent: displayCompatibilityLabel(
    'sources.legacyAgent',
    'text-violet-600 dark:text-violet-400 bg-violet-500/10 border-violet-500/20',
  ),
  'bootstrap-scan': providerSourceLabel(
    'sources.bootstrapScan',
    'text-violet-600 dark:text-violet-400 bg-violet-500/10 border-violet-500/20',
  ),
  mcp: providerSourceLabel(
    'sources.mcp',
    'text-blue-600 dark:text-blue-400 bg-blue-500/10 border-blue-500/20',
  ),
  manual: providerSourceLabel(
    'sources.manual',
    'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  ),
  'file-watcher': providerSourceLabel(
    'sources.fileWatcher',
    'text-orange-600 dark:text-orange-400 bg-orange-500/10 border-orange-500/20',
  ),
  clipboard: providerSourceLabel(
    'sources.clipboard',
    'text-pink-600 dark:text-pink-400 bg-pink-500/10 border-pink-500/20',
  ),
  cli: providerSourceLabel('sources.cli', DEFAULT_SOURCE_COLOR),
  'submit_with_check': providerSourceLabel(
    'sources.submitWithCheck',
    'text-teal-600 dark:text-teal-400 bg-teal-500/10 border-teal-500/20',
  ),
  'bootstrap-fallback': providerSourceLabel(
    'sources.bootstrapFallback',
    'text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/20',
  ),
  'rescan-evolution': providerSourceLabel(
    'sources.rescanEvolution',
    'text-cyan-600 dark:text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
  ),
  'file-change': providerSourceLabel(
    'sources.fileChange',
    'text-orange-600 dark:text-orange-400 bg-orange-500/10 border-orange-500/20',
  ),
  'decay-scan': providerSourceLabel(
    'sources.decayScan',
    'text-rose-600 dark:text-rose-400 bg-rose-500/10 border-rose-500/20',
  ),
  consolidation: providerSourceLabel(
    'sources.consolidation',
    'text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
  ),
  'relevance-audit': providerSourceLabel(
    'sources.relevanceAudit',
    'text-sky-600 dark:text-sky-400 bg-sky-500/10 border-sky-500/20',
  ),
  metabolism: providerSourceLabel(
    'sources.metabolism',
    'text-lime-700 dark:text-lime-300 bg-lime-500/10 border-lime-500/20',
  ),
};

export function getSourceLabelInfo(source?: string | null): SourceLabelInfo {
  const normalized = source?.trim();
  if (!normalized) {
    return { labelKey: '', color: DEFAULT_SOURCE_COLOR, disposition: 'unmapped-display' };
  }
  return SOURCE_LABELS[normalized] || {
    labelKey: normalized,
    color: DEFAULT_SOURCE_COLOR,
    disposition: 'unmapped-display',
  };
}

export function formatSourceLabel(source: string | null | undefined, t: TranslateFn): string {
  const info = getSourceLabelInfo(source);
  if (!info.labelKey) {
    return '';
  }
  return info.labelKey.startsWith('sources.') ? t(info.labelKey) : info.labelKey;
}
