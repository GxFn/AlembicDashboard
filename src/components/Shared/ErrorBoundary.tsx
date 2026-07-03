import React from 'react';
import { zh } from '../../i18n/locales/zh';

/* ── ErrorBoundary — 防止白屏 ──────────────
 * W7-e 自 App.tsx 原样搬出（通用组件错位在壳）；渲染文案取 zh 静态字典而非
 * useI18n——class 组件不能用 hook，且崩溃兜底页要在 Provider 之外也可渲染。 */
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 40, textAlign: 'center' }}>
          <h2 style={{ color: '#ef4444', marginBottom: 12 }}>{zh.app.errorBoundary.title}</h2>
          <pre style={{ fontSize: 12, color: '#64748b', whiteSpace: 'pre-wrap', maxWidth: 600, margin: '0 auto' }}>
            {this.state.error?.message}
          </pre>
          <button
            onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload(); }}
            style={{ marginTop: 16, padding: '8px 20px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}
          >
            {zh.app.errorBoundary.refreshBtn}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
