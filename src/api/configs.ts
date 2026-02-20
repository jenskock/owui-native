/**
 * Configs API — 1:1 with open-webui src/lib/apis/configs/index.ts
 */

import { apiClient } from './client';

const PREFIX = '/api/v1/configs';

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

export async function getConnectionsConfig(token: string) {
  return req<unknown>(`${PREFIX}/connections`, { method: 'GET' }, token);
}

export async function setConnectionsConfig(token: string, config: object) {
  return req<unknown>(`${PREFIX}/connections`, {
    method: 'POST',
    body: JSON.stringify(config),
  }, token);
}

export async function getBanners(token: string) {
  return req<unknown>(`${PREFIX}/banners`, { method: 'GET' }, token);
}

export async function getToolServerConnections(token: string) {
  return req<unknown>(`${PREFIX}/tool_servers`, { method: 'GET' }, token);
}

export async function setToolServerConnections(token: string, connections: object) {
  return req<unknown>(`${PREFIX}/tool_servers`, {
    method: 'POST',
    body: JSON.stringify(connections),
  }, token);
}

export async function verifyToolServerConnection(token: string, connection: object) {
  return req<unknown>(`${PREFIX}/tool_servers/verify`, {
    method: 'POST',
    body: JSON.stringify(connection),
  }, token);
}

export async function getOAuthClientAuthorizationUrl(
  clientId: string,
  type: string | null = null
): Promise<string> {
  const baseUrl = await apiClient.getBaseUrl();
  const oauthClientId = type ? `${type}:${clientId}` : clientId;
  return `${baseUrl}/oauth/clients/${oauthClientId}/authorize`;
}

export async function getCodeExecutionConfig(token: string) {
  return req<unknown>(`${PREFIX}/code_execution`, { method: 'GET' }, token);
}

export async function importConfig(token: string, config: object) {
  return req<unknown>(`${PREFIX}/import`, {
    method: 'POST',
    body: JSON.stringify({ config }),
  }, token);
}

export async function exportConfig(token: string) {
  return req<unknown>(`${PREFIX}/export`, { method: 'GET' }, token);
}
