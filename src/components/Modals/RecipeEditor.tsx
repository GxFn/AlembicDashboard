import React, { useState, useRef, useEffect, useCallback } from 'react';
import { X, Save, Eye, Edit3, Loader2, Shield, Lightbulb, BookOpen, FileText, FileCode, Code2, Tag, AlertTriangle, RefreshCw, Database, Rocket, Plus, Trash2 } from 'lucide-react';
import type { Recipe, RecipeRetrievalProfile } from '../../types';
import api from '../../api';
import { canPublishRecipe } from '../../api/recipeReviewer';
import type {
  RecipeIndexGenerationDryRun,
  RecipeIndexGenerationStatus,
  RetrievalReadinessReport,
} from '../../api/recipeReviewer';
import MarkdownWithHighlight from '../Shared/MarkdownWithHighlight';
import HighlightedCodeEditor from '../Shared/HighlightedCodeEditor';
import CodeBlock from '../Shared/LazyCodeBlock';
import { ICON_SIZES } from '../../constants/icons';
import PageOverlay from '../Shared/PageOverlay';
import { useI18n } from '../../i18n';
import { getErrorMessage } from '../../utils/error';
import Select from '../ui/Select';

interface RecipeEditorProps {
  editingRecipe: Recipe;
  setEditingRecipe: (recipe: Recipe | null) => void;
  handleSaveRecipe: () => void;
  closeRecipeEdit: () => void;
  isSavingRecipe?: boolean;
  onPublished?: () => void;
}

type ReviewLoadState<T> =
  | { status: 'idle' | 'loading'; data: null; error: null }
  | { status: 'success'; data: T; error: null }
  | { status: 'empty'; data: null; error: null }
  | { status: 'error'; data: null; error: string };

const idleReviewState = <T,>(): ReviewLoadState<T> => ({ status: 'idle', data: null, error: null });

const defaultStats = {
  authority: 0,
  guardUsageCount: 0,
  humanUsageCount: 0,
  aiUsageCount: 0,
  lastUsedAt: null as string | null,
  authorityScore: 0
};

type EditableRetrievalFact = Record<string, unknown> & {
  language: string;
  provenanceRefs: string[];
  term?: string;
  text?: string;
};

function splitReferenceLines(value: string): string[] {
  return value.split(/[\n,]/).map(item => item.trim()).filter(Boolean);
}

function RetrievalFactEditor({
  items,
  valueKey,
  title,
  emptyText,
  defaultLanguage,
  onChange,
}: {
  items: EditableRetrievalFact[];
  valueKey: 'term' | 'text';
  title: string;
  emptyText: string;
  defaultLanguage: string;
  onChange: (next: EditableRetrievalFact[]) => void;
}) {
  const update = (index: number, patch: Partial<EditableRetrievalFact>) => {
    onChange(items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold text-[var(--fg-secondary)]">{title}</span>
        <button
          type="button"
          onClick={() => onChange([...items, { [valueKey]: '', language: defaultLanguage, provenanceRefs: [] }])}
          className="inline-flex items-center gap-1 rounded-md border border-[var(--border-default)] px-2 py-1 text-[11px] font-medium text-[var(--fg-secondary)] hover:bg-[var(--bg-subtle)]"
        >
          <Plus size={11} />
          {title}
        </button>
      </div>
      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-[var(--border-default)] px-3 py-2 text-xs text-[var(--fg-muted)]">{emptyText}</p>
      ) : items.map((item, index) => (
        <div key={`${valueKey}-${index}`} className="grid gap-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] p-3 md:grid-cols-[minmax(0,1fr)_120px_36px]">
          <div className="space-y-2">
            <input
              aria-label={`${title} ${index + 1}`}
              value={typeof item[valueKey] === 'string' ? item[valueKey] : ''}
              onChange={event => update(index, { [valueKey]: event.target.value })}
              className="w-full rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] px-2.5 py-2 text-sm"
            />
            <input
              aria-label={`${title} provenance ${index + 1}`}
              value={item.provenanceRefs.join(', ')}
              onChange={event => update(index, { provenanceRefs: splitReferenceLines(event.target.value) })}
              className="w-full rounded-md border border-[var(--border-default)] bg-[var(--bg-subtle)] px-2.5 py-1.5 font-mono text-[11px]"
              placeholder="field:title, source:1-3"
            />
          </div>
          <input
            aria-label={`${title} language ${index + 1}`}
            value={item.language}
            onChange={event => update(index, { language: event.target.value })}
            className="h-9 rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] px-2 text-xs"
          />
          <button
            type="button"
            aria-label={`Remove ${title} ${index + 1}`}
            onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))}
            className="flex h-9 w-9 items-center justify-center rounded-md text-[var(--fg-muted)] hover:bg-red-50 hover:text-red-600"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

const RecipeEditor: React.FC<RecipeEditorProps> = ({ editingRecipe, setEditingRecipe, handleSaveRecipe, closeRecipeEdit, isSavingRecipe = false, onPublished }) => {
  const { t } = useI18n();
  const [viewMode, setViewMode] = useState<'edit' | 'preview'>('preview');
  const [readinessState, setReadinessState] = useState<ReviewLoadState<RetrievalReadinessReport>>(idleReviewState);
  const [generationState, setGenerationState] = useState<ReviewLoadState<RecipeIndexGenerationStatus>>(idleReviewState);
  const [dryRunState, setDryRunState] = useState<ReviewLoadState<RecipeIndexGenerationDryRun>>(idleReviewState);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const recipeId = editingRecipe.id?.trim() || '';

  const loadRetrievalReview = useCallback(async () => {
    if (!recipeId) {
      const message = t('recipeEditor.retrievalMissingId');
      setReadinessState({ status: 'error', data: null, error: message });
      setGenerationState({ status: 'error', data: null, error: message });
      return;
    }

    setReadinessState({ status: 'loading', data: null, error: null });
    setGenerationState({ status: 'loading', data: null, error: null });
    const [readinessResult, generationResult] = await Promise.allSettled([
      api.getKnowledgeRetrievalReadiness(recipeId),
      api.getRecipeIndexGeneration(),
    ]);
    if (!isMountedRef.current) {
      return;
    }

    if (readinessResult.status === 'fulfilled' && readinessResult.value) {
      setReadinessState({ status: 'success', data: readinessResult.value, error: null });
    } else if (readinessResult.status === 'fulfilled') {
      setReadinessState({ status: 'empty', data: null, error: null });
    } else {
      setReadinessState({
        status: 'error',
        data: null,
        error: getErrorMessage(readinessResult.reason, t('recipeEditor.retrievalLoadFailed')),
      });
    }

    if (generationResult.status === 'fulfilled' && generationResult.value) {
      setGenerationState({ status: 'success', data: generationResult.value, error: null });
    } else if (generationResult.status === 'fulfilled') {
      setGenerationState({ status: 'empty', data: null, error: null });
    } else {
      setGenerationState({
        status: 'error',
        data: null,
        error: getErrorMessage(generationResult.reason, t('recipeEditor.retrievalGenerationFailed')),
      });
    }
  }, [recipeId, t]);

  useEffect(() => {
    void loadRetrievalReview();
  }, [loadRetrievalReview]);

  const handleGenerationDryRun = async () => {
    setDryRunState({ status: 'loading', data: null, error: null });
    try {
      const report = await api.previewRecipeIndexGeneration();
      if (isMountedRef.current) {
        setDryRunState(report
          ? { status: 'success', data: report, error: null }
          : { status: 'empty', data: null, error: null });
      }
    } catch (err: unknown) {
      if (isMountedRef.current) {
        setDryRunState({
          status: 'error',
          data: null,
          error: getErrorMessage(err, t('recipeEditor.retrievalDryRunFailed')),
        });
      }
    }
  };

  const handlePublish = async () => {
    if (!recipeId || publishing || !canPublishRecipe(readinessState.data)) {
      return;
    }
    if (!window.confirm(t('recipeEditor.retrievalPublishConfirm'))) {
      return;
    }

    setPublishing(true);
    setPublishError(null);
    try {
      const published = await api.knowledgePublish(recipeId);
      if (!isMountedRef.current) {
        return;
      }
      setEditingRecipe({
        ...editingRecipe,
        status: published?.lifecycle || 'active',
        wireSnapshot: published ? { ...published } : editingRecipe.wireSnapshot,
      });
      onPublished?.();
      await loadRetrievalReview();
    } catch (err: unknown) {
      const message = getErrorMessage(err, t('recipeEditor.retrievalPublishFailed'));
      console.warn('Recipe publish failed after explicit confirmation:', {
        recipeId,
        lifecycle: editingRecipe.status,
        message,
      });
      if (isMountedRef.current) {
        setPublishError(message);
        await loadRetrievalReview();
      }
    } finally {
      if (isMountedRef.current) {
        setPublishing(false);
      }
    }
  };

  const initializeRetrievalProfile = () => {
    const profile: RecipeRetrievalProfile = {
      schemaVersion: '1',
      primaryLanguage: editingRecipe.language || '',
      summary: { primary: '', technicalEnglish: '' },
      concepts: [],
      scenarios: [],
      exclusions: [],
      provenance: {
        evidenceRefs: [],
        sourceFieldRefs: [],
        sourceContentHash: '',
        generator: 'dashboard-reviewer',
      },
    };
    setEditingRecipe({ ...editingRecipe, retrievalProfile: profile });
  };

  const updateRetrievalProfile = (profile: RecipeRetrievalProfile) => {
    setEditingRecipe({ ...editingRecipe, retrievalProfile: profile });
  };

  const codeLang = (() => {
    const l = (editingRecipe.language || '').toLowerCase();
    if (['objectivec', 'objc', 'objective-c', 'obj-c'].includes(l)) return 'objectivec';
    return editingRecipe.language || 'text';
  })();

  const handleSetAuthority = async (authority: number) => {
    try {
      await api.setRecipeAuthority(editingRecipe.name, authority);
      if (isMountedRef.current) {
        const stats = editingRecipe.stats ? { ...editingRecipe.stats, authority } : { ...defaultStats, authority };
        setEditingRecipe({ ...editingRecipe, stats });
      }
    } catch (err: unknown) {
      console.warn(t('recipeEditor.authorityFailed'), getErrorMessage(err));
    }
  };

  const formatTimestamp = (ts: number | string | null | undefined) => {
    if (!ts) return '';
    const ms = typeof ts === 'string' ? new Date(ts).getTime() : (ts as number);
    if (isNaN(ms)) return '';
    return new Date(ms).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  const retrievalProfile = editingRecipe.retrievalProfile;
  const publishableLifecycle = editingRecipe.status === 'pending' || editingRecipe.status === 'staging';
  const readinessReport = readinessState.status === 'success' ? readinessState.data : null;
  const retrievalReviewPanel = (
    <div className="space-y-4">
      <section className="rounded-2xl border border-indigo-200 bg-indigo-50/30 p-5 dark:border-indigo-500/30 dark:bg-indigo-500/5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-[var(--fg-primary)]">{t('recipeEditor.retrievalProfileTitle')}</h3>
            <p className="mt-1 text-xs text-[var(--fg-muted)]">{t('recipeEditor.retrievalProfileHint')}</p>
          </div>
          {retrievalProfile && (
            <span className="rounded-full border border-indigo-200 bg-white px-2.5 py-1 font-mono text-[11px] text-indigo-700 dark:bg-transparent dark:text-indigo-300">
              schema {retrievalProfile.schemaVersion}
            </span>
          )}
        </div>

        {!retrievalProfile ? (
          <div className="rounded-xl border border-dashed border-indigo-200 bg-[var(--bg-surface)] p-4">
            <p className="text-xs text-[var(--fg-muted)]">{t('recipeEditor.retrievalEmpty')}</p>
            {viewMode === 'edit' && (
              <button
                type="button"
                onClick={initializeRetrievalProfile}
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white hover:bg-indigo-700"
              >
                <Plus size={13} /> {t('recipeEditor.retrievalCreateProfile')}
              </button>
            )}
          </div>
        ) : viewMode === 'edit' ? (
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1 text-xs font-bold text-[var(--fg-secondary)]">
                <span>{t('recipeEditor.retrievalSchemaVersion')}</span>
                <input
                  value={retrievalProfile.schemaVersion}
                  onChange={event => updateRetrievalProfile({ ...retrievalProfile, schemaVersion: event.target.value })}
                  className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-sm font-normal"
                />
              </label>
              <label className="space-y-1 text-xs font-bold text-[var(--fg-secondary)]">
                <span>{t('recipeEditor.retrievalPrimaryLanguage')}</span>
                <input
                  value={retrievalProfile.primaryLanguage}
                  onChange={event => updateRetrievalProfile({ ...retrievalProfile, primaryLanguage: event.target.value })}
                  className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-sm font-normal"
                />
              </label>
            </div>
            <label className="block space-y-1 text-xs font-bold text-[var(--fg-secondary)]">
              <span>{t('recipeEditor.retrievalPrimarySummary')}</span>
              <textarea
                value={retrievalProfile.summary.primary}
                onChange={event => updateRetrievalProfile({
                  ...retrievalProfile,
                  summary: { ...retrievalProfile.summary, primary: event.target.value },
                })}
                rows={3}
                className="w-full resize-y rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-sm font-normal"
              />
            </label>
            <label className="block space-y-1 text-xs font-bold text-[var(--fg-secondary)]">
              <span>{t('recipeEditor.retrievalTechnicalSummary')}</span>
              <textarea
                value={retrievalProfile.summary.technicalEnglish}
                onChange={event => updateRetrievalProfile({
                  ...retrievalProfile,
                  summary: { ...retrievalProfile.summary, technicalEnglish: event.target.value },
                })}
                rows={3}
                className="w-full resize-y rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-sm font-normal"
              />
            </label>
            <RetrievalFactEditor
              title={t('recipeEditor.retrievalConcepts')}
              emptyText={t('recipeEditor.retrievalNoFacts')}
              items={retrievalProfile.concepts as unknown as EditableRetrievalFact[]}
              valueKey="term"
              defaultLanguage={retrievalProfile.primaryLanguage}
              onChange={concepts => updateRetrievalProfile({
                ...retrievalProfile,
                concepts: concepts as unknown as RecipeRetrievalProfile['concepts'],
              })}
            />
            <RetrievalFactEditor
              title={t('recipeEditor.retrievalScenarios')}
              emptyText={t('recipeEditor.retrievalNoFacts')}
              items={retrievalProfile.scenarios as unknown as EditableRetrievalFact[]}
              valueKey="text"
              defaultLanguage={retrievalProfile.primaryLanguage}
              onChange={scenarios => updateRetrievalProfile({
                ...retrievalProfile,
                scenarios: scenarios as unknown as RecipeRetrievalProfile['scenarios'],
              })}
            />
            <RetrievalFactEditor
              title={t('recipeEditor.retrievalExclusions')}
              emptyText={t('recipeEditor.retrievalNoFacts')}
              items={retrievalProfile.exclusions as unknown as EditableRetrievalFact[]}
              valueKey="text"
              defaultLanguage={retrievalProfile.primaryLanguage}
              onChange={exclusions => updateRetrievalProfile({
                ...retrievalProfile,
                exclusions: exclusions as unknown as RecipeRetrievalProfile['exclusions'],
              })}
            />
            <div className="grid gap-3 rounded-xl border border-[var(--border-default)] bg-[var(--bg-subtle)] p-4 md:grid-cols-2">
              <label className="space-y-1 text-xs font-bold text-[var(--fg-secondary)]">
                <span>{t('recipeEditor.retrievalSourceFields')}</span>
                <textarea
                  value={retrievalProfile.provenance.sourceFieldRefs.join('\n')}
                  onChange={event => updateRetrievalProfile({
                    ...retrievalProfile,
                    provenance: {
                      ...retrievalProfile.provenance,
                      sourceFieldRefs: splitReferenceLines(event.target.value),
                    },
                  })}
                  rows={4}
                  className="w-full resize-y rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 font-mono text-xs font-normal"
                />
              </label>
              <label className="space-y-1 text-xs font-bold text-[var(--fg-secondary)]">
                <span>{t('recipeEditor.retrievalEvidenceRefs')}</span>
                <textarea
                  value={retrievalProfile.provenance.evidenceRefs.join('\n')}
                  onChange={event => updateRetrievalProfile({
                    ...retrievalProfile,
                    provenance: {
                      ...retrievalProfile.provenance,
                      evidenceRefs: splitReferenceLines(event.target.value),
                    },
                  })}
                  rows={4}
                  className="w-full resize-y rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 font-mono text-xs font-normal"
                />
              </label>
              <label className="space-y-1 text-xs font-bold text-[var(--fg-secondary)]">
                <span>{t('recipeEditor.retrievalSourceHash')}</span>
                <input
                  value={retrievalProfile.provenance.sourceContentHash}
                  onChange={event => updateRetrievalProfile({
                    ...retrievalProfile,
                    provenance: { ...retrievalProfile.provenance, sourceContentHash: event.target.value },
                  })}
                  className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 font-mono text-xs font-normal"
                />
              </label>
              <label className="space-y-1 text-xs font-bold text-[var(--fg-secondary)]">
                <span>{t('recipeEditor.retrievalGenerator')}</span>
                <input
                  value={retrievalProfile.provenance.generator}
                  onChange={event => updateRetrievalProfile({
                    ...retrievalProfile,
                    provenance: { ...retrievalProfile.provenance, generator: event.target.value },
                  })}
                  className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-xs font-normal"
                />
              </label>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-4">
                <div className="text-[10px] font-bold uppercase text-[var(--fg-muted)]">{t('recipeEditor.retrievalPrimarySummary')}</div>
                <p className="mt-2 text-sm leading-relaxed text-[var(--fg-primary)]">{retrievalProfile.summary.primary || t('recipeEditor.retrievalEmpty')}</p>
              </div>
              <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-4">
                <div className="text-[10px] font-bold uppercase text-[var(--fg-muted)]">{t('recipeEditor.retrievalTechnicalSummary')}</div>
                <p className="mt-2 text-sm leading-relaxed text-[var(--fg-primary)]">{retrievalProfile.summary.technicalEnglish || t('recipeEditor.retrievalEmpty')}</p>
              </div>
            </div>
            <div className="grid gap-3 lg:grid-cols-3">
              {([
                [t('recipeEditor.retrievalConcepts'), retrievalProfile.concepts.map(item => item.term)],
                [t('recipeEditor.retrievalScenarios'), retrievalProfile.scenarios.map(item => item.text)],
                [t('recipeEditor.retrievalExclusions'), retrievalProfile.exclusions.map(item => item.text)],
              ] as Array<[string, string[]]>).map(([label, values]) => (
                <div key={label} className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-4">
                  <div className="text-[10px] font-bold uppercase text-[var(--fg-muted)]">{label}</div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {values.length > 0 ? values.map((value, index) => (
                      <span key={`${label}-${index}`} className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300">{value}</span>
                    )) : <span className="text-xs text-[var(--fg-muted)]">{t('recipeEditor.retrievalNoFacts')}</span>}
                  </div>
                </div>
              ))}
            </div>
            <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-subtle)] p-4">
              <div className="text-[10px] font-bold uppercase text-[var(--fg-muted)]">{t('recipeEditor.retrievalSourceFields')}</div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {retrievalProfile.provenance.sourceFieldRefs.map(reference => (
                  <code key={reference} className="rounded bg-[var(--bg-surface)] px-2 py-1 text-[11px] text-[var(--fg-secondary)]">{reference}</code>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-5" aria-live="polite">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Shield size={16} className="text-emerald-600" />
              <h3 className="text-sm font-bold">{t('recipeEditor.retrievalReadinessTitle')}</h3>
            </div>
            <button type="button" onClick={() => void loadRetrievalReview()} className="rounded-md p-1.5 text-[var(--fg-muted)] hover:bg-[var(--bg-subtle)]" title={t('recipeEditor.retrievalRetry')}>
              <RefreshCw size={14} className={readinessState.status === 'loading' ? 'animate-spin' : ''} />
            </button>
          </div>
          {readinessState.status === 'loading' || readinessState.status === 'idle' ? (
            <p className="text-xs text-[var(--fg-muted)]">{t('recipeEditor.retrievalLoading')}</p>
          ) : readinessState.status === 'empty' ? (
            <p className="text-xs text-[var(--fg-muted)]">{t('recipeEditor.retrievalEmpty')}</p>
          ) : readinessState.status === 'error' ? (
            <div aria-live="assertive" className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:bg-red-500/10 dark:text-red-300">
              {readinessState.error}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${readinessReport?.ready ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                  {readinessReport?.ready ? t('recipeEditor.retrievalReady') : t('recipeEditor.retrievalBlocked')}
                </span>
                <code className="text-[11px] text-[var(--fg-muted)]">schema {readinessReport?.schemaVersion || '—'}</code>
              </div>
              <dl className="grid gap-2 text-[11px]">
                <div><dt className="font-bold text-[var(--fg-muted)]">profileHash</dt><dd className="break-all font-mono text-[var(--fg-secondary)]">{readinessReport?.profileHash || '—'}</dd></div>
                <div><dt className="font-bold text-[var(--fg-muted)]">documentSetHash</dt><dd className="break-all font-mono text-[var(--fg-secondary)]">{readinessReport?.documentSetHash || '—'}</dd></div>
              </dl>
              {readinessReport && readinessReport.violations.length > 0 && (
                <ul className="space-y-2">
                  {readinessReport.violations.map((violation, index) => (
                    <li key={`${violation.code}-${index}`} className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700 dark:bg-red-500/10 dark:text-red-300">
                      <code className="font-bold">{violation.code}</code>
                      {violation.field && <span className="ml-2 font-mono text-[11px]">{violation.field}</span>}
                      <p className="mt-1">{violation.message}</p>
                    </li>
                  ))}
                </ul>
              )}
              {readinessReport && readinessReport.warnings.length > 0 && (
                <ul className="space-y-2">
                  {readinessReport.warnings.map((warning, index) => (
                    <li key={`${warning.code}-${index}`} className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
                      <div className="flex items-start gap-2"><AlertTriangle size={13} className="mt-0.5 shrink-0" /><div><code className="font-bold">{warning.code}</code><p className="mt-1">{warning.message}</p></div></div>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-[11px] text-[var(--fg-muted)]">{t('recipeEditor.retrievalWarningNonGate')}</p>
            </div>
          )}
          {publishError && <div aria-live="assertive" className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">{publishError}</div>}
          {publishableLifecycle && (
            <button
              type="button"
              onClick={() => void handlePublish()}
              disabled={publishing || !canPublishRecipe(readinessReport)}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-2.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {publishing ? <Loader2 size={14} className="animate-spin" /> : <Rocket size={14} />}
              {publishing ? t('recipeEditor.retrievalPublishing') : t('recipeEditor.retrievalPublish')}
            </button>
          )}
        </section>

        <section className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-5" aria-live="polite">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Database size={16} className="text-blue-600" />
              <h3 className="text-sm font-bold">{t('recipeEditor.retrievalGenerationTitle')}</h3>
            </div>
            <button type="button" onClick={() => void loadRetrievalReview()} className="rounded-md p-1.5 text-[var(--fg-muted)] hover:bg-[var(--bg-subtle)]" title={t('recipeEditor.retrievalRetry')}>
              <RefreshCw size={14} className={generationState.status === 'loading' ? 'animate-spin' : ''} />
            </button>
          </div>
          {generationState.status === 'loading' || generationState.status === 'idle' ? (
            <p className="text-xs text-[var(--fg-muted)]">{t('recipeEditor.retrievalLoading')}</p>
          ) : generationState.status === 'empty' ? (
            <p className="text-xs text-[var(--fg-muted)]">{t('recipeEditor.retrievalEmpty')}</p>
          ) : generationState.status === 'error' ? (
            <div aria-live="assertive" className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:bg-red-500/10 dark:text-red-300">{generationState.error}</div>
          ) : (
            <pre className="max-h-44 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-[var(--bg-subtle)] p-3 text-[11px] text-[var(--fg-secondary)]">{JSON.stringify(generationState.data, null, 2)}</pre>
          )}
          <button
            type="button"
            onClick={() => void handleGenerationDryRun()}
            disabled={dryRunState.status === 'loading'}
            className="mt-3 inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-100 disabled:opacity-50 dark:bg-blue-500/10 dark:text-blue-300"
          >
            {dryRunState.status === 'loading' ? <Loader2 size={13} className="animate-spin" /> : <Database size={13} />}
            {dryRunState.status === 'loading' ? t('recipeEditor.retrievalDryRunRunning') : t('recipeEditor.retrievalDryRun')}
          </button>
          {dryRunState.status === 'success' && (
            <pre className="mt-3 max-h-52 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-[var(--bg-subtle)] p-3 text-[11px] text-[var(--fg-secondary)]">{JSON.stringify(dryRunState.data, null, 2)}</pre>
          )}
          {dryRunState.status === 'empty' && <p className="mt-3 text-xs text-[var(--fg-muted)]">{t('recipeEditor.retrievalEmpty')}</p>}
          {dryRunState.status === 'error' && <div aria-live="assertive" className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">{dryRunState.error}</div>}
        </section>
      </div>
    </div>
  );

  return (
  <PageOverlay className="z-40 flex items-center justify-center p-4">
    <PageOverlay.Backdrop className="bg-black/20 dark:bg-black/40 backdrop-blur-sm" />
    <div className="relative bg-[var(--bg-surface)] w-full max-w-6xl rounded-2xl shadow-2xl flex flex-col h-[85vh]">
    <div className="p-6 border-b border-[var(--border-default)] flex justify-between items-center flex-wrap gap-4">
      <div className="flex items-center gap-3">
      <h2 className="text-xl font-bold">{t('recipeEditor.title')}</h2>
      {/* V2 Kind badge */}
      {editingRecipe.kind && (() => {
        const kc: Record<string, { label: string; color: string; bg: string; border: string; icon: React.ElementType }> = {
        rule: { label: 'Rule', color: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200', icon: Shield },
        pattern: { label: 'Pattern', color: 'text-violet-700', bg: 'bg-violet-50', border: 'border-violet-200', icon: Lightbulb },
        fact: { label: 'Fact', color: 'text-cyan-700', bg: 'bg-cyan-50', border: 'border-cyan-200', icon: BookOpen },
        };
        const cfg = kc[editingRecipe.kind];
        if (!cfg) return null;
        const KindIcon = cfg.icon;
        return (
        <span className={`text-[10px] font-bold px-2 py-1 rounded uppercase flex items-center gap-1 border ${cfg.bg} ${cfg.color} ${cfg.border}`}>
          <KindIcon size={ICON_SIZES.sm} />{cfg.label}
        </span>
        );
      })()}
      {/* V2 Status badge */}
      {editingRecipe.status && editingRecipe.status !== 'active' && editingRecipe.status !== 'published' && (
        <span className={`text-[10px] font-bold px-2 py-1 rounded uppercase border ${
        editingRecipe.status === 'draft' ? 'bg-[var(--bg-subtle)] text-[var(--fg-muted)] border-[var(--border-default)]' :
        editingRecipe.status === 'archived' ? 'bg-orange-50 text-orange-600 border-orange-200' :
        'bg-[var(--bg-subtle)] text-[var(--fg-muted)] border-[var(--border-default)]'
        }`}>{editingRecipe.status}</span>
      )}
      </div>
      <div className="flex items-center gap-4">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-[var(--fg-muted)]">{t('recipeEditor.authorityScore')}</span>
        {viewMode === 'preview' ? (
        <span className="text-sm text-[var(--fg-primary)]">{(editingRecipe.stats?.authority ?? 3)}</span>
        ) : (
        <Select
          value={String(editingRecipe.stats?.authority ?? 3)}
          onChange={v => handleSetAuthority(parseInt(v))}
          options={[
            { value: '1', label: `1 - ${t('recipeEditor.qualityLevels.basic')}`, icon: '⭐' },
            { value: '2', label: `2 - ${t('recipeEditor.qualityLevels.good')}`, icon: '⭐⭐' },
            { value: '3', label: `3 - ${t('recipeEditor.qualityLevels.solid')}`, icon: '⭐⭐⭐' },
            { value: '4', label: `4 - ${t('recipeEditor.qualityLevels.great')}`, icon: '⭐⭐⭐⭐' },
            { value: '5', label: `5 - ${t('recipeEditor.qualityLevels.excellent')}`, icon: '⭐⭐⭐⭐⭐' },
          ]}
          size="xs"
          className="font-bold text-amber-600 bg-amber-50 border-amber-100"
        />
        )}
      </div>
      <div className="flex bg-[var(--bg-subtle)] p-1 rounded-lg mr-4">
        <button 
        onClick={() => setViewMode('preview')} 
        className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-2 ${viewMode === 'preview' ? 'bg-[var(--bg-surface)] shadow-sm text-[var(--accent)]' : 'text-[var(--fg-muted)]'}`}
        >
        <Eye size={ICON_SIZES.sm} /> {t('recipeEditor.preview')}
        </button>
        <button 
        onClick={() => setViewMode('edit')} 
        className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-2 ${viewMode === 'edit' ? 'bg-[var(--bg-surface)] shadow-sm text-[var(--accent)]' : 'text-[var(--fg-muted)]'}`}
        >
        <Edit3 size={ICON_SIZES.sm} /> {t('recipeEditor.edit')}
        </button>
      </div>
      <button onClick={closeRecipeEdit} className="p-2 hover:bg-[var(--bg-subtle)] rounded-full"><X size={ICON_SIZES.lg} /></button>
      </div>
    </div>
    <div className="p-6 space-y-4 flex-1 flex flex-col overflow-hidden">
      <div className="flex-1 flex flex-col min-h-0">
      {viewMode === 'edit' ? (
        <div className="flex-1 overflow-y-auto space-y-5 pr-1">
        {/* Path */}
        <div>
          <label className="block text-xs font-bold text-[var(--fg-muted)] uppercase mb-1">{t('recipeEditor.path')}</label>
          <input className="w-full p-2 bg-[var(--bg-subtle)] border border-[var(--border-default)] rounded-lg text-sm" value={editingRecipe.name} onChange={e => setEditingRecipe({ ...editingRecipe, name: e.target.value })} />
        </div>

        {/* Description */}
        <div>
          <label className="block text-xs font-bold text-[var(--fg-muted)] uppercase mb-1">{t('recipeEditor.description')}</label>
          <textarea
          className="w-full px-3 py-2 text-sm border border-[var(--border-default)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--accent-emphasis)] resize-none"
          rows={2}
          value={editingRecipe.description || ''}
          onChange={e => setEditingRecipe({ ...editingRecipe, description: e.target.value })}
          placeholder={t('recipeEditor.descPlaceholder')}
          />
        </div>

        {retrievalReviewPanel}

        {/* Markdown 文档 */}
        <div>
          <label className="block text-xs font-bold text-[var(--fg-muted)] uppercase mb-1.5 flex items-center gap-1.5">
          <FileText size={11} className="text-blue-400" /> {t('recipeEditor.markdown')}
          </label>
          <div className="border border-[var(--border-default)] rounded-lg overflow-hidden" style={{ minHeight: 180 }}>
          <HighlightedCodeEditor
            value={editingRecipe.content?.markdown || ''}
            onChange={e => setEditingRecipe({ ...editingRecipe, content: { ...editingRecipe.content, markdown: e } })}
            language="markdown"
            height="180px"
            showLineNumbers={true}
          />
          </div>
        </div>

        {/* Code / 标准用法 */}
        <div>
          <label className="block text-xs font-bold text-[var(--fg-muted)] uppercase mb-1.5 flex items-center gap-1.5">
          <Code2 size={11} className="text-emerald-500" /> {t('recipeEditor.code')}
          </label>
          <div className="border border-[var(--border-default)] rounded-lg overflow-hidden" style={{ minHeight: 180 }}>
          <HighlightedCodeEditor
            value={editingRecipe.content?.pattern || ''}
            onChange={e => setEditingRecipe({ ...editingRecipe, content: { ...editingRecipe.content, pattern: e } })}
            language={codeLang}
            height="180px"
            showLineNumbers={true}
          />
          </div>
        </div>

        {/* 设计原理 */}
        <div>
          <label className="block text-xs font-bold text-[var(--fg-muted)] uppercase mb-1">{t('recipeEditor.rationale')}</label>
          <textarea
          className="w-full px-3 py-2 text-sm border border-[var(--border-default)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--accent-emphasis)] resize-y"
          rows={3}
          value={editingRecipe.content?.rationale || ''}
          onChange={e => setEditingRecipe({ ...editingRecipe, content: { ...editingRecipe.content, rationale: e.target.value } })}
          placeholder={t('recipeEditor.rationalePlaceholder')}
          />
        </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto space-y-6 scrollbar-light">
        {/* Recipe Metadata */}
        {(() => {
          const metaFields = ([
          ['trigger', editingRecipe.trigger],
          ['language', editingRecipe.language],
          ['category', editingRecipe.category],
          ['kind', editingRecipe.kind],
          ['knowledgeType', editingRecipe.knowledgeType],
          ['status', editingRecipe.status],
          ['complexity', editingRecipe.complexity],
          ['scope', editingRecipe.scope],
          ['source', editingRecipe.source],
          ['updatedAt', editingRecipe.updatedAt ? formatTimestamp(editingRecipe.updatedAt) : undefined],
          ] as [string, string | undefined][]).filter(([, v]) => !!v);
          if (metaFields.length === 0) return null;
          return (
          <div className="bg-[var(--bg-subtle)] border border-[var(--border-default)] rounded-2xl p-6">
            <h3 className="text-[10px] font-bold text-[var(--fg-muted)] uppercase tracking-widest mb-4">Recipe Metadata</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-y-4 gap-x-8">
            {metaFields.map(([key, value]) => (
              <div key={key} className="flex flex-col">
              <span className="text-[10px] text-[var(--fg-muted)] font-bold uppercase mb-1">{key}</span>
              <span className="text-sm text-[var(--fg-primary)] break-all font-medium">{value}</span>
              </div>
            ))}
            </div>
          </div>
          );
        })()}

        {retrievalReviewPanel}

        {/* Description */}
        {editingRecipe.description && (
          <div className="bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-default)] p-6">
          <label className="text-[10px] font-bold text-[var(--fg-muted)] uppercase mb-2 block">{t('recipeEditor.description')}</label>
          <p className="text-sm text-[var(--fg-secondary)] leading-relaxed">{editingRecipe.description}</p>
          </div>
        )}

        {/* Markdown 文档 */}
        {editingRecipe.content?.markdown && (
          <div className="bg-[var(--bg-surface)] rounded-2xl border border-blue-100 p-6">
          <label className="text-[10px] font-bold text-[var(--fg-muted)] uppercase mb-3 block flex items-center gap-1.5">
            <FileText size={11} className="text-blue-400" /> {t('recipeEditor.markdown')}
          </label>
          <div className="bg-blue-50/30 border border-blue-100 rounded-xl p-4">
            <div className="markdown-body text-sm text-[var(--fg-primary)] leading-relaxed">
            <MarkdownWithHighlight content={editingRecipe.content.markdown} />
            </div>
          </div>
          </div>
        )}

        {/* Code / 标准用法 */}
        {editingRecipe.content?.pattern && (
          <div className="bg-[var(--bg-surface)] rounded-2xl border border-emerald-100 p-6">
          <label className="text-[10px] font-bold text-[var(--fg-muted)] uppercase mb-3 block flex items-center gap-1.5">
            <Code2 size={11} className="text-emerald-500" /> {t('recipeEditor.code')}
          </label>
          <CodeBlock code={editingRecipe.content.pattern} language={codeLang} showLineNumbers />
          </div>
        )}

        {/* 设计原理 */}
        {editingRecipe.content?.rationale && (
          <div className="bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-default)] p-6">
          <label className="text-[10px] font-bold text-[var(--fg-muted)] uppercase mb-2 block">{t('recipeEditor.rationale')}</label>
          <div className="bg-[var(--bg-subtle)] border border-[var(--border-default)] rounded-xl p-4">
            <p className="text-sm text-[var(--fg-secondary)] leading-relaxed">{editingRecipe.content.rationale}</p>
          </div>
          </div>
        )}

        {/* 实施步骤 */}
        {editingRecipe.content?.steps && editingRecipe.content.steps.length > 0 && (
          <div className="bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-default)] p-6">
          <label className="text-[10px] font-bold text-[var(--fg-muted)] uppercase mb-2 block">{t('recipeEditor.steps')}</label>
          <div className="space-y-2">
            {editingRecipe.content.steps.map((step: any, i: number) => {
            if (typeof step === 'string') {
              return (
              <div key={i} className="bg-[var(--bg-subtle)] rounded-lg p-3 border border-[var(--border-default)] flex items-start gap-2.5">
                <span className="text-[10px] font-bold text-blue-600 bg-blue-50 rounded-full w-5 h-5 flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                <p className="text-xs text-[var(--fg-primary)] leading-relaxed">{step}</p>
              </div>
              );
            }
            return (
              <div key={i} className="bg-[var(--bg-subtle)] rounded-lg p-3 border border-[var(--border-default)]">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-bold text-blue-600 bg-blue-50 rounded-full w-5 h-5 flex items-center justify-center shrink-0">{i + 1}</span>
                {step.title && <span className="text-xs font-bold text-[var(--fg-primary)]">{step.title}</span>}
              </div>
              {step.description && <p className="text-xs text-[var(--fg-secondary)] ml-7 leading-relaxed">{step.description}</p>}
              {step.code && <pre className="text-[11px] font-mono bg-slate-800 text-green-300 p-2.5 rounded-md mt-1.5 ml-7 overflow-x-auto whitespace-pre-wrap">{step.code}</pre>}
              </div>
            );
            })}
          </div>
          </div>
        )}

        {/* 代码变更 */}
        {editingRecipe.content?.codeChanges && editingRecipe.content.codeChanges.length > 0 && (
          <div className="bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-default)] p-6">
          <label className="text-[10px] font-bold text-[var(--fg-muted)] uppercase mb-2 block">{t('recipeEditor.codeChanges')}</label>
          <div className="space-y-2">
            {editingRecipe.content.codeChanges.map((change, i) => (
            <div key={i} className="border border-[var(--border-default)] rounded-lg overflow-hidden">
              <div className="px-3 py-1.5 bg-[var(--bg-subtle)] border-b border-[var(--border-default)] flex items-center gap-2">
              <FileCode size={11} className="text-blue-400" />
              <code className="text-[10px] font-mono text-[var(--fg-secondary)]">{change.file}</code>
              </div>
              {change.explanation && <p className="text-[11px] text-[var(--fg-muted)] px-3 py-1.5 border-b border-[var(--border-default)] bg-yellow-50/30">{change.explanation}</p>}
              <div className="p-2 bg-red-50/20 border-b border-[var(--border-default)]">
              <div className="text-[9px] font-bold text-red-400 mb-0.5 uppercase">Before</div>
              <pre className="text-[11px] text-[var(--fg-secondary)] whitespace-pre-wrap break-words font-mono">{change.before || t('recipes.emptyValue')}</pre>
              </div>
              <div className="p-2 bg-emerald-50/20">
              <div className="text-[9px] font-bold text-emerald-500 mb-0.5 uppercase">After</div>
              <pre className="text-[11px] text-[var(--fg-primary)] whitespace-pre-wrap break-words font-mono">{change.after}</pre>
              </div>
            </div>
            ))}
          </div>
          </div>
        )}

        {/* 验证方法 */}
        {editingRecipe.content?.verification && (
          <div className="bg-[var(--bg-surface)] rounded-2xl border border-teal-100 p-6">
          <label className="text-[10px] font-bold text-[var(--fg-muted)] uppercase mb-2 block">{t('recipeEditor.validation')}</label>
          <div className="bg-teal-50/50 border border-teal-100 rounded-xl p-4 space-y-1.5">
            {editingRecipe.content.verification.method && <p className="text-xs text-[var(--fg-secondary)]"><span className="font-bold text-teal-600">{t('recipeEditor.validationMethod')}</span> {editingRecipe.content.verification.method}</p>}
            {editingRecipe.content.verification.expectedResult && <p className="text-xs text-[var(--fg-secondary)]"><span className="font-bold text-teal-600">{t('recipeEditor.validationExpected')}</span> {editingRecipe.content.verification.expectedResult}</p>}
            {editingRecipe.content.verification.testCode && <pre className="text-[11px] font-mono bg-slate-800 text-green-300 p-2.5 rounded-md overflow-x-auto whitespace-pre-wrap mt-1">{editingRecipe.content.verification.testCode}</pre>}
          </div>
          </div>
        )}

        {/* Tags */}
        {editingRecipe.tags && editingRecipe.tags.length > 0 && (
          <div className="bg-[var(--bg-subtle)] border border-[var(--border-default)] rounded-2xl p-6">
          <h3 className="text-[10px] font-bold text-[var(--fg-muted)] uppercase tracking-widest mb-3 flex items-center gap-1.5"><Tag size={11} className="text-blue-400" /> {t('recipeEditor.tags')}</h3>
          <div className="flex flex-wrap gap-1.5">
            {editingRecipe.tags.map((tag, i) => (
            <span key={i} className="px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-100 rounded-full text-xs font-medium">{tag}</span>
            ))}
          </div>
          </div>
        )}

        {/* Constraints */}
        {!!(editingRecipe.constraints && (
          editingRecipe.constraints.guards?.length || editingRecipe.constraints.boundaries?.length || editingRecipe.constraints.preconditions?.length || editingRecipe.constraints.sideEffects?.length
        )) && (
          <div className="bg-[var(--bg-subtle)] border border-[var(--border-default)] rounded-2xl p-6 space-y-4">
          <h3 className="text-[10px] font-bold text-[var(--fg-muted)] uppercase tracking-widest flex items-center gap-1.5"><Shield size={11} className="text-amber-500" /> {t('recipeEditor.constraints')}</h3>
          {editingRecipe.constraints.guards && editingRecipe.constraints.guards.length > 0 && (
            <div>
            <span className="text-xs font-semibold text-[var(--fg-muted)] block mb-1.5">{t('recipeEditor.guardRules')}</span>
            <ul className="text-sm text-[var(--fg-secondary)] space-y-1">
              {editingRecipe.constraints.guards.map((g, i) => (
              <li key={i} className="flex gap-2 items-start">
                <span className={`text-xs mt-0.5 ${g.severity === 'error' ? 'text-red-500' : 'text-yellow-500'}`}>●</span>
                <code className="font-mono text-xs bg-[var(--bg-subtle)] px-1.5 py-0.5 rounded">{g.pattern}</code>
                {g.message && <span className="text-xs text-[var(--fg-muted)]">— {g.message}</span>}
              </li>
              ))}
            </ul>
            </div>
          )}
          {editingRecipe.constraints.boundaries && editingRecipe.constraints.boundaries.length > 0 && (
            <div>
            <span className="text-xs font-semibold text-[var(--fg-muted)] block mb-1.5">{t('recipeEditor.boundaryConstraints')}</span>
            <ul className="text-sm text-[var(--fg-secondary)] space-y-1">
              {editingRecipe.constraints.boundaries.map((b, i) => (
              <li key={i} className="flex gap-2"><span className="text-orange-400">●</span>{b}</li>
              ))}
            </ul>
            </div>
          )}
          {editingRecipe.constraints.preconditions && editingRecipe.constraints.preconditions.length > 0 && (
            <div>
            <span className="text-xs font-semibold text-[var(--fg-muted)] block mb-1.5">{t('recipeEditor.preconditions')}</span>
            <ul className="text-sm text-[var(--fg-secondary)] space-y-1">
              {editingRecipe.constraints.preconditions.map((p, i) => (
              <li key={i} className="flex gap-2"><span className="text-blue-400">◆</span>{p}</li>
              ))}
            </ul>
            </div>
          )}
          {editingRecipe.constraints.sideEffects && editingRecipe.constraints.sideEffects.length > 0 && (
            <div>
            <span className="text-xs font-semibold text-[var(--fg-muted)] block mb-1.5">{t('recipeEditor.sideEffects')}</span>
            <ul className="text-sm text-[var(--fg-secondary)] space-y-1">
              {editingRecipe.constraints.sideEffects.map((s, i) => (
              <li key={i} className="flex gap-2"><span className="text-pink-400">⚡</span>{s}</li>
              ))}
            </ul>
            </div>
          )}
          </div>
        )}

        {/* Relations */}
        {editingRecipe.relations && Object.entries(editingRecipe.relations).some(([, v]) => Array.isArray(v) && v.length > 0) && (
          <div className="bg-[var(--bg-subtle)] border border-[var(--border-default)] rounded-2xl p-6">
          <h3 className="text-[10px] font-bold text-[var(--fg-muted)] uppercase tracking-widest mb-4">{t('recipeEditor.relations')}</h3>
          <div className="space-y-2">
            {([
            { key: 'inherits', label: t('recipeEditor.relationTypes.inherits'), color: 'text-green-600', icon: '↑' },
            { key: 'implements', label: t('recipeEditor.relationTypes.implements'), color: 'text-blue-600', icon: '◇' },
            { key: 'calls', label: t('recipeEditor.relationTypes.calls'), color: 'text-cyan-600', icon: '→' },
            { key: 'dependsOn', label: t('recipeEditor.relationTypes.dependsOn'), color: 'text-yellow-600', icon: '⊕' },
            { key: 'dataFlow', label: t('recipeEditor.relationTypes.dataFlow'), color: 'text-purple-600', icon: '⇢' },
            { key: 'conflicts', label: t('recipeEditor.relationTypes.conflicts'), color: 'text-red-600', icon: '✕' },
            { key: 'extends', label: t('recipeEditor.relationTypes.extends'), color: 'text-teal-600', icon: '⊃' },
            { key: 'related', label: t('recipeEditor.relationTypes.associates'), color: 'text-[var(--fg-muted)]', icon: '∼' },
            ] as const).map(({ key, label, color, icon }) => {
            const items = editingRecipe.relations?.[key];
            if (!items || !Array.isArray(items) || items.length === 0) return null;
            return (
              <div key={key} className="flex items-start gap-3">
              <span className={`text-xs font-mono ${color} shrink-0 whitespace-nowrap pt-0.5`}>{icon} {label}</span>
              <div className="flex flex-wrap gap-1.5">
                {items.map((r: any, i: number) => (
                <span key={i} className="px-2 py-0.5 bg-[var(--bg-surface)] border border-[var(--border-default)] text-[var(--fg-secondary)] rounded-lg text-xs font-mono">
                  {typeof r === 'string' ? r : r.id || r.title || JSON.stringify(r)}
                </span>
                ))}
              </div>
              </div>
            );
            })}
          </div>
          </div>
        )}

        {/* 无内容时的提示 */}
        {!editingRecipe.content?.markdown && !editingRecipe.content?.pattern && !editingRecipe.description && (
          <div className="bg-[var(--bg-surface)] p-8 rounded-2xl border border-[var(--border-default)] shadow-sm min-h-[200px] flex items-center justify-center">
          <div className="text-[var(--fg-muted)] italic">{t('recipeEditor.noContent')}</div>
          </div>
        )}
        </div>
      )}
      </div>
    </div>
    <div className="p-6 border-t border-[var(--border-default)] flex justify-end gap-3">
      <button onClick={closeRecipeEdit} disabled={isSavingRecipe} className="px-4 py-2 text-[var(--fg-secondary)] font-medium disabled:opacity-50">{t('recipeEditor.cancel')}</button>
      <button onClick={handleSaveRecipe} disabled={isSavingRecipe} className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium flex items-center gap-2 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed">
      {isSavingRecipe ? <Loader2 size={ICON_SIZES.lg} className="animate-spin" /> : <Save size={ICON_SIZES.lg} />}
      {isSavingRecipe ? t('recipeEditor.saving') : t('recipeEditor.saveChanges')}
      </button>
    </div>
    </div>
  </PageOverlay>
  );
};

export default RecipeEditor;
