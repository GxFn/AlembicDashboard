/**
 * I18n Context, Provider & Hook for Alembic Dashboard.
 *
 * Usage:
 *   1. Wrap <App /> with <I18nProvider>
 *   2. In any component:  const { t, lang, setLang } = useI18n();
 *   3. t('sidebar.recipes')           →  "Recipes"
 *   4. t('pagination.showing', { start: 1, end: 10, total: 100 })
 */

import { createContext, useContext, useState, useCallback, useMemo, useEffect, type ReactNode } from 'react';
// W7-c 双通道收敛：语言偏好读写改经共享 api 层（i18n→api 单向运行时边，
// layer-contract 已回写；api 不回引 i18n，无环）。HTTP 串 /ai/lang 不变。
import api from '../api';
import { zh } from './locales/zh';
import { en } from './locales/en';
import type { Locale } from './types';

/* ── locale registry ─────────────────────────────────── */
const locales = { zh, en };

const STORAGE_KEY = 'asd-dashboard-lang';

function getInitialLang(): Locale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'en' || stored === 'zh') return stored;
  } catch { /* SSR / iframe sandbox */ }
  return 'zh';
}

/* ── deep get by dot-notation key ────────────────────── */
function deepGet(obj: any, path: string): string | undefined {
  const parts = path.split('.');
  let cur = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = cur[p];
  }
  return typeof cur === 'string' ? cur : undefined;
}

/* ── interpolate {variable} placeholders ─────────────── */
function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    const val = vars[key];
    return val != null ? String(val) : `{${key}}`;
  });
}

/* ── Context ─────────────────────────────────────────── */
interface I18nContextValue {
  lang: Locale;
  setLang: (l: Locale) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

/* ── Provider ────────────────────────────────────────── */
export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Locale>(getInitialLang);

  // 启动时与服务端同步语言：
  //   有 localStorage → 推送到服务端（确保重启后一致）
  //   无 localStorage → 从服务端拉取系统默认语言
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'en' || stored === 'zh') {
      // 用户有本地偏好 → 推送到服务端确保一致（fire-and-forget）
      api.setLang(stored).catch(() => { /* noop */ });
    } else {
      // 首次访问 → 从服务端获取系统默认语言
      // （api.getLang 服务端缺省时归一化为 'zh'，与本地默认一致）
      api.getLang()
        .then(serverLang => {
          if (serverLang === 'en' || serverLang === 'zh') {
            setLangState(serverLang);
            try { localStorage.setItem(STORAGE_KEY, serverLang); } catch { /* noop */ }
          }
        })
        .catch(() => { /* server unreachable, keep default */ });
    }
  }, []);

  const setLang = useCallback((l: Locale) => {
    setLangState(l);
    try { localStorage.setItem(STORAGE_KEY, l); } catch { /* noop */ }
    // 同步到服务端（fire-and-forget）— 影响后续冷启动等 AI 输出语言
    api.setLang(l).catch(() => { /* noop */ });
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>): string => {
      const msg = deepGet(locales[lang], key) ?? deepGet(locales.zh, key) ?? key;
      return interpolate(msg, vars);
    },
    [lang],
  );

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/* ── Hook ────────────────────────────────────────────── */
export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within <I18nProvider>');
  return ctx;
}

/* ── re-exports for convenience ──────────────────────── */
export type { Locale } from './types';
