/**
 * OpenAI API — 1:1 with open-webui src/lib/apis/openai/index.ts
 */

import { apiClient } from './client';

const OPENAI_PREFIX = '/openai';
const API_PREFIX = '/api';

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

export async function getOpenAIConfig(token: string = '') {
  return req<unknown>(`${OPENAI_PREFIX}/config`, { method: 'GET' }, token || undefined);
}

type OpenAIConfig = {
  ENABLE_OPENAI_API?: boolean;
  OPENAI_API_BASE_URLS?: string[];
  OPENAI_API_KEYS?: string[];
  OPENAI_API_CONFIGS?: object;
};

export async function updateOpenAIConfig(
  token: string = '',
  config: OpenAIConfig
) {
  return req<unknown>(`${OPENAI_PREFIX}/config/update`, {
    method: 'POST',
    body: JSON.stringify(config),
  }, token || undefined);
}

export async function getOpenAIUrls(token: string = '') {
  const res = await req<{ OPENAI_API_BASE_URLS?: string[] }>(
    `${OPENAI_PREFIX}/urls`,
    { method: 'GET' },
    token || undefined
  );
  return (res as { OPENAI_API_BASE_URLS?: string[] })?.OPENAI_API_BASE_URLS ?? [];
}

export async function updateOpenAIUrls(token: string, urls: string[]) {
  const res = await req<{ OPENAI_API_BASE_URLS?: string[] }>(
    `${OPENAI_PREFIX}/urls/update`,
    { method: 'POST', body: JSON.stringify({ urls }) },
    token
  );
  return (res as { OPENAI_API_BASE_URLS?: string[] })?.OPENAI_API_BASE_URLS;
}

export async function getOpenAIKeys(token: string = '') {
  const res = await req<{ OPENAI_API_KEYS?: string[] }>(
    `${OPENAI_PREFIX}/keys`,
    { method: 'GET' },
    token || undefined
  );
  return (res as { OPENAI_API_KEYS?: string[] })?.OPENAI_API_KEYS ?? [];
}

export async function updateOpenAIKeys(token: string, keys: string[]) {
  const res = await req<{ OPENAI_API_KEYS?: string[] }>(
    `${OPENAI_PREFIX}/keys/update`,
    { method: 'POST', body: JSON.stringify({ keys }) },
    token
  );
  return (res as { OPENAI_API_KEYS?: string[] })?.OPENAI_API_KEYS;
}

/** Fetch models from an external OpenAI-compatible URL (e.g. connection URL). */
export async function getOpenAIModelsDirect(
  url: string,
  key: string
): Promise<{ object?: string; data?: unknown[]; [key: string]: unknown }> {
  let error: unknown = null;
  const res = await fetch(`${url.replace(/\/$/, '')}/models`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(key && { Authorization: `Bearer ${key}` }),
    },
  })
    .then(async (response) => {
      if (!response.ok) throw await response.json();
      return response.json();
    })
    .catch((err) => {
      error = err?.error?.message ?? 'Network Problem';
      return [];
    });
  if (error) throw error;
  return res as { object?: string; data?: unknown[]; [key: string]: unknown };
}

export async function getOpenAIModels(token: string, urlIdx?: number) {
  const path =
    `${OPENAI_PREFIX}/models` +
    (typeof urlIdx === 'number' ? `/${urlIdx}` : '');
  return req<unknown>(path, { method: 'GET' }, token);
}

export async function verifyOpenAIConnection(
  token: string = '',
  connection: { url?: string; key?: string; config?: object },
  direct: boolean = false
) {
  const { url, key } = connection;
  if (!url) throw new Error('OpenAI: URL is required');
  if (direct) {
    return getOpenAIModelsDirect(url, key ?? '');
  }
  return req<unknown>(`${OPENAI_PREFIX}/verify`, {
    method: 'POST',
    body: JSON.stringify({ url, key, config: connection.config }),
  }, token || undefined);
}

/** Returns [Response, AbortController] for streaming. */
export async function chatCompletion(
  token: string = '',
  body: object,
  baseUrl?: string
): Promise<[Response | null, AbortController]> {
  const controller = new AbortController();
  let error: unknown = null;
  const url = baseUrl
    ? `${baseUrl.replace(/\/$/, '')}${API_PREFIX}/chat/completions`
    : '';
  if (!url) {
    const b = await apiClient.getBaseUrl();
    const fullUrl = `${b}${API_PREFIX}/chat/completions`;
    const authToken = await apiClient.getToken();
    const res = await fetch(fullUrl, {
      signal: controller.signal,
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token || authToken || ''}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }).catch((err) => {
      console.error(err);
      error = err;
      return null;
    });
    if (error) throw error;
    return [res, controller];
  }
  const res = await fetch(url, {
    signal: controller.signal,
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  }).catch((err) => {
    console.error(err);
    error = err;
    return null;
  });
  if (error) throw error;
  return [res, controller];
}

export async function generateOpenAIChatCompletion(
  token: string = '',
  body: object,
  baseUrl?: string
) {
  const b = baseUrl
    ? baseUrl.replace(/\/$/, '')
    : await apiClient.getBaseUrl();
  const fullUrl = `${b}${API_PREFIX}/chat/completions`;
  let error: unknown = null;
  const authToken = token || (await apiClient.getToken());
  const res = await fetch(fullUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${authToken || ''}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
    .then(async (response) => {
      if (!response.ok) throw await response.json();
      return response.json();
    })
    .catch((err) => {
      error = (err as { detail?: unknown })?.detail ?? err;
      return null;
    });
  if (error) throw error;
  return res;
}

export async function synthesizeOpenAISpeech(
  token: string = '',
  speaker: string = 'alloy',
  text: string = '',
  model: string = 'tts-1'
): Promise<Response> {
  const baseUrl = await apiClient.getBaseUrl();
  const authToken = token || (await apiClient.getToken());
  let error: unknown = null;
  const res = await fetch(`${baseUrl}${OPENAI_PREFIX}/audio/speech`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${authToken || ''}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      input: text,
      voice: speaker,
    }),
  }).catch((err) => {
    console.error(err);
    error = err;
    return null;
  });
  if (error) throw error;
  return res as Response;
}
