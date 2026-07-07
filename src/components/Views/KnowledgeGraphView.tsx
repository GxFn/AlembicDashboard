import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CircleDot, RefreshCw, Share2 } from 'lucide-react';
import api, { type KnowledgeGraph, type KnowledgeGraphStats } from '../../api';
import { useI18n } from '../../i18n';
import { getErrorMessage } from '../../utils/error';

interface GraphNode {
  category: string;
  id: string;
  label: string;
  type: string;
}

const GRAPH_WIDTH = 920;
const GRAPH_HEIGHT = 440;

function truncateLabel(label: string): string {
  return label.length > 24 ? `${label.slice(0, 21)}...` : label;
}

function relationLabel(relation: string): string {
  return relation.replace(/[_-]+/g, ' ');
}

function nodeColor(type: string): { fill: string; stroke: string; text: string } {
  if (type === 'recipe') {
    return { fill: 'rgba(59, 130, 246, 0.12)', stroke: 'rgb(59 130 246)', text: 'rgb(37 99 235)' };
  }
  if (type === 'knowledge') {
    return { fill: 'rgba(16, 185, 129, 0.12)', stroke: 'rgb(16 185 129)', text: 'rgb(5 150 105)' };
  }
  return { fill: 'rgba(148, 163, 184, 0.12)', stroke: 'rgb(100 116 139)', text: 'rgb(71 85 105)' };
}

function buildNodes(graph: KnowledgeGraph | null): GraphNode[] {
  if (!graph) {
    return [];
  }
  const ids = new Set<string>();
  graph.edges.forEach((edge) => {
    ids.add(edge.fromId);
    ids.add(edge.toId);
  });
  return [...ids].sort().map((id) => ({
    category: graph.nodeCategories[id] ?? '',
    id,
    label: graph.nodeLabels[id] ?? id,
    type: graph.nodeTypes[id] ?? 'unknown',
  }));
}

function nodePositions(nodes: GraphNode[]): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  if (nodes.length === 0) {
    return positions;
  }
  const centerX = GRAPH_WIDTH / 2;
  const centerY = GRAPH_HEIGHT / 2;
  const radiusX = Math.min(360, 130 + nodes.length * 8);
  const radiusY = Math.min(155, 70 + nodes.length * 4);
  nodes.forEach((node, index) => {
    const angle = (Math.PI * 2 * index) / nodes.length - Math.PI / 2;
    positions.set(node.id, {
      x: centerX + Math.cos(angle) * radiusX,
      y: centerY + Math.sin(angle) * radiusY,
    });
  });
  return positions;
}

const KnowledgeGraphView: React.FC = () => {
  const { t } = useI18n();
  const [graph, setGraph] = useState<KnowledgeGraph | null>(null);
  const [stats, setStats] = useState<KnowledgeGraphStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const loadGraph = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [graphData, statsData] = await Promise.all([
        api.getKnowledgeGraph(),
        api.getGraphStats(),
      ]);
      setGraph(graphData);
      setStats(statsData);
    } catch (err: unknown) {
      setError(getErrorMessage(err, t('knowledgeGraph.loadFailed')));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadGraph();
  }, [loadGraph]);

  const nodes = useMemo(() => buildNodes(graph), [graph]);
  const positions = useMemo(() => nodePositions(nodes), [nodes]);
  const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const selectedEdges = useMemo(() => {
    if (!graph || !selectedNodeId) {
      return [];
    }
    return graph.edges.filter((edge) => edge.fromId === selectedNodeId || edge.toId === selectedNodeId);
  }, [graph, selectedNodeId]);

  const relationEntries = useMemo(() => {
    if (!stats) {
      return [];
    }
    return Object.entries(stats.byRelation)
      .sort((left, right) => right[1] - left[1])
      .slice(0, 8);
  }, [stats]);

  if (loading) {
    return (
      <div className="flex min-h-[320px] items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-red-700 shadow-sm">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 shrink-0" size={20} />
          <div>
            <p className="font-semibold">{t('knowledgeGraph.loadFailed')}</p>
            <p className="mt-1 text-sm">{error}</p>
            <button
              type="button"
              onClick={loadGraph}
              className="mt-4 rounded-md bg-red-100 px-4 py-2 text-sm font-medium text-red-800 transition-colors hover:bg-red-200"
            >
              {t('knowledgeGraph.refresh')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!graph || nodes.length === 0 || graph.edges.length === 0) {
    return (
      <div className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-subtle)] p-8 text-[var(--fg-secondary)] shadow-sm">
        <div className="flex items-start gap-3">
          <Share2 className="mt-0.5 shrink-0 text-[var(--fg-muted)]" size={22} />
          <div>
            <p className="font-semibold text-[var(--fg-primary)]">{t('knowledgeGraph.emptyTitle')}</p>
            <p className="mt-2 text-sm">{t('knowledgeGraph.emptyDesc')}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--accent-emphasis)]">
            <Share2 size={18} />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-[var(--fg-primary)]">{t('knowledgeGraph.title')}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--fg-secondary)]">
              <span>{t('knowledgeGraph.nodes', { count: nodes.length })}</span>
              <span>{t('knowledgeGraph.edges', { count: graph.edges.length })}</span>
              {stats && <span>{t('knowledgeGraph.totalEdges', { count: stats.totalEdges })}</span>}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={loadGraph}
          className="inline-flex w-fit items-center gap-2 rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-sm font-medium text-[var(--fg-secondary)] transition-colors hover:bg-[var(--bg-muted)]"
        >
          <RefreshCw size={16} />
          {t('knowledgeGraph.refresh')}
        </button>
      </div>

      {relationEntries.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {relationEntries.map(([relation, count]) => (
            <span
              key={relation}
              className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] px-2.5 py-1 text-xs text-[var(--fg-secondary)]"
            >
              <CircleDot size={11} />
              {relationLabel(relation)}
              <span className="font-semibold text-[var(--fg-primary)]">{count}</span>
            </span>
          ))}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-[var(--border-default)] bg-[var(--bg-subtle)] shadow-sm">
        <svg
          width={GRAPH_WIDTH}
          height={GRAPH_HEIGHT}
          viewBox={`0 0 ${GRAPH_WIDTH} ${GRAPH_HEIGHT}`}
          className="mx-auto block"
        >
          <defs>
            <marker id="knowledge-arrow" markerHeight="8" markerWidth="8" orient="auto" refX="7" refY="4">
              <path d="M 0 0 L 8 4 L 0 8 z" fill="rgb(148 163 184)" />
            </marker>
          </defs>
          {graph.edges.map((edge, index) => {
            const from = positions.get(edge.fromId);
            const to = positions.get(edge.toId);
            if (!from || !to) {
              return null;
            }
            const selected = selectedNodeId === edge.fromId || selectedNodeId === edge.toId;
            return (
              <g key={`${edge.fromId}-${edge.toId}-${edge.relation}-${index}`}>
                <line
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  stroke={selected ? 'rgb(59 130 246)' : 'rgb(148 163 184)'}
                  strokeOpacity={selectedNodeId && !selected ? 0.15 : 0.6}
                  strokeWidth={selected ? 2.2 : 1.2}
                  markerEnd="url(#knowledge-arrow)"
                />
              </g>
            );
          })}
          {nodes.map((node) => {
            const position = positions.get(node.id);
            if (!position) {
              return null;
            }
            const style = nodeColor(node.type);
            const selected = selectedNodeId === node.id;
            const connected = selectedNodeId
              ? selectedEdges.some((edge) => edge.fromId === node.id || edge.toId === node.id)
              : true;
            return (
              <g
                key={node.id}
                onClick={() => setSelectedNodeId(selected ? null : node.id)}
                style={{ cursor: 'pointer', opacity: connected ? 1 : 0.32 }}
              >
                <title>{node.label}</title>
                <circle
                  cx={position.x}
                  cy={position.y}
                  r={selected ? 34 : 28}
                  fill={style.fill}
                  stroke={selected ? 'rgb(59 130 246)' : style.stroke}
                  strokeWidth={selected ? 3 : 2}
                />
                <text
                  x={position.x}
                  y={position.y + 4}
                  textAnchor="middle"
                  fontSize="10"
                  fontWeight="600"
                  fill={style.text}
                  pointerEvents="none"
                >
                  {truncateLabel(node.label)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {selectedNodeId && (
        <div className="mt-4 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] p-4 shadow-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-sm font-semibold text-[var(--fg-primary)]">
                {nodeById.get(selectedNodeId)?.label ?? selectedNodeId}
              </h3>
              <p className="mt-1 text-xs text-[var(--fg-secondary)]">
                {nodeById.get(selectedNodeId)?.type ?? 'unknown'}
              </p>
            </div>
            <span className="text-xs text-[var(--fg-muted)]">
              {t('knowledgeGraph.connectedEdges', { count: selectedEdges.length })}
            </span>
          </div>
          <ul className="mt-3 grid gap-2 text-sm text-[var(--fg-secondary)] md:grid-cols-2">
            {selectedEdges.map((edge, index) => (
              <li
                key={`${edge.fromId}-${edge.toId}-${edge.relation}-selected-${index}`}
                className="rounded-md border border-[var(--border-default)] bg-[var(--bg-subtle)] px-3 py-2"
              >
                <span className="font-medium text-[var(--fg-primary)]">
                  {nodeById.get(edge.fromId)?.label ?? edge.fromId}
                </span>
                <span className="mx-2 text-[var(--fg-muted)]">{relationLabel(edge.relation)}</span>
                <span className="font-medium text-[var(--fg-primary)]">
                  {nodeById.get(edge.toId)?.label ?? edge.toId}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default KnowledgeGraphView;
