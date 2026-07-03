/**
 * skills — /skills 路由族：Skill CRUD（W7-f 自 api.ts 拆出；aiGenerateSkill 走 /ai/chat 归 ai 族）。
 */

import { http } from './client';


/** Skill 元信息 */
export interface SkillInfo {
  name: string;
  source: 'builtin' | 'project';
  summary: string;
  useCase: string | null;
  createdBy: string | null;
  createdAt: string | null;
  description?: string;
  [key: string]: unknown;
}

export const skillsApi = {
  // ── Skills ──────────────────────────────────────────

  /** 获取所有 Skills 列表 */
  async listSkills(): Promise<{ skills: SkillInfo[]; total: number; hint?: string }> {
    const res = await http.get('/skills');
    return res.data?.data || { skills: [], total: 0 };
  },

  /** 加载指定 Skill 完整内容 */
  async loadSkill(name: string, section?: string): Promise<{
    skillName: string; source: string; content: string; charCount: number;
    useCase: string | null; relatedSkills: string[]; createdBy: string | null; createdAt: string | null;
  }> {
    const params = section ? `?section=${encodeURIComponent(section)}` : '';
    const res = await http.get(`/skills/${encodeURIComponent(name)}${params}`);
    return res.data?.data || {};
  },

  /** 创建项目级 Skill */
  async createSkill(data: { name: string; description: string; content: string; overwrite?: boolean; createdBy?: string }): Promise<Record<string, unknown>> {
    const res = await http.post('/skills', data);
    return res.data?.data || {};
  },

  /** 更新项目级 Skill */
  async updateSkill(name: string, data: { description?: string; content?: string }): Promise<Record<string, unknown>> {
    const res = await http.put(`/skills/${encodeURIComponent(name)}`, data);
    return res.data?.data || {};
  },

  /** 删除项目级 Skill */
  async deleteSkill(name: string): Promise<Record<string, unknown>> {
    const res = await http.delete(`/skills/${encodeURIComponent(name)}`);
    return res.data?.data || {};
  },
};
