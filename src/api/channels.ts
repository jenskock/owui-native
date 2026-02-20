/**
 * Channels API — 1:1 with open-webui src/lib/apis/channels/index.ts
 */

import { apiClient } from './client';

const PREFIX = '/api/v1/channels';

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

type ChannelForm = {
  type?: string;
  name: string;
  is_private?: boolean | null;
  data?: object;
  meta?: object;
  access_grants?: object[];
  group_ids?: string[];
  user_ids?: string[];
};

export async function createNewChannel(token: string = '', channel: ChannelForm) {
  return req<unknown>(`${PREFIX}/create`, {
    method: 'POST',
    body: JSON.stringify(channel),
  }, token || undefined);
}

export async function getChannels(token: string = '') {
  return req<unknown>(`${PREFIX}/`, { method: 'GET' }, token || undefined);
}

export async function getChannelById(token: string = '', channel_id: string) {
  return req<unknown>(`${PREFIX}/${channel_id}`, { method: 'GET' }, token || undefined);
}

export async function getDMChannelByUserId(token: string = '', user_id: string) {
  return req<unknown>(`${PREFIX}/users/${user_id}`, { method: 'GET' }, token || undefined);
}

export async function updateChannelById(
  token: string,
  channel_id: string,
  channel: Partial<ChannelForm>
) {
  return req<unknown>(`${PREFIX}/${channel_id}`, {
    method: 'POST',
    body: JSON.stringify(channel),
  }, token);
}

export async function deleteChannelById(token: string, channel_id: string) {
  return req<unknown>(`${PREFIX}/${channel_id}`, { method: 'DELETE' }, token);
}

export async function updateChannelMemberActiveStatusById(
  token: string,
  channel_id: string,
  user_id: string
) {
  return req<unknown>(`${PREFIX}/${channel_id}/members/${user_id}/active`, {
    method: 'POST',
  }, token);
}
