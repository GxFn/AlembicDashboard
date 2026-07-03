/**
 * projectScope — /project-scope 路由族：空间配置读写与归一化（W7-f 自 api.ts 拆出）。
 */

import {
  asRuntimeRecord,
  booleanOrNull,
  fallbackDisplayName,
  firstNumber,
  firstString,
  http,
  providerDataRecord,
  recordArray,
  stringRecord,
} from './client';
import type {
  ProjectScopeAddFolderInput,
  ProjectScopeFolderSummary,
  ProjectScopeFoldersResponse,
  ProjectScopeResolution,
  ProjectScopeResponse,
  ProjectScopeSummary,
  RuntimeProjectScopeCapability,
} from '../types';


function normalizeProjectScopePathKey(value: string | null | undefined): string {
  return (value ?? '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

function normalizeProjectScopeStorageKind(value: string | null): string {
  if (value === 'ghost-only' || value === 'ghost-registry') {
    return 'ghost';
  }
  return value ?? 'ghost';
}

function normalizeProjectScopeCapability(value: unknown): RuntimeProjectScopeCapability | null {
  const record = asRuntimeRecord(value);
  if (!record) {
    return null;
  }
  return {
    available: booleanOrNull(record.available),
    endpoints: stringRecord(record.endpoints),
    owner: firstString(record.owner),
    source: firstString(record.source),
  };
}

function normalizeProjectScopeFolder(value: unknown): ProjectScopeFolderSummary | null {
  const record = asRuntimeRecord(value);
  if (!record) {
    return null;
  }

  const path = firstString(record.path, record.folderPath, record.realpath, record.id, record.folderId);
  if (!path) {
    return null;
  }

  return {
    displayName: firstString(record.displayName, record.name, record.label) ?? fallbackDisplayName(path),
    folderId: firstString(record.folderId, record.id, path) ?? path,
    path,
    realpath: firstString(record.realpath),
    repositoryId: firstString(record.repositoryId),
    role: firstString(record.role) ?? 'source',
    state: firstString(record.state) ?? 'active',
  };
}

function normalizeProjectScopeFolders(value: unknown, controlRoot?: string | null): ProjectScopeFolderSummary[] {
  const controlRootKey = normalizeProjectScopePathKey(controlRoot);
  return recordArray(value)
    .map(normalizeProjectScopeFolder)
    .filter((folder): folder is ProjectScopeFolderSummary => folder !== null)
    .filter((folder) => normalizeProjectScopePathKey(folder.path) !== controlRootKey);
}

export function normalizeProjectScopeSummary(value: unknown): ProjectScopeSummary | null {
  const record = asRuntimeRecord(value);
  if (!record) {
    return null;
  }

  const controlRootRecord = asRuntimeRecord(record.controlRoot);
  const storageRecord = asRuntimeRecord(record.storage);
  const metadataRecord = asRuntimeRecord(record.metadata);
  const controlRoot = firstString(record.controlRoot, controlRootRecord?.path, record.projectRoot) ?? '';
  const folders = normalizeProjectScopeFolders(record.folders, controlRoot);
  const currentFolderRecord = asRuntimeRecord(record.currentFolder);
  const currentFolderPath = firstString(record.currentFolderPath, currentFolderRecord?.path);
  const contractVersion = firstString(record.contractVersion) ?? firstNumber(record.contractVersion)?.toString();

  return {
    contractVersion,
    controlRoot,
    controlRootIncludedInFolders: record.controlRootIncludedInFolders === true,
    currentFolderId: firstString(record.currentFolderId, currentFolderRecord?.id, currentFolderRecord?.folderId),
    currentFolderPath,
    dataRoot: firstString(record.dataRoot, record.registryPath) ?? '',
    dataRootSource: firstString(record.dataRootSource, metadataRecord?.dataRootSource) ?? 'ghost-registry',
    displayName: firstString(record.displayName, record.name) ?? fallbackDisplayName(controlRoot),
    folderCount: firstNumber(record.folderCount) ?? folders.length,
    folders,
    projectId: firstString(record.projectId),
    projectRootWriteAllowed: record.projectRootWriteAllowed === true,
    projectScopeId: firstString(record.projectScopeId, record.scopeId),
    standardWriteAllowed: record.standardWriteAllowed === true,
    storageKind: normalizeProjectScopeStorageKind(firstString(record.storageKind, storageRecord?.kind, metadataRecord?.storageKind, metadataRecord?.storagePolicy)),
  };
}

function normalizeProjectScopeResolution(value: unknown): ProjectScopeResolution | null {
  const record = asRuntimeRecord(value);
  if (!record) {
    return null;
  }
  const controlRootRecord = asRuntimeRecord(record.controlRoot);
  const controlRoot = firstString(record.controlRoot, controlRootRecord?.path);
  const currentFolder = normalizeProjectScopeFolder(record.currentFolder);
  return {
    controlRoot,
    currentFolder,
    currentFolderId: firstString(record.currentFolderId, currentFolder?.folderId),
    currentFolderPath: firstString(record.currentFolderPath, currentFolder?.path),
  };
}

export function normalizeProjectScopeResponse(value: unknown): ProjectScopeResponse {
  const record = providerDataRecord(value);
  const directSummary = record.projectScope || record.summary ? null : normalizeProjectScopeSummary(record);
  const projectScope = normalizeProjectScopeSummary(record.projectScope) ?? directSummary;
  const summary = normalizeProjectScopeSummary(record.summary) ?? projectScope ?? directSummary;
  return {
    capability: normalizeProjectScopeCapability(record.capability),
    projectScope,
    registryPath: firstString(record.registryPath),
    resolution: normalizeProjectScopeResolution(record.resolution),
    summary,
  };
}

export function normalizeProjectScopeFoldersResponse(value: unknown): ProjectScopeFoldersResponse {
  const record = providerDataRecord(value);
  const directSummary = record.projectScope || record.summary ? null : normalizeProjectScopeSummary(record);
  const projectScope = normalizeProjectScopeSummary(record.projectScope) ?? directSummary;
  const summary = normalizeProjectScopeSummary(record.summary) ?? projectScope ?? directSummary;
  const controlRoot = summary?.controlRoot ?? projectScope?.controlRoot ?? null;
  return {
    capability: normalizeProjectScopeCapability(record.capability),
    folders: normalizeProjectScopeFolders(record.folders, controlRoot),
    projectScopeId: firstString(record.projectScopeId, summary?.projectScopeId, projectScope?.projectScopeId),
    registryPath: firstString(record.registryPath),
  };
}

export const projectScopeApi = {
  // ── ProjectScope configuration (Alembic-owned HTTP contract) ──────

  async getProjectScope(params?: {
    controlRoot?: string;
    folderPath?: string;
    projectScopeId?: string;
  }): Promise<ProjectScopeResponse> {
    const res = await http.get('/project-scope', { params });
    return normalizeProjectScopeResponse(res.data?.data);
  },

  async listProjectScopeFolders(params?: {
    controlRoot?: string;
    folderPath?: string;
    projectScopeId?: string;
  }): Promise<ProjectScopeFoldersResponse> {
    const res = await http.get('/project-scope/folders', { params });
    return normalizeProjectScopeFoldersResponse(res.data?.data);
  },

  async addProjectScopeFolder(input: ProjectScopeAddFolderInput): Promise<ProjectScopeResponse> {
    const res = await http.post('/project-scope/folders', input);
    return normalizeProjectScopeResponse(res.data?.data);
  },

  async resolveProjectScopeFolder(
    folderPath: string,
    method: 'get' | 'post' = 'post',
  ): Promise<ProjectScopeResponse> {
    const res = method === 'get'
      ? await http.get('/project-scope/resolve-folder', { params: { folderPath } })
      : await http.post('/project-scope/resolve-folder', { folderPath });
    return normalizeProjectScopeResponse(res.data?.data);
  },
};
