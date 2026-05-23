import React from 'react';
import type { CodeBlockProps } from './CodeBlock';

const CodeBlock = React.lazy(() => import('./CodeBlock')) as React.LazyExoticComponent<React.FC<CodeBlockProps>>;

function CodeBlockFallback({ code }: { code: string }) {
  return (
    <pre className="min-w-0 overflow-x-auto rounded-xl border border-[var(--border-default)] bg-[var(--bg-subtle)] p-4 text-sm text-[var(--fg-secondary)]">
      <code>{code}</code>
    </pre>
  );
}

const LazyCodeBlock: React.FC<CodeBlockProps> = (props) => (
  <React.Suspense fallback={<CodeBlockFallback code={props.code} />}>
    <CodeBlock {...props} />
  </React.Suspense>
);

export default LazyCodeBlock;
