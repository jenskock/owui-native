/**
 * Models API — 1:1 with open-webui src/lib/apis/models/index.ts
 */

import { apiClient } from './client';

const PREFIX = '/api/v1/models';

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

export async function getModelItems(
  token: string = '',
  query?: string,
  viewOption?: string,
  selectedTag?: string,
  orderBy?: string,
  direction?: string,
  page?: number
) {
  const searchParams = new URLSearchParams();
  if (query) searchParams.append('query', query);
  if (viewOption) searchParams.append('view_option', viewOption);
  if (selectedTag) searchParams.append('tag', selectedTag);
  if (orderBy) searchParams.append('order_by', orderBy);
  if (direction) searchParams.append('direction', direction);
  if (page != null) searchParams.append('page', String(page));
  return req<unknown>(`${PREFIX}/list?${searchParams.toString()}`, { method: 'GET' }, token || undefined);
}

export async function getModelTags(token: string = '') {
  return req<unknown>(`${PREFIX}/tags`, { method: 'GET' }, token || undefined);
}

export async function importModels(token: string, models: object[]) {
  return req<unknown>(`${PREFIX}/import`, {
    method: 'POST',
    body: JSON.stringify({ models }),
  }, token);
}

export async function getBaseModels(token: string = '') {
  return req<unknown>(`${PREFIX}/base`, { method: 'GET' }, token || undefined);
}

export async function createNewModel(token: string, model: object) {
  return req<unknown>(`${PREFIX}/create`, {
    method: 'POST',
    body: JSON.stringify(model),
  }, token);
}

export async function getModelById(token: string, id: string) {
  const searchParams = new URLSearchParams();
  searchParams.append('id', id);
  return req<unknown>(`${PREFIX}/model?${searchParams.toString()}`, { method: 'GET' }, token);
}

export async function toggleModelById(token: string, id: string) {
  const searchParams = new URLSearchParams();
  searchParams.append('id', id);
  return req<unknown>(`${PREFIX}/model/toggle?${searchParams.toString()}`, { method: 'POST' }, token);
}

export async function updateModelById(token: string, model: object) {
  return req<unknown>(`${PREFIX}/model/update`, {
    method: 'POST',
    body: JSON.stringify(model),
  }, token);
}

export async function updateModelAccessGrants(token: string, id: string, accessGrants: object) {
  return req<unknown>(`${PREFIX}/model/access/update`, {
    method: 'POST',
    body: JSON.stringify({ id, access_grants: accessGrants }),
  }, token);
}

export async function deleteModelById(token: string, id: string) {
  return req<unknown>(`${PREFIX}/model/delete`, {
    method: 'POST',
    body: JSON.stringify({ id }),
  }, token);
}

export async function deleteAllModels(token: string) {
  return req<unknown>(`${PREFIX}/delete/all`, { method: 'POST' }, token);
}
