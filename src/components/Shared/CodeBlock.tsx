import React from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { normalizeCode } from '../../utils/code';

export { normalizeCode } from '../../utils/code';

const CODE_BLOCK_BG = '#20242d';

/** 支持的语法高亮语言（可扩展） */
export type CodeLanguage = string;

const LANGUAGE_MAP: Record<string, string> = {
  objectivec: 'objectivec',
  objc: 'objectivec',
  'objective-c': 'objectivec',
  'obj-c': 'objectivec',
  swift: 'swift',
  go: 'go',
  javascript: 'javascript',
  js: 'javascript',
  typescript: 'typescript',
  ts: 'typescript',
  python: 'python',
  py: 'python',
  java: 'java',
  kotlin: 'kotlin',
  kt: 'kotlin',
  rust: 'rust',
  rs: 'rust',
  dart: 'dart',
  c: 'c',
  cpp: 'cpp',
  'c++': 'cpp',
  csharp: 'csharp',
  cs: 'csharp',
  ruby: 'ruby',
  rb: 'ruby',
  markdown: 'markdown',
  md: 'markdown',
  json: 'json',
  yaml: 'yaml',
  xml: 'xml',
  bash: 'bash',
  sh: 'bash',
  shell: 'bash',
  sql: 'sql',
  html: 'html',
  css: 'css',
  text: 'text',
};

export interface CodeBlockProps {
  code: string;
  language?: string;
  className?: string;
  showLineNumbers?: boolean;
}

const CodeBlock: React.FC<CodeBlockProps> = ({
  code,
  language = 'text',
  className = '',
  showLineNumbers = false,
}) => {
  const lang = LANGUAGE_MAP[language?.toLowerCase()] || language?.toLowerCase() || 'text';
  const noRadius = className.includes('!rounded-none');
  const normalized = normalizeCode(code);
  return (
  <div className={`rounded-xl overflow-x-auto text-sm min-w-0 ${className}`}>
    <SyntaxHighlighter
    language={lang}
    style={oneDark}
    showLineNumbers={showLineNumbers}
    customStyle={{
      margin: 0,
      padding: '1rem 1.25rem',
      fontSize: '0.8125rem',
      lineHeight: 1.5,
      borderRadius: noRadius ? 0 : '0.75rem',
      overflowX: 'auto',
      backgroundColor: CODE_BLOCK_BG,
    }}
    codeTagProps={{ className: 'language-highlighted', style: { fontFamily: 'ui-monospace, monospace' } }}
    PreTag="div"
    >
    {normalized}
    </SyntaxHighlighter>
  </div>
  );
};

export default CodeBlock;
