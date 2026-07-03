/**
 * usePermission — 前端 UI 写入范围 Hook
 *
 * 双路径模式：
 *   AUTH_ENABLED=false → 进入页面时调用 /api/v1/auth/probe 获取探针范围
 *   AUTH_ENABLED=true  → 从 useAuth 的 user.role 归一化为 UI 写入范围
 *
 * 提供写入范围和权限检查方法，供组件做 UI 级别的安全过滤
 * （按钮灰化、菜单隐藏等）。
 *
 * 注意：这是前端 UI 层面的安全过滤，后端功能入口仍会做最终裁决。
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../api';

export type RoleId =
  | 'local-write'
  | 'agent-submit'
  | 'read-only';

export type PermissionMode = 'token' | 'probe';

export interface PermissionState {
  /** 当前 UI 写入范围，不代表后端用户职责角色 */
  role: RoleId;
  /** 当前用户标识 */
  user: string;
  /** 权限模式 */
  mode: PermissionMode;
  /** 是否正在加载 */
  isLoading: boolean;
  /** 是否可写 */
  canWrite: boolean;
  /** 是否只读 */
  isReadOnly: boolean;
  /** 检查是否有某个具体权限 */
  can: (action: string, resource?: string) => boolean;
  /** 探针缓存状态 */
  probeCache: ProbeCache | null;
  /** 重新探测 */
  refresh: () => void;
}

interface ProbeCache {
  cached: boolean;
  result?: string;
  cachedAt?: number;
  expiresAt?: number;
  expired?: boolean;
}

const DEFAULT_ACCESS_SCOPE: RoleId = 'local-write';

/**
 * Dashboard UI 范围矩阵只用于前端显示过滤；真实写保护属于后端功能入口。
 */
const ACCESS_SCOPE_PERMISSIONS: Record<RoleId, string[]> = {
  'local-write': ['*'],
  'agent-submit': [
    'read:recipes', 'read:guard_rules',
    'create:candidates', 'submit:knowledge',
    'read:audit_logs:self',
    'knowledge:bootstrap',
  ],
  'read-only': [
    'read:recipes', 'read:candidates', 'create:candidates', 'read:guard_rules',
  ],
};

const AUTH_ENABLED = import.meta.env.VITE_AUTH_ENABLED === 'true';

function normalizeAccessScope(value?: string): RoleId {
  if (value === 'local-write' || value === 'agent-submit' || value === 'read-only') {
    return value;
  }
  if (value === 'external_agent') {
    return 'agent-submit';
  }
  if (value === 'chat_agent') {
    return 'read-only';
  }
  return DEFAULT_ACCESS_SCOPE;
}

export function usePermission(authRole?: string): PermissionState {
  const [role, setRole] = useState<RoleId>(() => {
    if (AUTH_ENABLED && authRole) return normalizeAccessScope(authRole);
    return DEFAULT_ACCESS_SCOPE;
  });
  const [user, setUser] = useState('anonymous');
  const [mode, setMode] = useState<PermissionMode>(AUTH_ENABLED ? 'token' : 'probe');
  const [isLoading, setIsLoading] = useState(!AUTH_ENABLED); // probe 模式需要加载
  const [probeCache, setProbeCache] = useState<ProbeCache | null>(null);

  /** 调用后端 probe 接口获取 UI 写入范围 */
  const fetchProbe = useCallback(async () => {
    setIsLoading(true);
    try {
      const token = localStorage.getItem('auth_token');
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;

      // W7-c：改经共享 api 层（GET /auth/probe 串不变）；headers 仍由此处显式组装
      const res = await api.authProbe(headers);
      if (res.success && res.data) {
        const d = res.data;
        setRole(normalizeAccessScope(d.role));
        if (typeof d.user === 'string') { setUser(d.user); }
        if (d.mode === 'token' || d.mode === 'probe') { setMode(d.mode); }
        setProbeCache(d.probeCache ?? null);
      }
    } catch {
      setRole(DEFAULT_ACCESS_SCOPE);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // AUTH 模式：直接用角色，不走探针
  useEffect(() => {
    if (AUTH_ENABLED) {
      if (authRole) {
        setRole(normalizeAccessScope(authRole));
        setMode('token');
        setIsLoading(false);
      }
      return;
    }
    // 非 AUTH 模式：页面进入时探测
    fetchProbe();
  }, [authRole, fetchProbe]);

  /** 权限检查 */
  const can = useCallback((action: string, resource?: string) => {
    const perms = ACCESS_SCOPE_PERMISSIONS[role] || [];
    if (perms.includes('*')) return true;

    // 精确匹配 action:resource
    const full = resource ? `${action}:${resource}` : action;
    if (perms.includes(full)) return true;

    // action 通配符
    const actionPart = action.split(':')[0];
    if (perms.includes(`${actionPart}:*`)) return true;

    // read:* 通配
    if (actionPart === 'read' && perms.includes('read:*')) return true;

    return false;
  }, [role]);

  const canWrite = useMemo(() => role === 'local-write', [role]);
  const isReadOnly = useMemo(() => role === 'read-only', [role]);

  return {
    role,
    user,
    mode,
    isLoading,
    canWrite,
    isReadOnly,
    can,
    probeCache,
    refresh: fetchProbe,
  };
}
