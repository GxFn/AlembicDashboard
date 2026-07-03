/**
 * auth — /auth 路由族（W7-c 收敛入 api 层，W7-f 落族文件）。
 * Authorization 头由调用方显式组装传参；共享 http 实例零拦截器（行为恒等边界）。
 */

import { http } from './client';


export const authApi = {
  // ── Auth（双通道收敛：useAuth/usePermission 经共享 http 走同一传输层）──────
  //
  // 行为恒等边界（W7-c，底稿 D4）：
  //   - Authorization 头由调用方显式组装后作为参数传入，禁止给共享 http 实例加
  //     全局拦截器（那会让所有请求携带 token，属行为变更）。
  //   - 响应体按后端 {success, data, error} 信封原样透传，不做归一化（纯搬运）。
  //   - 后端当前仅实现 /auth/probe（HttpServer 内联端点）；/auth/login、/auth/me
  //     为前端预留通道（VITE_AUTH_ENABLED 默认关，调用不可达），保持原样不扩权。

  /** 登录（AUTH 模式）。凭证经 POST /auth/login 换取 token。 */
  async authLogin(credentials: { username: string; password: string }): Promise<{
    success?: boolean;
    data?: { token?: string; user?: { username: string; role: string } };
    error?: { message?: string };
  }> {
    const res = await http.post('/auth/login', credentials);
    return res.data ?? {};
  },

  /** 校验既有 token（AUTH 模式启动时）。headers 由调用方显式传入。 */
  async authMe(headers: Record<string, string>): Promise<{
    success?: boolean;
    data?: { user?: { username: string; role: string } };
  }> {
    const res = await http.get('/auth/me', { headers });
    return res.data ?? {};
  },

  /** 探测当前 UI 写入范围（probe 模式）。headers 由调用方显式传入。 */
  async authProbe(headers: Record<string, string>): Promise<{
    success?: boolean;
    data?: {
      role?: string;
      user?: string;
      mode?: 'token' | 'probe';
      probeCache?: {
        cached: boolean;
        result?: string;
        cachedAt?: number;
        expiresAt?: number;
        expired?: boolean;
      } | null;
    };
  }> {
    const res = await http.get('/auth/probe', { headers });
    return res.data ?? {};
  },
};
