/**
 * Chats API — 1:1 with open-webui src/lib/apis/chats/index.ts
 */

import { apiClient } from './client';
import { getTimeRange } from '../utils/timeRange';

const PREFIX = '/api/v1/chats';

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

export async function createNewChat(
  token: string,
  chat: object,
  folderId: string | null
) {
  return req<unknown>(`${PREFIX}/new`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat, folder_id: folderId }),
  }, token);
}

export async function unarchiveAllChats(token: string) {
  return req<unknown>(`${PREFIX}/unarchive/all`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
  }, token);
}

export async function importChats(token: string, chats: object[]) {
  return req<unknown>(`${PREFIX}/import`, {
    method: 'POST',
    body: JSON.stringify({ chats }),
  }, token);
}

export async function getChatList(
  token: string = '',
  page: number | null = null,
  include_pinned: boolean = false,
  include_folders: boolean = false
) {
  const searchParams = new URLSearchParams();
  if (page !== null) searchParams.append('page', `${page}`);
  if (include_folders) searchParams.append('include_folders', 'true');
  if (include_pinned) searchParams.append('include_pinned', 'true');
  let error: unknown = null;
  const res = await apiClient
    .request<unknown[]>(`${PREFIX}/?${searchParams.toString()}`, {
      method: 'GET',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    }, token || undefined)
    .catch((err) => {
      error = err;
      console.error(err);
      return null;
    });
  if (error) throw error;
  if (!res || !Array.isArray(res)) return [];
  return (res as Record<string, unknown>[]).map((chat) => ({
    ...chat,
    time_range: getTimeRange((chat.updated_at as number) ?? 0),
  }));
}

export async function getChatListByUserId(
  token: string = '',
  userId: string,
  page: number = 1,
  filter?: object
) {
  const searchParams = new URLSearchParams();
  searchParams.append('page', `${page}`);
  if (filter) {
    Object.entries(filter).forEach(([key, value]) => {
      if (value !== undefined && value !== null) searchParams.append(key, String(value));
    });
  }
  const res = await req<unknown[]>(
    `${PREFIX}/list/user/${userId}?${searchParams.toString()}`,
    { method: 'GET' },
    token || undefined
  );
  return Array.isArray(res)
    ? (res as Record<string, unknown>[]).map((chat) => ({
        ...chat,
        time_range: getTimeRange((chat.updated_at as number) ?? 0),
      }))
    : [];
}

export async function getArchivedChatList(
  token: string = '',
  page: number = 1,
  filter?: object
) {
  const searchParams = new URLSearchParams();
  searchParams.append('page', `${page}`);
  if (filter) {
    Object.entries(filter).forEach(([key, value]) => {
      if (value !== undefined && value !== null) searchParams.append(key, String(value));
    });
  }
  const res = await req<unknown[]>(
    `${PREFIX}/archived?${searchParams.toString()}`,
    { method: 'GET' },
    token || undefined
  );
  return Array.isArray(res)
    ? (res as Record<string, unknown>[]).map((chat) => ({
        ...chat,
        time_range: getTimeRange((chat.updated_at as number) ?? 0),
      }))
    : [];
}

export async function getSharedChatList(
  token: string = '',
  page: number = 1,
  filter?: object
) {
  const searchParams = new URLSearchParams();
  searchParams.append('page', `${page}`);
  if (filter) {
    Object.entries(filter).forEach(([key, value]) => {
      if (value !== undefined && value !== null) searchParams.append(key, String(value));
    });
  }
  const res = await req<unknown[]>(
    `${PREFIX}/shared?${searchParams.toString()}`,
    { method: 'GET' },
    token || undefined
  );
  return Array.isArray(res)
    ? (res as Record<string, unknown>[]).map((chat) => ({
        ...chat,
        time_range: getTimeRange((chat.updated_at as number) ?? 0),
      }))
    : [];
}

export async function getAllChats(token: string) {
  return req<unknown[]>(`${PREFIX}/all`, { method: 'GET' }, token);
}

export async function getChatListBySearchText(
  token: string,
  text: string,
  page: number = 1
) {
  const searchParams = new URLSearchParams();
  searchParams.append('text', text);
  searchParams.append('page', `${page}`);
  const res = await req<unknown[]>(
    `${PREFIX}/search?${searchParams.toString()}`,
    { method: 'GET' },
    token
  );
  return Array.isArray(res)
    ? (res as Record<string, unknown>[]).map((chat) => ({
        ...chat,
        time_range: getTimeRange((chat.updated_at as number) ?? 0),
      }))
    : [];
}

export async function getChatsByFolderId(token: string, folderId: string) {
  return req<unknown[]>(`${PREFIX}/folder/${folderId}`, { method: 'GET' }, token);
}

export async function getChatListByFolderId(
  token: string,
  folderId: string,
  page: number = 1
) {
  const searchParams = new URLSearchParams();
  searchParams.append('page', `${page}`);
  const res = await req<unknown[]>(
    `${PREFIX}/folder/${folderId}/list?${searchParams.toString()}`,
    { method: 'GET' },
    token
  );
  return Array.isArray(res)
    ? (res as Record<string, unknown>[]).map((chat) => ({
        ...chat,
        time_range: getTimeRange((chat.updated_at as number) ?? 0),
      }))
    : [];
}

export async function getAllArchivedChats(token: string) {
  return req<unknown[]>(`${PREFIX}/all/archived`, { method: 'GET' }, token);
}

export async function getAllUserChats(token: string) {
  return req<unknown[]>(`${PREFIX}/all/db`, { method: 'GET' }, token);
}

export async function getAllTags(token: string) {
  return req<unknown[]>(`${PREFIX}/all/tags`, { method: 'GET' }, token);
}

export async function getPinnedChatList(token: string = '') {
  const res = await req<unknown[]>(`${PREFIX}/pinned`, { method: 'GET' }, token || undefined);
  return Array.isArray(res)
    ? (res as Record<string, unknown>[]).map((chat) => ({
        ...chat,
        time_range: getTimeRange((chat.updated_at as number) ?? 0),
      }))
    : [];
}

export async function getChatListByTagName(token: string = '', tagName: string) {
  const res = await req<unknown[]>(`${PREFIX}/tags`, {
    method: 'POST',
    body: JSON.stringify({ name: tagName }),
  }, token || undefined);
  return Array.isArray(res)
    ? (res as Record<string, unknown>[]).map((chat) => ({
        ...chat,
        time_range: getTimeRange((chat.updated_at as number) ?? 0),
      }))
    : [];
}

export async function getChatById(token: string, id: string) {
  return req<unknown>(`${PREFIX}/${id}`, { method: 'GET' }, token);
}

export async function getChatByShareId(token: string, share_id: string) {
  return req<unknown>(`${PREFIX}/share/${share_id}`, { method: 'GET' }, token);
}

export async function getChatPinnedStatusById(token: string, id: string) {
  return req<unknown>(`${PREFIX}/${id}/pinned`, { method: 'GET' }, token);
}

export async function toggleChatPinnedStatusById(token: string, id: string) {
  return req<unknown>(`${PREFIX}/${id}/pin`, { method: 'POST' }, token);
}

export async function cloneChatById(token: string, id: string, title?: string) {
  return req<unknown>(`${PREFIX}/${id}/clone`, {
    method: 'POST',
    body: JSON.stringify({ ...(title && { title }) }),
  }, token);
}

export async function cloneSharedChatById(token: string, id: string) {
  return req<unknown>(`${PREFIX}/${id}/clone/shared`, { method: 'POST' }, token);
}

export async function shareChatById(token: string, id: string) {
  return req<unknown>(`${PREFIX}/${id}/share`, { method: 'POST' }, token);
}

export async function updateChatFolderIdById(
  token: string,
  id: string,
  folderId?: string
) {
  return req<unknown>(`${PREFIX}/${id}/folder`, {
    method: 'POST',
    body: JSON.stringify({ folder_id: folderId }),
  }, token);
}

export async function archiveChatById(token: string, id: string) {
  return req<unknown>(`${PREFIX}/${id}/archive`, { method: 'POST' }, token);
}

export async function deleteSharedChatById(token: string, id: string) {
  return req<unknown>(`${PREFIX}/${id}/share`, { method: 'DELETE' }, token);
}

export async function updateChatById(token: string, id: string, chat: object) {
  return req<unknown>(`${PREFIX}/${id}`, {
    method: 'POST',
    body: JSON.stringify({ chat }),
  }, token);
}

export async function deleteChatById(token: string, id: string) {
  return req<unknown>(`${PREFIX}/${id}`, { method: 'DELETE' }, token);
}

export async function getTagsById(token: string, id: string) {
  return req<unknown>(`${PREFIX}/${id}/tags`, { method: 'GET' }, token);
}

export async function addTagById(token: string, id: string, tagName: string) {
  return req<unknown>(`${PREFIX}/${id}/tags`, {
    method: 'POST',
    body: JSON.stringify({ name: tagName }),
  }, token);
}

export async function deleteTagById(token: string, id: string, tagName: string) {
  return req<unknown>(`${PREFIX}/${id}/tags`, {
    method: 'DELETE',
    body: JSON.stringify({ name: tagName }),
  }, token);
}

export async function deleteTagsById(token: string, id: string) {
  return req<unknown>(`${PREFIX}/${id}/tags/all`, { method: 'DELETE' }, token);
}

export async function deleteAllChats(token: string) {
  return req<unknown>(`${PREFIX}/`, { method: 'DELETE' }, token);
}

export async function archiveAllChats(token: string) {
  return req<unknown>(`${PREFIX}/archive/all`, { method: 'POST' }, token);
}

export async function exportChatStats(
  token: string,
  page: number = 1,
  params: object = {}
) {
  const searchParams = new URLSearchParams();
  searchParams.append('page', `${page}`);
  Object.entries(params).forEach(([key, value]) =>
    searchParams.append(key, String(value))
  );
  return req<unknown>(
    `${PREFIX}/stats/export?${searchParams.toString()}`,
    { method: 'GET' },
    token
  );
}

export async function exportSingleChatStats(token: string, chatId: string) {
  return req<unknown>(
    `${PREFIX}/stats/export/${chatId}`,
    { method: 'GET' },
    token
  );
}

export async function downloadChatStats(
  _token: string = '',
  updated_at: number | null = null
): Promise<[Response | null, AbortController]> {
  const controller = new AbortController();
  let error: unknown = null;
  let path = `${PREFIX}/stats/export?stream=true`;
  if (updated_at != null) path += `&updated_at=${updated_at}`;
  const baseUrl = await apiClient.getBaseUrl();
  const authToken = await apiClient.getToken();
  const fullUrl = `${baseUrl}${path}`;
  const res = await fetch(fullUrl, {
    signal: controller.signal,
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    },
  }).catch((err) => {
    console.error(err);
    error = err;
    return null;
  });
  if (error) throw error;
  return [res, controller];
}
