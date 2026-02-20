/**
 * Users API — 1:1 with open-webui src/lib/apis/users/index.ts
 */

import { apiClient } from './client';

const PREFIX = '/api/v1/users';

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

export async function getUserSettings(token: string) {
  return req<unknown>(`${PREFIX}/user/settings`, { method: 'GET' }, token);
}

export async function updateUserSettings(token: string, settings: object) {
  return req<unknown>(`${PREFIX}/user/settings/update`, {
    method: 'POST',
    body: JSON.stringify(settings),
  }, token);
}

export async function getUserInfoById(token: string, userId: string) {
  return req<unknown>(`${PREFIX}/${userId}/info`, { method: 'GET' }, token);
}

export async function updateUserStatus(token: string, formData: object) {
  return req<unknown>(`${PREFIX}/user/status/update`, {
    method: 'POST',
    body: JSON.stringify(formData),
  }, token);
}

export async function getUserInfo(token: string) {
  return req<unknown>(`${PREFIX}/user/info`, { method: 'GET' }, token);
}

export async function updateUserInfo(token: string, info: object) {
  return req<unknown>(`${PREFIX}/user/info/update`, {
    method: 'POST',
    body: JSON.stringify(info),
  }, token);
}

/** Stub: browser getUserPosition not available in RN; override or use geolocation lib. */
export async function getAndUpdateUserLocation(token: string) {
  return updateUserInfo(token, {}).then(() => null);
}

export async function getUserActiveStatusById(token: string, userId: string) {
  return req<unknown>(`${PREFIX}/${userId}/active`, { method: 'GET' }, token);
}

export async function getUsers(
  token: string,
  query?: string,
  orderBy?: string,
  direction?: string,
  page = 1
) {
  const searchParams = new URLSearchParams();
  searchParams.set('page', `${page}`);
  if (query) searchParams.set('query', query);
  if (orderBy) searchParams.set('order_by', orderBy);
  if (direction) searchParams.set('direction', direction);
  return req<unknown>(`${PREFIX}/?${searchParams.toString()}`, { method: 'GET' }, token);
}

export async function searchUsers(
  token: string,
  query?: string,
  orderBy?: string,
  direction?: string,
  page = 1
) {
  const searchParams = new URLSearchParams();
  searchParams.set('page', `${page}`);
  if (query) searchParams.set('query', query);
  if (orderBy) searchParams.set('order_by', orderBy);
  if (direction) searchParams.set('direction', direction);
  return req<unknown>(`${PREFIX}/search?${searchParams.toString()}`, { method: 'GET' }, token);
}

export async function getAllUsers(token: string) {
  return req<unknown>(`${PREFIX}/all`, { method: 'GET' }, token);
}

export async function deleteUserById(token: string, userId: string) {
  return req<unknown>(`${PREFIX}/${userId}`, { method: 'DELETE' }, token);
}

export async function updateUserById(
  token: string,
  userId: string,
  user: {
    role?: string;
    profile_image_url?: string;
    email?: string;
    name?: string;
    password?: string;
  }
) {
  return req<unknown>(`${PREFIX}/${userId}/update`, {
    method: 'POST',
    body: JSON.stringify({
      ...user,
      ...(user.password !== '' && user.password != null ? { password: user.password } : {}),
    }),
  }, token);
}

export async function getUserGroupsById(token: string, userId: string) {
  return req<unknown>(`${PREFIX}/${userId}/groups`, { method: 'GET' }, token);
}

export async function getUserGroups(token: string) {
  return req<unknown>(`${PREFIX}/groups`, { method: 'GET' }, token);
}

export async function getUserDefaultPermissions(token: string) {
  return req<unknown>(`${PREFIX}/default/permissions`, { method: 'GET' }, token);
}

export async function updateUserDefaultPermissions(token: string, permissions: object) {
  return req<unknown>(`${PREFIX}/default/permissions`, {
    method: 'POST',
    body: JSON.stringify(permissions),
  }, token);
}

export async function updateUserRole(token: string, id: string, role: string) {
  return req<unknown>(`${PREFIX}/update/role`, {
    method: 'POST',
    body: JSON.stringify({ id, role }),
  }, token);
}
