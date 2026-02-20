/**
 * Folders API — 1:1 with open-webui src/lib/apis/folders/index.ts
 */

import { apiClient } from './client';

const PREFIX = '/api/v1/folders';

async function req<T>(
  path: string,
  options: RequestInit,
  token?: string | null
): Promise<T> {
  let error: unknown = null;
  const res = await apiClient
    .request<T>(path, options, token ?? undefined)
    .catch((err) => {
      error = (err as { detail?: unknown })?.detail ?? err;
      console.error(err);
      return null;
    });
  if (error) throw error;
  return res as T;
}

type FolderForm = {
  name?: string;
  data?: Record<string, unknown>;
  meta?: Record<string, unknown>;
};

export async function createNewFolder(token: string, folderForm: FolderForm) {
  return req<unknown>(`${PREFIX}/`, {
    method: 'POST',
    body: JSON.stringify(folderForm),
  }, token);
}

export async function getFolders(token: string = '') {
  return req<unknown>(`${PREFIX}/`, { method: 'GET' }, token || undefined);
}

export async function getFolderById(token: string, id: string) {
  return req<unknown>(`${PREFIX}/${id}`, { method: 'GET' }, token);
}

export async function updateFolderById(token: string, id: string, folderForm: FolderForm) {
  return req<unknown>(`${PREFIX}/${id}/update`, {
    method: 'POST',
    body: JSON.stringify(folderForm),
  }, token);
}

export async function updateFolderIsExpandedById(
  token: string,
  id: string,
  isExpanded: boolean
) {
  return req<unknown>(`${PREFIX}/${id}/update/expanded`, {
    method: 'POST',
    body: JSON.stringify({ is_expanded: isExpanded }),
  }, token);
}

export async function updateFolderParentIdById(
  token: string,
  id: string,
  parentId?: string
) {
  return req<unknown>(`${PREFIX}/${id}/update/parent`, {
    method: 'POST',
    body: JSON.stringify({ parent_id: parentId }),
  }, token);
}

export async function updateFolderItemsById(
  token: string,
  id: string,
  items: { chat_ids: string[]; file_ids: string[] }
) {
  return req<unknown>(`${PREFIX}/${id}/update/items`, {
    method: 'POST',
    body: JSON.stringify({ items }),
  }, token);
}

export async function deleteFolderById(
  token: string,
  id: string,
  deleteContents: boolean
) {
  const searchParams = new URLSearchParams();
  searchParams.append('delete_contents', deleteContents ? 'true' : 'false');
  return req<unknown>(`${PREFIX}/${id}?${searchParams.toString()}`, {
    method: 'DELETE',
  }, token);
}
