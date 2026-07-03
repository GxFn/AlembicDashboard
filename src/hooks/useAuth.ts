/**
 * useAuth — 可配置的认证 Hook
 *
 * 通过环境变量 VITE_AUTH_ENABLED 控制是否启用登录：
 *   - 'true'  → 需要登录后才能访问 Dashboard
 *   - 其他值  → 默认放行（不显示登录页）
 *
 * 登录凭证保存在 localStorage('auth_token' / 'auth_user')。
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../api';
import { getErrorMessage } from '../utils/error';

export interface AuthUser {
  username: string;
  role: string;
}

export interface AuthState {
  /** 认证功能是否启用 */
  authEnabled: boolean;
  /** 是否已通过认证（authEnabled=false 时始终 true） */
  isAuthenticated: boolean;
  /** 正在加载中 */
  isLoading: boolean;
  /** 当前用户信息 */
  user: AuthUser | null;
  /** 登录 */
  login: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
  /** 登出 */
  logout: () => void;
}

const AUTH_ENABLED = import.meta.env.VITE_AUTH_ENABLED === 'true';
const TOKEN_KEY = 'auth_token';
const USER_KEY = 'auth_user';

export function useAuth(): AuthState {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState<AuthUser | null>(() => {
    try {
      const raw = localStorage.getItem(USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  });
  const [isLoading, setIsLoading] = useState(false);

  /* ── 登录 ─────────────────────────────────── */
  const login = useCallback(async (username: string, password: string) => {
    setIsLoading(true);
    try {
      // W7-c：改经共享 api 层（POST /auth/login 串不变）；响应信封原样透传
      const data = await api.authLogin({ username, password });
      if (data.success) {
        const t = data.data?.token as string;
        const u: AuthUser = data.data?.user ?? { username, role: 'local-write' };
        localStorage.setItem(TOKEN_KEY, t);
        localStorage.setItem(USER_KEY, JSON.stringify(u));
        setToken(t);
        setUser(u);
        return { success: true };
      }
      return { success: false, error: data.error?.message || '登录失败' };
    } catch (err: unknown) {
      const msg = getErrorMessage(err, '网络错误');
      return { success: false, error: msg };
    } finally {
      setIsLoading(false);
    }
  }, []);

  /* ── 登出 ─────────────────────────────────── */
  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setToken(null);
    setUser(null);
  }, []);

  /* ── 启动时验证 token 有效性 ────────────────── */
  useEffect(() => {
    if (!AUTH_ENABLED || !token) return;
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      try {
        // W7-c：Authorization 头仍由本调用方显式组装（不加全局拦截器）
        const res = await api.authMe({ Authorization: `Bearer ${token}` });
        if (!cancelled && res.success) {
          setUser(res.data?.user ?? null);
        } else if (!cancelled) {
          logout();
        }
      } catch {
        if (!cancelled) logout();
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── 返回 ─────────────────────────────────── */
  const isAuthenticated = useMemo(() => {
    if (!AUTH_ENABLED) return true; // 未启用认证 → 始终放行
    return !!token && !!user;
  }, [token, user]);

  return {
    authEnabled: AUTH_ENABLED,
    isAuthenticated,
    isLoading,
    user,
    login,
    logout,
  };
}
