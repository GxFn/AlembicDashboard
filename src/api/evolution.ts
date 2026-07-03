/**
 * evolution — /evolution 路由族：Proposals & Warnings（W7-f 自 api.ts 拆出）。
 */

import { http } from './client';
import type { ProposalRecord, WarningRecord } from '../types';


export const evolutionApi = {
  /* ════════════════════════════════════════════════════════
   *  Evolution — Proposals & Warnings
   * ════════════════════════════════════════════════════════ */

  /** 查询 Proposals */
  async getProposals(filter?: {
    status?: string;
    type?: string;
    targetRecipeId?: string;
    source?: string;
    limit?: number;
  }): Promise<ProposalRecord[]> {
    const params: Record<string, string> = {};
    if (filter?.status) { params.status = filter.status; }
    if (filter?.type) { params.type = filter.type; }
    if (filter?.targetRecipeId) { params.targetRecipeId = filter.targetRecipeId; }
    if (filter?.source) { params.source = filter.source; }
    if (filter?.limit) { params.limit = String(filter.limit); }
    const res = await http.get('/evolution/proposals', { params });
    return res.data?.data ?? [];
  },

  /** 查询指定 Recipe 的 Proposals */
  async getProposalsByRecipe(recipeId: string): Promise<ProposalRecord[]> {
    return this.getProposals({ targetRecipeId: recipeId });
  },

  /** 执行 Proposal */
  async executeProposal(id: string): Promise<unknown> {
    const res = await http.post(`/evolution/proposals/${encodeURIComponent(id)}/execute`);
    return res.data?.data;
  },

  /** 开始观察 Proposal（pending → observing） */
  async observeProposal(id: string): Promise<void> {
    await http.post(`/evolution/proposals/${encodeURIComponent(id)}/observe`);
  },

  /** 拒绝 Proposal */
  async rejectProposal(id: string, reason?: string): Promise<void> {
    await http.post(`/evolution/proposals/${encodeURIComponent(id)}/reject`, { reason });
  },

  /** 查询 Warnings */
  async getWarnings(filter?: {
    status?: string;
    type?: string;
    targetRecipeId?: string;
    limit?: number;
  }): Promise<WarningRecord[]> {
    const params: Record<string, string> = {};
    if (filter?.status) { params.status = filter.status; }
    if (filter?.type) { params.type = filter.type; }
    if (filter?.targetRecipeId) { params.targetRecipeId = filter.targetRecipeId; }
    if (filter?.limit) { params.limit = String(filter.limit); }
    const res = await http.get('/evolution/warnings', { params });
    return res.data?.data ?? [];
  },

  /** 查询指定 Recipe 的 Warnings */
  async getWarningsByRecipe(recipeId: string): Promise<WarningRecord[]> {
    return this.getWarnings({ targetRecipeId: recipeId });
  },

  /** 解决 Warning */
  async resolveWarning(id: string, resolution?: string): Promise<void> {
    await http.post(`/evolution/warnings/${encodeURIComponent(id)}/resolve`, { resolution });
  },

  /** 忽略 Warning */
  async dismissWarning(id: string, reason?: string): Promise<void> {
    await http.post(`/evolution/warnings/${encodeURIComponent(id)}/dismiss`, { reason });
  },
};
