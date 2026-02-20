/**
 * Auth API — 1:1 with open-webui src/lib/apis/auths/index.ts
 */

import { apiClient } from './client';

const PREFIX = '/api/v1/auths';

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

export async function getAdminDetails(token: string) {
  return req<unknown>(`${PREFIX}/admin/details`, { method: 'GET' }, token);
}

export async function getAdminConfig(token: string) {
  return req<unknown>(`${PREFIX}/admin/config`, { method: 'GET' }, token);
}

export async function updateAdminConfig(token: string, body: object) {
  return req<unknown>(`${PREFIX}/admin/config`, {
    method: 'POST',
    body: JSON.stringify(body),
  }, token);
}

export async function getSessionUser(token: string) {
  return req<unknown>(`${PREFIX}/`, {
    method: 'GET',
  }, token);
}

export async function ldapUserSignIn(user: string, password: string) {
  return req<unknown>(`${PREFIX}/ldap`, {
    method: 'POST',
    body: JSON.stringify({ user, password }),
  }, null);
}

export async function getLdapConfig(token: string = '') {
  return req<unknown>(`${PREFIX}/admin/config/ldap`, { method: 'GET' }, token || undefined);
}

export async function updateLdapConfig(token: string, enable_ldap: boolean) {
  return req<unknown>(`${PREFIX}/admin/config/ldap`, {
    method: 'POST',
    body: JSON.stringify({ enable_ldap }),
  }, token);
}

export async function getLdapServer(token: string = '') {
  return req<unknown>(`${PREFIX}/admin/config/ldap/server`, { method: 'GET' }, token || undefined);
}

export async function updateLdapServer(token: string, body: object) {
  return req<unknown>(`${PREFIX}/admin/config/ldap/server`, {
    method: 'POST',
    body: JSON.stringify(body),
  }, token);
}

export async function userSignIn(email: string, password: string) {
  return req<{ token?: string; [key: string]: unknown }>(`${PREFIX}/signin`, {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  }, null);
}

export async function userSignUp(
  name: string,
  email: string,
  password: string,
  profile_image_url: string
) {
  return req<unknown>(`${PREFIX}/signup`, {
    method: 'POST',
    body: JSON.stringify({ name, email, password, profile_image_url }),
  }, null);
}

export async function userSignOut() {
  return req<unknown>(`${PREFIX}/signout`, { method: 'GET' }, null);
}

export async function addUser(
  token: string,
  name: string,
  email: string,
  password: string,
  role: string = 'pending',
  profile_image_url: null | string = null
) {
  return req<unknown>(`${PREFIX}/add`, {
    method: 'POST',
    body: JSON.stringify({
      name,
      email,
      password,
      role,
      ...(profile_image_url && { profile_image_url }),
    }),
  }, token);
}

export async function updateUserProfile(token: string, profile: object) {
  return req<unknown>(`${PREFIX}/update/profile`, {
    method: 'POST',
    body: JSON.stringify(profile),
  }, token);
}

export async function updateUserTimezone(token: string, timezone: string) {
  await apiClient
    .request<unknown>(`${PREFIX}/update/timezone`, {
      method: 'POST',
      body: JSON.stringify({ timezone }),
    }, token)
    .catch((err) => console.error('Failed to update timezone:', err));
}

export async function updateUserPassword(
  token: string,
  password: string,
  newPassword: string
) {
  return req<unknown>(`${PREFIX}/update/password`, {
    method: 'POST',
    body: JSON.stringify({ password, new_password: newPassword }),
  }, token);
}

export async function getSignUpEnabledStatus(token: string) {
  return req<unknown>(`${PREFIX}/signup/enabled`, { method: 'GET' }, token);
}

export async function getDefaultUserRole(token: string) {
  return req<unknown>(`${PREFIX}/signup/user/role`, { method: 'GET' }, token);
}

export async function updateDefaultUserRole(token: string, role: string) {
  return req<unknown>(`${PREFIX}/signup/user/role`, {
    method: 'POST',
    body: JSON.stringify({ role }),
  }, token);
}

export async function toggleSignUpEnabledStatus(token: string) {
  return req<unknown>(`${PREFIX}/signup/enabled/toggle`, { method: 'GET' }, token);
}

export async function getJWTExpiresDuration(token: string) {
  return req<unknown>(`${PREFIX}/token/expires`, { method: 'GET' }, token);
}

export async function updateJWTExpiresDuration(token: string, duration: string) {
  return req<unknown>(`${PREFIX}/token/expires/update`, {
    method: 'POST',
    body: JSON.stringify({ duration }),
  }, token);
}

export async function createAPIKey(token: string) {
  const res = await req<{ api_key?: string }>(`${PREFIX}/api_key`, {
    method: 'POST',
  }, token);
  return (res as { api_key?: string })?.api_key;
}

export async function getAPIKey(token: string) {
  const res = await req<{ api_key?: string }>(`${PREFIX}/api_key`, {
    method: 'GET',
  }, token);
  return (res as { api_key?: string })?.api_key;
}

export async function deleteAPIKey(token: string) {
  return req<unknown>(`${PREFIX}/api_key`, { method: 'DELETE' }, token);
}
