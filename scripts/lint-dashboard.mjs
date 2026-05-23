import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const sourceRoot = path.join(root, 'src');
const textFilePattern = /\.(ts|tsx|js|jsx|mjs|cjs|json|md)$/;
const codeFilePattern = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const ignoredDirs = new Set(['.git', 'dist', 'node_modules', '.vite']);

function walk(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (ignoredDirs.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(fullPath));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

function read(filePath) {
  return readFileSync(filePath, 'utf8');
}

function rel(filePath) {
  return path.relative(root, filePath).replaceAll(path.sep, '/');
}

function lineNumber(text, index) {
  return text.slice(0, index).split('\n').length;
}

const sourceFiles = statSync(sourceRoot).isDirectory()
  ? walk(sourceRoot).filter((filePath) => codeFilePattern.test(filePath))
  : [];
const rootCodeFiles = ['vite.config.ts'].map((name) => path.join(root, name));
const textFiles = [
  ...sourceFiles,
  ...rootCodeFiles,
  path.join(root, 'package.json'),
  path.join(root, 'README.md'),
].filter((filePath) => textFilePattern.test(filePath));

const violations = [];

function add(id, filePath, line, message) {
  violations.push({ id, file: rel(filePath), line, message });
}

for (const filePath of [...sourceFiles, ...rootCodeFiles]) {
  const text = read(filePath);
  for (const match of text.matchAll(/console\.log\s*\(/g)) {
    add('no-console-log', filePath, lineNumber(text, match.index ?? 0), 'Use notify, console.warn/error, or a scoped logger instead of console.log.');
  }
  for (const match of text.matchAll(/catch\s*\([^)]*:\s*any\b/g)) {
    add('no-catch-any', filePath, lineNumber(text, match.index ?? 0), 'Catch unknown and normalize with src/utils/error.ts.');
  }
  for (const match of text.matchAll(/\bas\s+any\b/g)) {
    add('no-as-any', filePath, lineNumber(text, match.index ?? 0), 'Avoid erasing types with as any.');
  }
  for (const match of text.matchAll(/\[object Object\]/g)) {
    add('no-object-object-copy', filePath, lineNumber(text, match.index ?? 0), 'Object values must be rendered with an explicit formatter.');
  }
}

for (const filePath of textFiles) {
  const text = read(filePath);
  for (const match of text.matchAll(/\/Users\/gaoxuefeng\//g)) {
    add('no-user-absolute-path', filePath, lineNumber(text, match.index ?? 0), 'Do not commit user-specific absolute paths.');
  }
}

const anyBudgets = new Map([
  ['src/components/Shared/MarkdownWithHighlight.tsx', 0],
  ['src/components/Shared/GlobalChatDrawer.tsx', 0],
  ['src/hooks/useChatTopics.ts', 0],
  ['src/api.ts', 3],
]);

for (const [file, maxAny] of anyBudgets.entries()) {
  const filePath = path.join(root, file);
  const text = read(filePath);
  const matches = [...text.matchAll(/\bany\b/g)];
  if (matches.length > maxAny) {
    add(
      'explicit-any-budget',
      filePath,
      matches.length > 0 ? lineNumber(text, matches[maxAny]?.index ?? matches[0].index ?? 0) : 1,
      `Explicit any budget is ${maxAny}, found ${matches.length}.`,
    );
  }
}

const pkg = JSON.parse(read(path.join(root, 'package.json')));
for (const scriptName of ['lint', 'test', 'typecheck', 'build', 'check']) {
  const command = pkg.scripts?.[scriptName] || '';
  if (!command || /echo|exit\s+0|true/.test(command)) {
    add('real-script-required', path.join(root, 'package.json'), 1, `${scriptName} must run a real command.`);
  }
}

if (violations.length > 0) {
  console.error('Dashboard lint failed:');
  for (const v of violations) {
    console.error(`- ${v.id} ${v.file}:${v.line} ${v.message}`);
  }
  process.exit(1);
}

console.log(`Dashboard lint passed (${sourceFiles.length} source files checked).`);
