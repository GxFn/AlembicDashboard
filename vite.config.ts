import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import type { Socket } from 'net'

// 本地 `alembic ui --port` 会通过 VITE_API_URL 告诉 Dashboard dev server 后端地址。
const apiTarget = (process.env.VITE_API_URL || 'http://127.0.0.1:3000').replace(/\/$/, '')

const MARKDOWN_CHUNK_PACKAGES = [
  'react-markdown',
  'remark-gfm',
  'remark-parse',
  'remark-rehype',
  'unified',
  'bail',
  'ccount',
  'comma-separated-tokens',
  'decode-named-character-reference',
  'devlop',
  'estree-util-is-identifier-name',
  'hast-util-parse-selector',
  'hast-util-to-jsx-runtime',
  'hast-util-whitespace',
  'html-url-attributes',
  'mdast-util',
  'micromark',
  'parse-entities',
  'property-information',
  'space-separated-tokens',
  'stringify-entities',
  'trough',
  'trim-lines',
  'unist-util',
  'vfile',
  'zwitch',
];

const MERMAID_CHUNK_PACKAGES = [
  '@mermaid-js',
  'cytoscape',
  'cytoscape-cose-bilkent',
  'cytoscape-fcose',
  'd3',
  'dagre-d3-es',
  'dompurify',
  'katex',
  'khroma',
  'mermaid',
  'roughjs',
];

const SYNTAX_HIGHLIGHT_CHUNK_PACKAGES = [
  'highlight.js',
  'hastscript',
  'lowlight',
  'prismjs',
  'react-syntax-highlighter',
  'refractor',
];

function isNodePackage(id: string, packageName: string): boolean {
  const normalized = id.replaceAll('\\', '/');
  return normalized.includes(`/node_modules/${packageName}/`);
}

function isMarkdownPackage(id: string): boolean {
  return MARKDOWN_CHUNK_PACKAGES.some((pkg) => isNodePackage(id, pkg));
}

function isMermaidPackage(id: string): boolean {
  return MERMAID_CHUNK_PACKAGES.some((pkg) => isNodePackage(id, pkg));
}

function isSyntaxHighlightPackage(id: string): boolean {
  return SYNTAX_HIGHLIGHT_CHUNK_PACKAGES.some((pkg) => isNodePackage(id, pkg));
}

// ── EPIPE/ECONNRESET 静默 ──────────────────────────────────────
// 问题: Vite 内部在 proxyReqWs 事件上注册 socket.on('error', logger),
// 注册顺序在 opts.configure() 之后。Node EventEmitter 会调用所有 listener,
// 用户添加的空 handler 无法阻止 Vite 的 logger.error() 输出。
// 解决: monkey-patch socket.emit, 在事件分发层面拦截 EPIPE/ECONNRESET,
// 使错误不到达任何 handler (包括 Vite 内部的)。
function silenceSocketEpipe(socket: Socket) {
  const origEmit = socket.emit.bind(socket)
  socket.emit = function (event: string, ...args: unknown[]) {
    if (event === 'error') {
      const err = args[0] as NodeJS.ErrnoException | undefined
      if (err?.code === 'EPIPE' || err?.code === 'ECONNRESET') {
        return true // 吞掉, 不传播给任何 listener
      }
    }
    return origEmit(event, ...args)
  } as Socket['emit']
  return socket
}

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: apiTarget,
        timeout: 300000,      // 5 分钟（AI 扫描需要较长时间）
        configure: (proxy) => {
          proxy.on('error', (err) => {
            if (err.message?.includes('EPIPE') || err.message?.includes('ECONNRESET')) return;
            console.warn('[vite-proxy] error:', err.message);
          });
          // configure 中注册的 proxyReqWs 先于 Vite 内部的注册,
          // 在此 patch socket.emit 可拦截后续所有 error 事件
          proxy.on('proxyReqWs', (_proxyReq, _req, socket) => {
            silenceSocketEpipe(socket as Socket);
          });
        },
      },
      '/socket.io': {
        target: apiTarget,
        ws: true,             // WebSocket 升级
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('error', () => {});
          proxy.on('proxyReqWs', (_proxyReq, _req, socket) => {
            silenceSocketEpipe(socket as Socket);
          });
        },
      },
    },
  },
  build: {
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (isMermaidPackage(id)) return 'mermaid';
          if (isMarkdownPackage(id)) return 'markdown';
          // CodeBlock is lazy-loaded; keep syntax-highlighter internals together
          // in one async chunk to avoid the prior refractor/prismjs TDZ split.
          if (isSyntaxHighlightPackage(id)) return 'syntax-highlight';
          if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/scheduler/')) return 'react';
          if (id.includes('framer-motion')) return 'framer-motion';
          if (id.includes('lucide-react')) return 'icons';
          if (id.includes('axios')) return 'axios';
          if (id.includes('yaml')) return 'yaml';
        }
      }
    }
  }
})
