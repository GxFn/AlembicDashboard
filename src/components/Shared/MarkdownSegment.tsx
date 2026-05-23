import React, { type ReactNode, useMemo } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import CodeBlock from './LazyCodeBlock';
import type { MermaidBlockProps } from './MermaidBlock';

const MermaidBlock = React.lazy(() => import('./MermaidBlock')) as React.LazyExoticComponent<React.FC<MermaidBlockProps>>;

const MERMAID_KEYWORDS = /^\s*(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie|gitGraph|mindmap|timeline|journey|quadrantChart|sankey|xychart|block)\b/i;

function headingId(children: ReactNode): string | undefined {
  if (typeof children !== 'string') return undefined;
  return children.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-').replace(/(^-|-$)/g, '');
}

function isTaskListNode(node: unknown): boolean {
  if (typeof node !== 'object' || node === null || !('children' in node)) return false;
  const children = (node as { children?: unknown[] }).children;
  const firstChild = children?.[0];
  if (typeof firstChild !== 'object' || firstChild === null) return false;
  return (
    'type' in firstChild &&
    firstChild.type === 'element' &&
    'tagName' in firstChild &&
    firstChild.tagName === 'input'
  );
}

function MermaidFallback() {
  return (
    <div className="my-5 h-28 animate-pulse rounded-lg border border-[var(--border-default)] bg-[var(--bg-subtle)]" />
  );
}

const markdownComponents = (showLineNumbers: boolean): Components => ({
  pre({ children }) {
    return <div className="min-w-0">{children}</div>;
  },
  code({ node: _node, className: codeClassName, children, ...props }) {
    const match = /language-(\w+)/.exec(codeClassName || '');
    const raw = Array.isArray(children) ? children.join('') : String(children);
    const codeStr = raw.replace(/\n$/, '');
    const isBlock = raw.includes('\n') || !!match;

    if (isBlock && MERMAID_KEYWORDS.test(codeStr)) {
      return (
        <React.Suspense fallback={<MermaidFallback />}>
          <MermaidBlock code={codeStr} />
        </React.Suspense>
      );
    }
    if (isBlock && match) {
      return (
        <CodeBlock
          code={codeStr}
          language={match[1]}
          showLineNumbers={showLineNumbers}
        />
      );
    }
    if (isBlock) {
      return (
        <CodeBlock
          code={codeStr}
          language="text"
          showLineNumbers={showLineNumbers}
        />
      );
    }
    return (
      <code className="px-1.5 py-0.5 bg-[var(--bg-subtle)] text-[var(--fg-primary)] rounded text-[0.9em] font-mono border border-[var(--border-default)]" {...props}>
        {children}
      </code>
    );
  },
  p: ({ children }) => <p className="mb-4 leading-7 last:mb-0">{children}</p>,
  h1: ({ children, ...props }) => <h1 id={headingId(children)} className="text-[1.75rem] font-bold mb-4 mt-8 first:mt-0 pb-2 border-b border-[var(--border-default)] text-[var(--fg-primary)] leading-tight scroll-mt-20" {...props}>{children}</h1>,
  h2: ({ children, ...props }) => <h2 id={headingId(children)} className="text-xl font-bold mb-3 mt-8 pb-1.5 border-b border-[var(--border-default)] text-[var(--fg-primary)] leading-snug scroll-mt-20" {...props}>{children}</h2>,
  h3: ({ children, ...props }) => <h3 id={headingId(children)} className="text-lg font-semibold mb-2 mt-6 text-[var(--fg-primary)] leading-snug scroll-mt-20" {...props}>{children}</h3>,
  h4: ({ children, ...props }) => <h4 id={headingId(children)} className="text-base font-semibold mb-2 mt-5 text-[var(--fg-primary)] scroll-mt-20" {...props}>{children}</h4>,
  strong: ({ children }) => <strong className="font-semibold text-[var(--fg-primary)]">{children}</strong>,
  em: ({ children }) => <em className="italic text-[var(--fg-secondary)]">{children}</em>,
  del: ({ children }) => <del className="line-through text-[var(--fg-muted)]">{children}</del>,
  hr: () => <hr className="my-8 border-0 h-px bg-[var(--border-default)]" />,
  ul: ({ children }) => <ul className="list-disc pl-6 mb-4 space-y-1.5 marker:text-[var(--fg-muted)]">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal pl-6 mb-4 space-y-1.5 marker:text-[var(--fg-secondary)]">{children}</ol>,
  li: ({ children, node }) => {
    const isTask = isTaskListNode(node);
    return <li className={`leading-7 ${isTask ? 'list-none -ml-6 flex items-start gap-2' : ''}`}>{children}</li>;
  },
  blockquote: ({ children }) => (
    <blockquote className="border-l-4 border-blue-300 bg-blue-50/40 pl-4 pr-3 py-2 my-4 text-[var(--fg-secondary)] rounded-r-lg [&>p]:mb-2 [&>p:last-child]:mb-0">
      {children}
    </blockquote>
  ),
  a: ({ href, children }) => {
    if (href?.startsWith('#')) {
      return (
        <a href={href} className="text-blue-600 hover:text-blue-700 hover:underline underline-offset-2 decoration-blue-300/70 transition-colors">
          {children}
        </a>
      );
    }
    return (
      <a href={href} className="text-blue-600 hover:text-blue-700 hover:underline underline-offset-2 decoration-blue-300/70 transition-colors" target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    );
  },
  img: ({ src, alt }) => (
    <img src={src} alt={alt || ''} className="max-w-full h-auto rounded-lg border border-[var(--border-default)] my-4" loading="lazy" />
  ),
  table: ({ children }) => (
    <div className="my-5 overflow-x-auto rounded-lg border border-[var(--border-default)]">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-[var(--bg-subtle)] border-b border-[var(--border-default)]">{children}</thead>,
  tbody: ({ children }) => <tbody className="divide-y divide-[var(--border-default)]">{children}</tbody>,
  tr: ({ children }) => <tr className="hover:bg-[var(--bg-subtle)] transition-colors">{children}</tr>,
  th: ({ children }) => <th className="px-4 py-2.5 text-left text-xs font-semibold text-[var(--fg-secondary)] uppercase tracking-wider">{children}</th>,
  td: ({ children }) => <td className="px-4 py-2.5 text-[var(--fg-primary)] align-top">{children}</td>,
  input: ({ checked }) => (
    <input type="checkbox" checked={checked} readOnly className="mt-1 w-4 h-4 rounded border-[var(--border-default)] text-blue-600 cursor-default" />
  ),
});

interface MarkdownSegmentProps {
  content: string;
  showLineNumbers?: boolean;
}

const MarkdownSegment: React.FC<MarkdownSegmentProps> = ({ content, showLineNumbers = false }) => {
  const components = useMemo(() => markdownComponents(showLineNumbers), [showLineNumbers]);

  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {content}
    </ReactMarkdown>
  );
};

export default MarkdownSegment;
