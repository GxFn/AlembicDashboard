import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  CircleDot,
  FileText,
  GitBranch,
  Layers,
  RefreshCw,
  Share2,
} from 'lucide-react';
import api, {
  type KnowledgeGap,
  type PanoramaArchitectureLayer,
  type PanoramaHealth,
  type PanoramaLayerModule,
  type PanoramaOverview,
} from '../../api';
import { useI18n } from '../../i18n';
import { getErrorMessage } from '../../utils/error';
import DepGraphView from './DepGraphView';
import KnowledgeGraphView from './KnowledgeGraphView';

type PanoramaTab = 'overview' | 'dependencies' | 'graph' | 'gaps';
type LoadErrors = Partial<Record<'overview' | 'health' | 'gaps', string>>;

const ROLE_LABELS: Record<string, string> = {
  app: 'App',
  auth: 'Auth',
  config: 'Config',
  core: 'Core',
  feature: 'Feature',
  foundation: 'Foundation',
  model: 'Model',
  networking: 'Networking',
  routing: 'Routing',
  service: 'Service',
  storage: 'Storage',
  test: 'Test',
  ui: 'UI',
  utility: 'Utility',
};

function pct(value: number): string {
  const normalized = value <= 1 ? value * 100 : value;
  return `${Math.max(0, Math.min(100, Math.round(normalized)))}%`;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat().format(value);
}

function formatComputedAt(value: number): string | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleString();
}

function priorityClass(priority: KnowledgeGap['priority']): string {
  if (priority === 'high') {
    return 'border-red-200 bg-red-50 text-red-700';
  }
  if (priority === 'low') {
    return 'border-slate-200 bg-slate-50 text-slate-700';
  }
  return 'border-amber-200 bg-amber-50 text-amber-700';
}

function roleLabel(role: string): string {
  return ROLE_LABELS[role.toLowerCase()] ?? role;
}

function recipeCountText(module: PanoramaLayerModule, unavailableLabel: string): string {
  return module.recipeCount === null ? unavailableLabel : formatNumber(module.recipeCount);
}

const PanoramaView: React.FC = () => {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<PanoramaTab>('overview');
  const [overview, setOverview] = useState<PanoramaOverview | null>(null);
  const [health, setHealth] = useState<PanoramaHealth | null>(null);
  const [gaps, setGaps] = useState<KnowledgeGap[]>([]);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<LoadErrors>({});

  const loadPanorama = useCallback(async (refresh = false) => {
    setLoading(true);
    const nextErrors: LoadErrors = {};
    const [overviewResult, healthResult, gapsResult] = await Promise.allSettled([
      api.getPanoramaOverview(refresh),
      api.getPanoramaHealth(refresh),
      api.getPanoramaGaps(refresh),
    ]);

    if (overviewResult.status === 'fulfilled') {
      setOverview(overviewResult.value);
    } else {
      nextErrors.overview = getErrorMessage(overviewResult.reason, t('common.loadFailed'));
    }

    if (healthResult.status === 'fulfilled') {
      setHealth(healthResult.value);
    } else {
      nextErrors.health = getErrorMessage(healthResult.reason, t('common.loadFailed'));
    }

    if (gapsResult.status === 'fulfilled') {
      setGaps(gapsResult.value);
    } else {
      nextErrors.gaps = getErrorMessage(gapsResult.reason, t('common.loadFailed'));
    }

    setErrors(nextErrors);
    setLoading(false);
  }, [t]);

  useEffect(() => {
    loadPanorama();
  }, [loadPanorama]);

  const tabs = useMemo(() => ([
    { key: 'overview' as const, icon: Layers, label: t('panorama.overview') },
    { key: 'dependencies' as const, icon: GitBranch, label: t('panorama.dependencies') },
    { key: 'graph' as const, icon: Share2, label: t('panorama.graph') },
    { key: 'gaps' as const, icon: AlertTriangle, label: t('panorama.gaps') },
  ]), [t]);

  const computedAtLabel = formatComputedAt(overview?.computedAt ?? 0);
  const hasErrors = Object.keys(errors).length > 0;

  return (
    <div className="mx-auto flex h-full w-full max-w-[1440px] flex-col overflow-hidden">
      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--accent-emphasis)]">
              <Layers size={20} />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-semibold text-[var(--fg-primary)]">{t('panorama.title')}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--fg-secondary)]">
                {overview?.projectRoot && <span className="max-w-full truncate font-mono">{overview.projectRoot}</span>}
                {computedAtLabel && <span>{computedAtLabel}</span>}
                {overview?.stale && <span className="text-amber-600">{t('panorama.stale')}</span>}
              </div>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => loadPanorama(true)}
          className="inline-flex w-fit items-center gap-2 rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-sm font-medium text-[var(--fg-secondary)] transition-colors hover:bg-[var(--bg-muted)]"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          {t('panorama.refresh')}
        </button>
      </div>

      <div className="mb-4 inline-flex w-fit rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] p-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? 'bg-[var(--accent)] text-white shadow-sm'
                  : 'text-[var(--fg-secondary)] hover:bg-[var(--bg-muted)]'
              }`}
            >
              <Icon size={16} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {hasErrors && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 shrink-0" size={16} />
            <div className="min-w-0">
              <p className="font-semibold">{t('panorama.partial')}</p>
              <p className="mt-1 break-words">
                {Object.entries(errors).map(([key, message]) => `${key}: ${message}`).join(' · ')}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto pr-1 pb-6">
        {activeTab === 'overview' && (
          <OverviewPanel
            gaps={gaps}
            health={health}
            loading={loading}
            overview={overview}
          />
        )}
        {activeTab === 'dependencies' && <DepGraphView />}
        {activeTab === 'graph' && <KnowledgeGraphView />}
        {activeTab === 'gaps' && (
          <GapsPanel
            gaps={gaps}
            loading={loading}
          />
        )}
      </div>
    </div>
  );
};

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-subtle)] p-8 text-[var(--fg-secondary)] shadow-sm">
      <p className="font-semibold text-[var(--fg-primary)]">{title}</p>
      <p className="mt-2 text-sm">{description}</p>
    </div>
  );
}

function OverviewPanel({
  gaps,
  health,
  loading,
  overview,
}: {
  gaps: KnowledgeGap[];
  health: PanoramaHealth | null;
  loading: boolean;
  overview: PanoramaOverview | null;
}) {
  const { t } = useI18n();
  if (loading && !overview) {
    return (
      <div className="flex min-h-[320px] items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
      </div>
    );
  }
  if (!overview) {
    return <EmptyState title={t('panorama.noData')} description={t('panorama.loading')} />;
  }

  return (
    <div className="space-y-5">
      <StatsRow overview={overview} />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        <ArchitecturePyramid
          layers={overview.layers}
          recipeCountReason={overview.recipeCount.reason}
          recipeCountMode={overview.recipeCount.mode}
        />
        <div className="space-y-5">
          <HealthBar health={health} overview={overview} />
          <GapsSummary gaps={gaps} overview={overview} />
          <ScopeSummary overview={overview} />
        </div>
      </div>
    </div>
  );
}

function StatsRow({ overview }: { overview: PanoramaOverview }) {
  const { t } = useI18n();
  const stats = [
    { icon: Layers, label: t('panorama.modules'), value: formatNumber(overview.moduleCount) },
    { icon: BarChart3, label: t('panorama.layers'), value: formatNumber(overview.layerCount) },
    { icon: FileText, label: t('panorama.files'), value: formatNumber(overview.totalFiles) },
    { icon: CircleDot, label: t('panorama.recipes'), value: formatNumber(overview.totalRecipes) },
    { icon: Share2, label: t('panorama.coverage'), value: pct(overview.dimensionCoverage) },
    { icon: GitBranch, label: t('panorama.cycles'), value: formatNumber(overview.cycleCount) },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
      {stats.map((stat) => {
        const Icon = stat.icon;
        return (
          <div
            key={stat.label}
            className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] p-4 shadow-sm"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-medium uppercase tracking-normal text-[var(--fg-muted)]">{stat.label}</span>
              <Icon size={16} className="shrink-0 text-[var(--accent-emphasis)]" />
            </div>
            <p className="mt-3 text-2xl font-semibold text-[var(--fg-primary)]">{stat.value}</p>
          </div>
        );
      })}
    </div>
  );
}

function ArchitecturePyramid({
  layers,
  recipeCountMode,
  recipeCountReason,
}: {
  layers: PanoramaArchitectureLayer[];
  recipeCountMode: string;
  recipeCountReason: string;
}) {
  const { t } = useI18n();
  const hasDegradedRecipeCounts = recipeCountMode === 'project-total-only';

  if (layers.length === 0) {
    return <EmptyState title={t('panorama.noData')} description={t('panorama.modules')} />;
  }

  return (
    <section className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] p-5 shadow-sm">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-[var(--fg-primary)]">{t('panorama.architecture')}</h2>
          <p className="mt-1 text-xs text-[var(--fg-secondary)]">{t('panorama.layerModuleList')}</p>
        </div>
        {hasDegradedRecipeCounts && (
          <span className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
            {t('panorama.projectTotalOnly')}
          </span>
        )}
      </div>
      {hasDegradedRecipeCounts && (
        <p className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {t('panorama.recipeCountDegraded', { reason: recipeCountReason })}
        </p>
      )}
      <div className="space-y-3">
        {layers.map((layer, index) => (
          <LayerRow key={`${layer.level}-${layer.name}`} index={index} layer={layer} />
        ))}
      </div>
    </section>
  );
}

function LayerRow({ index, layer }: { index: number; layer: PanoramaArchitectureLayer }) {
  const { t } = useI18n();
  const moduleCount = layer.modules.length;
  const fileCount = layer.modules.reduce((sum, module) => sum + module.fileCount, 0);
  const recipeCount = layer.modules.reduce(
    (sum, module) => sum + (module.recipeCount === null ? 0 : module.recipeCount),
    0
  );
  const hasUnknownRecipes = layer.modules.some((module) => module.recipeCount === null);

  return (
    <div className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-subtle)] p-4">
      <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-normal text-[var(--fg-muted)]">
            {t('panorama.layers')} {index + 1}
          </p>
          <h3 className="mt-1 truncate text-sm font-semibold text-[var(--fg-primary)]">
            {roleLabel(layer.name)}
          </h3>
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-[var(--fg-secondary)]">
          <span>{t('panorama.modules')}: {moduleCount}</span>
          <span>{t('panorama.files')}: {formatNumber(fileCount)}</span>
          <span>
            {t('panorama.recipes')}: {formatNumber(recipeCount)}
            {hasUnknownRecipes ? ` ${t('panorama.recipeCountUnavailable')}` : ''}
          </span>
        </div>
      </div>
      <div className="grid gap-2 md:grid-cols-2 2xl:grid-cols-3">
        {layer.modules.map((module) => (
          <div
            key={module.moduleId}
            className="min-w-0 rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-[var(--fg-primary)]">{module.name}</p>
                <p className="mt-1 text-xs text-[var(--fg-secondary)]">{roleLabel(module.role)}</p>
              </div>
              <span className="shrink-0 rounded-md bg-[var(--bg-muted)] px-2 py-1 text-xs text-[var(--fg-secondary)]">
                {recipeCountText(module, t('panorama.recipeCountUnavailable'))}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-[var(--fg-muted)]">
              <span>{formatNumber(module.fileCount)} {t('panorama.files')}</span>
              {module.modulePath && <span className="truncate font-mono">{module.modulePath}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function HealthBar({ health, overview }: { health: PanoramaHealth | null; overview: PanoramaOverview }) {
  const { t } = useI18n();
  const score = health?.healthScore ?? overview.healthRadar.overallScore;
  const dimensions = overview.healthRadar.dimensions;
  return (
    <section className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-[var(--fg-primary)]">{t('panorama.healthScore')}</h2>
        <span className="text-2xl font-semibold text-[var(--fg-primary)]">{pct(score)}</span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-[var(--bg-muted)]">
        <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: pct(score) }} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-[var(--fg-secondary)]">
        <span>{t('panorama.coverage')}: {pct(overview.dimensionCoverage)}</span>
        <span>{t('panorama.avgCoupling')}: {health ? health.avgCoupling.toFixed(2) : '0.00'}</span>
        <span>{t('panorama.highPriorityGaps')}: {health?.highPriorityGaps ?? 0}</span>
        <span>{t('panorama.cycles')}: {health?.cycleCount ?? overview.cycleCount}</span>
      </div>
      {dimensions.length > 0 && (
        <div className="mt-4 space-y-2">
          {dimensions.slice(0, 6).map((dimension) => (
            <div key={dimension.id}>
              <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                <span className="truncate text-[var(--fg-secondary)]">{dimension.name}</span>
                <span className="text-[var(--fg-muted)]">{pct(dimension.score)}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-[var(--bg-muted)]">
                <div className="h-full rounded-full bg-[var(--accent-emphasis)]" style={{ width: pct(dimension.score) }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function GapsSummary({ gaps, overview }: { gaps: KnowledgeGap[]; overview: PanoramaOverview }) {
  const { t } = useI18n();
  const highPriority = gaps.filter((gap) => gap.priority === 'high').length;
  return (
    <section className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-[var(--fg-primary)]">{t('panorama.gaps')}</h2>
        <span className="rounded-md border border-[var(--border-default)] px-2 py-1 text-xs text-[var(--fg-secondary)]">
          {overview.gapCount}
        </span>
      </div>
      {gaps.length === 0 ? (
        <p className="text-sm text-[var(--fg-secondary)]">{t('panorama.noGaps')}</p>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-md bg-[var(--bg-subtle)] p-3">
              <p className="text-xs text-[var(--fg-muted)]">{t('panorama.highPriorityGaps')}</p>
              <p className="mt-1 text-xl font-semibold text-[var(--fg-primary)]">{highPriority}</p>
            </div>
            <div className="rounded-md bg-[var(--bg-subtle)] p-3">
              <p className="text-xs text-[var(--fg-muted)]">{t('panorama.gaps')}</p>
              <p className="mt-1 text-xl font-semibold text-[var(--fg-primary)]">{gaps.length}</p>
            </div>
          </div>
          {gaps.slice(0, 3).map((gap) => (
            <div key={`${gap.dimension}-${gap.priority}`} className="rounded-md border border-[var(--border-default)] px-3 py-2">
              <p className="truncate text-sm font-medium text-[var(--fg-primary)]">{gap.dimensionName}</p>
              <p className="mt-1 text-xs text-[var(--fg-secondary)]">
                {t('panorama.missingCells')}: {gap.missingCellCount} · {t('panorama.weakCells')}: {gap.weakCellCount}
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function ScopeSummary({ overview }: { overview: PanoramaOverview }) {
  const { t } = useI18n();
  const scope = overview.projectScope;
  return (
    <section className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] p-5 shadow-sm">
      <h2 className="text-base font-semibold text-[var(--fg-primary)]">{t('panorama.scope')}</h2>
      <div className="mt-3 space-y-2 text-xs text-[var(--fg-secondary)]">
        <p><span className="text-[var(--fg-muted)]">{t('panorama.projectRoot')}: </span><span className="font-mono">{scope.projectRoot}</span></p>
        <p><span className="text-[var(--fg-muted)]">{t('panorama.scopeMode')}: </span>{scope.mode}</p>
        <p><span className="text-[var(--fg-muted)]">{t('panorama.excludedModules')}: </span>{scope.excludedModuleCount}</p>
      </div>
    </section>
  );
}

function GapsPanel({ gaps, loading }: { gaps: KnowledgeGap[]; loading: boolean }) {
  const { t } = useI18n();
  if (loading && gaps.length === 0) {
    return (
      <div className="flex min-h-[320px] items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
      </div>
    );
  }
  if (gaps.length === 0) {
    return <EmptyState title={t('panorama.noGaps')} description={t('panorama.noData')} />;
  }
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {gaps.map((gap) => (
        <GapRow key={`${gap.dimension}-${gap.priority}-${gap.status}`} gap={gap} />
      ))}
    </div>
  );
}

function GapRow({ gap }: { gap: KnowledgeGap }) {
  const { t } = useI18n();
  return (
    <article className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] p-5 shadow-sm">
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold text-[var(--fg-primary)]">{gap.dimensionName}</h3>
          <p className="mt-1 text-xs text-[var(--fg-secondary)]">{gap.dimension}</p>
        </div>
        <span className={`w-fit rounded-md border px-2.5 py-1 text-xs font-medium ${priorityClass(gap.priority)}`}>
          {t(`panorama.priority.${gap.priority}`)}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-sm">
        <Metric label={t('panorama.missingCells')} value={gap.missingCellCount} />
        <Metric label={t('panorama.weakCells')} value={gap.weakCellCount} />
        <Metric label={t('panorama.recipes')} value={gap.recipeCount} />
      </div>
      {gap.affectedRoles.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-xs font-medium text-[var(--fg-muted)]">{t('panorama.affectedRoles')}</p>
          <div className="flex flex-wrap gap-2">
            {gap.affectedRoles.map((role) => (
              <span key={role} className="rounded-md bg-[var(--bg-subtle)] px-2 py-1 text-xs text-[var(--fg-secondary)]">
                {roleLabel(role)}
              </span>
            ))}
          </div>
        </div>
      )}
      {gap.suggestedTopics.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-xs font-medium text-[var(--fg-muted)]">{t('panorama.suggestedTopics')}</p>
          <ul className="space-y-1 text-sm text-[var(--fg-secondary)]">
            {gap.suggestedTopics.slice(0, 4).map((topic) => (
              <li key={topic}>- {topic}</li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-[var(--bg-subtle)] p-3">
      <p className="text-xs text-[var(--fg-muted)]">{label}</p>
      <p className="mt-1 text-lg font-semibold text-[var(--fg-primary)]">{formatNumber(value)}</p>
    </div>
  );
}

export default PanoramaView;
