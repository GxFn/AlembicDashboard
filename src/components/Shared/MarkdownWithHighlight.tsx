import React, { useMemo } from 'react';
import type { MermaidBlockProps } from './MermaidBlock';

const MarkdownSegment = React.lazy(() => import('./MarkdownSegment'));
const MermaidBlock = React.lazy(() => import('./MermaidBlock')) as React.LazyExoticComponent<React.FC<MermaidBlockProps>>;

/** 移除 YAML frontmatter（--- 包裹的元数据块），供复制等场景使用 */
export function stripFrontmatter(text: string): string {
  if (!text || typeof text !== 'string') return text;
  return text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '').trim() || text;
}

/* ═══════════════════════════════════════════════════════
 *  内容预处理工具
 * ═══════════════════════════════════════════════════════ */

/** 处理双重转义的换行符 \\n -> \n */
function normalizeNewlines(text: string): string {
  if (!text || typeof text !== 'string') return text;
  return text.replace(/\\\\n/g, '\n');
}

/** 将单换行符转换为 Markdown 硬换行（行尾两空格），保留双换行（段落分隔）
 *  逐行处理，跳过代码围栏块内部，避免破坏代码块解析 */
function enableMarkdownHardBreaks(text: string): string {
  if (!text || typeof text !== 'string') return text;
  const lines = text.split('\n');
  const out: string[] = [];
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*(`{3,}|~{3,})/.test(line)) {
      inFence = !inFence;
      out.push(line);
      continue;
    }
    if (inFence) {
      out.push(line);
      continue;
    }
    const next = lines[i + 1];
    if (line !== '' && next !== undefined && next !== '') {
      out.push(line + '  ');
    } else {
      out.push(line);
    }
  }
  return out.join('\n');
}

/* ═══════════════════════════════════════════════════════
 *  Mermaid 提取：在 Markdown 渲染前拆分内容
 *  将 ```mermaid ... ``` 块提取为独立段落，
 *  ReactMarkdown 只负责文字和代码高亮
 * ═══════════════════════════════════════════════════════ */

interface ContentSegment {
  type: 'markdown' | 'mermaid';
  content: string;
}

/** 将 markdown 文本拆分为普通文本段和 mermaid 图表段 */
function splitMermaidSegments(text: string): ContentSegment[] {
  const segments: ContentSegment[] = [];
  const lines = text.split('\n');
  let current: string[] = [];
  let inMermaid = false;
  let inOtherFence = false;
  let mermaidLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fenceMatch = /^\s*(`{3,}|~{3,})(.*)$/.exec(line);

    if (fenceMatch && !inOtherFence && !inMermaid) {
      const lang = fenceMatch[2].trim().toLowerCase();
      if (lang === 'mermaid') {
        // 开始 mermaid 块：先保存之前的 markdown 段
        if (current.length > 0) {
          segments.push({ type: 'markdown', content: current.join('\n') });
          current = [];
        }
        inMermaid = true;
        mermaidLines = [];
        continue;
      } else {
        // 其他代码围栏块
        inOtherFence = true;
        current.push(line);
        continue;
      }
    }

    if (inMermaid && fenceMatch) {
      // mermaid 块结束
      segments.push({ type: 'mermaid', content: mermaidLines.join('\n') });
      inMermaid = false;
      mermaidLines = [];
      continue;
    }

    if (inOtherFence && fenceMatch) {
      inOtherFence = false;
      current.push(line);
      continue;
    }

    if (inMermaid) {
      mermaidLines.push(line);
    } else {
      // 无语言标注的围栏块：检测内容是否以 mermaid 关键词开头
      current.push(line);
    }
  }

  // 尾部残余
  if (inMermaid && mermaidLines.length > 0) {
    segments.push({ type: 'mermaid', content: mermaidLines.join('\n') });
  }
  if (current.length > 0) {
    segments.push({ type: 'markdown', content: current.join('\n') });
  }

  return segments;
}

function MermaidFallback() {
  return (
    <div className="my-5 h-28 animate-pulse rounded-lg border border-[var(--border-default)] bg-[var(--bg-subtle)]" />
  );
}

function MarkdownFallback() {
  return (
    <div className="my-3 h-20 animate-pulse rounded-lg border border-[var(--border-default)] bg-[var(--bg-subtle)]" />
  );
}

/* ═══════════════════════════════════════════════════════
 *  主组件
 * ═══════════════════════════════════════════════════════ */

interface MarkdownWithHighlightProps {
  content: string;
  className?: string;
  showLineNumbers?: boolean;
  stripFrontmatter?: boolean;
}

const MarkdownWithHighlight: React.FC<MarkdownWithHighlightProps> = ({
  content,
  className = '',
  showLineNumbers = false,
  stripFrontmatter: doStrip = false,
}) => {
  const segments = useMemo(() => {
    let text = doStrip ? stripFrontmatter(content) : content;
    text = normalizeNewlines(text);
    text = enableMarkdownHardBreaks(text);
    return splitMermaidSegments(text);
  }, [content, doStrip]);

  return (
    <div className={`markdown-body text-[var(--fg-primary)] ${className}`}>
      {segments.map((seg, i) =>
        seg.type === 'mermaid' ? (
          <React.Suspense key={`mermaid-${i}`} fallback={<MermaidFallback />}>
            <MermaidBlock code={seg.content} />
          </React.Suspense>
        ) : (
          <React.Suspense key={`md-${i}`} fallback={<MarkdownFallback />}>
            <MarkdownSegment content={seg.content} showLineNumbers={showLineNumbers} />
          </React.Suspense>
        ),
      )}
    </div>
  );
};

export default MarkdownWithHighlight;
