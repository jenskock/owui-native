/**
 * Main API — 1:1 with open-webui src/lib/apis/index.ts
 */

import { apiClient } from './client';
import { getOpenAIModelsDirect } from './openai';

const API = '/api';

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

export async function getModels(
  token: string = '',
  connections: object | null = null,
  base: boolean = false,
  refresh: boolean = false
) {
  const searchParams = new URLSearchParams();
  if (refresh) searchParams.append('refresh', 'true');
  let error: unknown = null;
  const res = await apiClient
    .request<{ data?: unknown[] }>(
      `${API}/models${base ? '/base' : ''}?${searchParams.toString()}`,
      {
        method: 'GET',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      },
      token || undefined
    )
    .catch((e) => {
      error = e;
      console.error(e);
      return null;
    });
  if (error) throw error;
  let models: unknown[] = (res as { data?: unknown[] })?.data ?? [];
  if (connections && !base && connections !== null) {
    const c = connections as {
      OPENAI_API_BASE_URLS?: string[];
      OPENAI_API_KEYS?: string[];
      OPENAI_API_CONFIGS?: Record<string, { enable?: boolean; model_ids?: string[]; prefix_id?: string; tags?: string[] }>;
    };
    const urls = c.OPENAI_API_BASE_URLS ?? [];
    const keys = c.OPENAI_API_KEYS ?? [];
    const configs = c.OPENAI_API_CONFIGS ?? {};
    let localModels: unknown[] = [];
    const requests: Promise<{ object?: string; data?: unknown[]; urlIdx?: string }>[] = [];
    for (const idx in urls) {
      const url = urls[idx];
      const apiConfig = configs[idx];
      if (!apiConfig) continue;
      const enable = apiConfig.enable ?? true;
      const modelIds = apiConfig.model_ids ?? [];
      if (!enable) {
        requests.push(
          Promise.resolve({ object: 'list', data: [], urlIdx: idx })
        );
        continue;
      }
      if (modelIds.length > 0) {
        requests.push(
          Promise.resolve({
            object: 'list',
            data: modelIds.map((id: string) => ({
              id,
              name: id,
              owned_by: 'openai',
              openai: { id },
              urlIdx: idx,
            })),
          })
        );
      } else {
        requests.push(
          getOpenAIModelsDirect(url, keys[idx] ?? '').then((r) => ({
            object: 'list',
            data: Array.isArray(r?.data) ? r.data : [],
            urlIdx: idx,
          })).catch(() => ({ object: 'list', data: [], urlIdx: idx }))
        );
      }
    }
    const responses = await Promise.all(requests);
    const modelsMap: Record<string, unknown> = {};
    for (const m of models) {
      const id = (m as { id?: string })?.id;
      if (id != null) modelsMap[id] = m;
    }
    for (const response of responses) {
      const idx = response.urlIdx ?? '';
      const apiConfig = configs[idx];
      let list = Array.isArray(response) ? response : (response?.data ?? []);
      list = list.map((model: unknown) => ({
        ...(model as object),
        openai: { id: (model as { id?: string })?.id },
        urlIdx: idx,
      }));
      const prefixId = apiConfig?.prefix_id;
      if (prefixId) {
        list = list.map((model: unknown) => ({
          ...(model as object),
          id: `${prefixId}.${(model as { id?: string })?.id ?? ''}`,
        }));
      }
      const tags = apiConfig?.tags;
      if (tags) {
        list = list.map((model: unknown) => ({
          ...(model as object),
          tags,
        }));
      }
      localModels = localModels.concat(list);
    }
    models = models.concat(
      localModels.map((model: unknown) => ({
        ...(model as object),
        name: (model as { name?: string; id?: string })?.name ?? (model as { id?: string })?.id,
        direct: true,
      }))
    );
    const dedup: Record<string, unknown> = {};
    for (const model of models) {
      const id = (model as { id?: string })?.id;
      if (id != null) dedup[id] = model;
    }
    models = Object.values(dedup);
  }
  return models;
}

type ChatCompletedForm = {
  model: string;
  messages: string[];
  chat_id: string;
  session_id: string;
};

export async function chatCompleted(token: string, body: ChatCompletedForm) {
  return req<unknown>(`${API}/chat/completed`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }, token);
}

type ChatActionForm = { model: string; messages: string[]; chat_id: string };

export async function chatAction(
  token: string,
  action_id: string,
  body: ChatActionForm
) {
  return req<unknown>(`${API}/chat/actions/${action_id}`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }, token);
}

export async function stopTask(token: string, id: string) {
  return req<unknown>(`${API}/tasks/stop/${id}`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
  }, token);
}

export async function getTaskIdsByChatId(token: string, chat_id: string) {
  return req<unknown>(`${API}/tasks/chat/${chat_id}`, {
    method: 'GET',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
  }, token);
}

export async function getToolServerData(token: string, url: string) {
  let error: unknown = null;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
    },
  })
    .then(async (response) => {
      if (url.toLowerCase().endsWith('.yaml') || url.toLowerCase().endsWith('.yml')) {
        if (!response.ok) throw await response.text();
        return response.text().then((text) => {
          try {
            return JSON.parse(text) as unknown;
          } catch {
            return text as unknown;
          }
        });
      }
      if (!response.ok) throw await response.json();
      return response.json();
    })
    .catch((err) => {
      console.error(err);
      error = (err as { detail?: unknown })?.detail ?? err;
      return null;
    });
  if (error) throw error;
  return res;
}

/** convertOpenApiToToolPayload stub — full impl would require OpenAPI parsing. */
function convertOpenApiToToolPayload(openapi: unknown): unknown[] {
  if (openapi && typeof openapi === 'object' && 'paths' in openapi) {
    return [];
  }
  return [];
}

export async function getToolServersData(servers: { config?: { enable?: boolean }; auth_type?: string; key?: string; path?: string; url?: string; spec_type?: string; spec?: string }[]) {
  const baseUrl = await apiClient.getBaseUrl();
  const token = await apiClient.getToken();
  const results = await Promise.all(
    servers
      .filter((s) => s?.config?.enable)
      .map(async (server) => {
        let toolServerToken: string | null = null;
        const auth_type = server?.auth_type ?? 'bearer';
        if (auth_type === 'bearer') toolServerToken = server?.key ?? null;
        else if (auth_type === 'session') toolServerToken = token;
        let res: unknown = null;
        const specType = server?.spec_type ?? 'url';
        if (specType === 'url') {
          const path = server?.path ?? '';
          const fullUrl = path.includes('://')
            ? path
            : `${server?.url ?? baseUrl}${path.startsWith('/') ? '' : '/'}${path}`;
          res = await getToolServerData(toolServerToken ?? '', fullUrl).catch(() => null);
        } else if (specType === 'json' && server?.spec) {
          try {
            res = JSON.parse(server.spec) as unknown;
          } catch {
            return { error: 'Failed to parse JSON spec', url: server?.url };
          }
        }
        if (res && typeof res === 'object' && 'paths' in res) {
          return {
            url: server?.url,
            openapi: res,
            info: (res as { info?: unknown }).info,
            specs: convertOpenApiToToolPayload(res),
          };
        }
        return null;
      })
  );
  return results.filter(Boolean);
}

export async function executeToolServer(
  token: string,
  url: string,
  name: string,
  params: Record<string, unknown>,
  serverData: { openapi: { paths?: Record<string, Record<string, { operationId?: string; parameters?: unknown[]; requestBody?: unknown }>> }; info?: unknown; specs?: unknown }
): Promise<[unknown, Record<string, string> | null]> {
  try {
    const paths = serverData.openapi?.paths ?? {};
    const matchingRoute = Object.entries(paths).find(([, methods]) =>
      Object.entries(methods ?? {}).some(
        ([, op]) => (op as { operationId?: string })?.operationId === name
      )
    );
    if (!matchingRoute) {
      throw new Error(`No matching route found for operationId: ${name}`);
    }
    const [routePath, methods] = matchingRoute;
    const methodEntry = Object.entries(methods ?? {}).find(
      ([, op]) => (op as { operationId?: string })?.operationId === name
    );
    if (!methodEntry) {
      throw new Error(`No matching method found for operationId: ${name}`);
    }
    const [httpMethod, operation] = methodEntry;
    const op = operation as { parameters?: { name?: string; in?: string }[]; requestBody?: { content?: object } };
    const pathParams: Record<string, string> = {};
    const queryParams: Record<string, string> = {};
    let bodyParams: unknown = {};
    if (op.parameters) {
      for (const param of op.parameters) {
        const n = param?.name;
        if (n == null || !(n in params)) continue;
        const paramIn = param?.in;
        if (paramIn === 'path') pathParams[n] = String(params[n]);
        else if (paramIn === 'query') queryParams[n] = String(params[n]);
      }
    }
    let finalUrl = `${url}${routePath}`;
    for (const [key, value] of Object.entries(pathParams)) {
      finalUrl = finalUrl.replace(
        new RegExp(`\\{${key}\\}`, 'g'),
        encodeURIComponent(value)
      );
    }
    if (Object.keys(queryParams).length > 0) {
      finalUrl += `?${new URLSearchParams(queryParams).toString()}`;
    }
    if (op.requestBody?.content) bodyParams = params;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
    };
    const init: RequestInit = {
      method: (httpMethod as string).toUpperCase(),
      headers,
    };
    if (
      ['post', 'put', 'patch', 'delete'].includes((httpMethod as string).toLowerCase()) &&
      op.requestBody
    ) {
      (init as RequestInit & { body?: string }).body = JSON.stringify(bodyParams);
    }
    const response = await fetch(finalUrl, init);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((v, k) => {
      responseHeaders[k] = v;
    });
    const text = await response.text();
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
    return [data, responseHeaders];
  } catch (err) {
    console.error('API Request Error:', err);
    return [{ error: (err as Error)?.message }, null];
  }
}

export async function getTaskConfig(token: string = '') {
  return req<unknown>(`/api/v1/tasks/config`, {
    method: 'GET',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
  }, token || undefined);
}

export async function updateTaskConfig(token: string, config: object) {
  return req<unknown>(`/api/v1/tasks/config/update`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  }, token);
}

export async function generateTitle(
  token: string = '',
  model: string,
  messages: object[],
  chat_id?: string
): Promise<string | null> {
  let error: unknown = null;
  const res = await apiClient
    .request<{ choices?: { message?: { content?: string } }[] }>(
      '/api/v1/tasks/title/completions',
      {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages,
          ...(chat_id && { chat_id }),
        }),
      },
      token || undefined
    )
    .catch((e) => {
      error = (e as { detail?: unknown })?.detail ?? e;
      return null;
    });
  if (error) throw error;
  const raw = res?.choices?.[0]?.message?.content ?? '';
  const sanitized = raw.replace(/['''`]/g, '"');
  const start = sanitized.indexOf('{');
  const end = sanitized.lastIndexOf('}');
  if (start !== -1 && end !== -1) {
    try {
      const parsed = JSON.parse(sanitized.substring(start, end + 1));
      return parsed?.title ?? null;
    } catch {
      return null;
    }
  }
  return null;
}

export async function generateFollowUps(
  token: string = '',
  model: string,
  messages: string,
  chat_id?: string
): Promise<string[]> {
  let error: unknown = null;
  const res = await apiClient
    .request<{ choices?: { message?: { content?: string } }[] }>(
      '/api/v1/tasks/follow_ups/completions',
      {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages,
          ...(chat_id && { chat_id }),
        }),
      },
      token || undefined
    )
    .catch((e) => {
      error = (e as { detail?: unknown })?.detail ?? e;
      return null;
    });
  if (error) throw error;
  const raw = res?.choices?.[0]?.message?.content ?? '';
  const sanitized = raw.replace(/['''`]/g, '"');
  const start = sanitized.indexOf('{');
  const end = sanitized.lastIndexOf('}');
  if (start !== -1 && end !== -1) {
    try {
      const parsed = JSON.parse(sanitized.substring(start, end + 1));
      return Array.isArray(parsed?.follow_ups) ? parsed.follow_ups : [];
    } catch {
      return [];
    }
  }
  return [];
}

export async function generateTags(
  token: string = '',
  model: string,
  messages: string,
  chat_id?: string
): Promise<string[]> {
  let error: unknown = null;
  const res = await apiClient
    .request<{ choices?: { message?: { content?: string } }[] }>(
      '/api/v1/tasks/tags/completions',
      {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages,
          ...(chat_id && { chat_id }),
        }),
      },
      token || undefined
    )
    .catch((e) => {
      error = (e as { detail?: unknown })?.detail ?? e;
      return null;
    });
  if (error) throw error;
  const raw = res?.choices?.[0]?.message?.content ?? '';
  const sanitized = raw.replace(/['''`]/g, '"');
  const start = sanitized.indexOf('{');
  const end = sanitized.lastIndexOf('}');
  if (start !== -1 && end !== -1) {
    try {
      const parsed = JSON.parse(sanitized.substring(start, end + 1));
      return Array.isArray(parsed?.tags) ? parsed.tags : [];
    } catch {
      return [];
    }
  }
  return [];
}

export async function generateEmoji(
  token: string = '',
  model: string,
  prompt: string,
  chat_id?: string
): Promise<string | null> {
  let error: unknown = null;
  const res = await apiClient
    .request<{ choices?: { message?: { content?: string } }[] }>(
      '/api/v1/tasks/emoji/completions',
      {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          prompt,
          ...(chat_id && { chat_id }),
        }),
      },
      token || undefined
    )
    .catch((e) => {
      error = (e as { detail?: unknown })?.detail ?? e;
      return null;
    });
  if (error) throw error;
  const response = (res?.choices?.[0]?.message?.content ?? '').replace(/["']/g, '');
  if (response && /\p{Extended_Pictographic}/u.test(response)) {
    const match = response.match(/\p{Extended_Pictographic}/gu);
    return match?.[0] ?? null;
  }
  return null;
}

export async function generateQueries(
  token: string = '',
  model: string,
  messages: object[],
  prompt: string,
  type: string = 'web_search',
  chat_id?: string
): Promise<string[]> {
  let error: unknown = null;
  const res = await apiClient
    .request<{ choices?: { message?: { content?: string } }[] }>(
      '/api/v1/tasks/queries/completions',
      {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages,
          prompt,
          type,
          ...(chat_id && { chat_id }),
        }),
      },
      token || undefined
    )
    .catch((e) => {
      error = (e as { detail?: unknown })?.detail ?? e;
      return null;
    });
  if (error) throw error;
  const response = res?.choices?.[0]?.message?.content ?? '';
  const start = response.indexOf('{');
  const end = response.lastIndexOf('}');
  if (start !== -1 && end !== -1) {
    try {
      const parsed = JSON.parse(response.substring(start, end + 1));
      return Array.isArray(parsed?.queries) ? parsed.queries : [response];
    } catch {
      return [response];
    }
  }
  return [response];
}

export async function generateAutoCompletion(
  token: string = '',
  model: string,
  prompt: string,
  messages?: object[],
  type: string = 'search query',
  chat_id?: string
): Promise<string> {
  const controller = new AbortController();
  let error: unknown = null;
  const res = await fetch(
    `${await apiClient.getBaseUrl()}/api/v1/tasks/auto/completions`,
    {
      signal: controller.signal,
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token || (await apiClient.getToken()) || ''}`,
      },
      body: JSON.stringify({
        model,
        prompt,
        ...(messages && { messages }),
        type,
        stream: false,
        ...(chat_id && { chat_id }),
      }),
    }
  )
    .then((r) => (r.ok ? r.json() : Promise.reject(r)))
    .catch((e) => {
      error = (e as { detail?: unknown })?.detail ?? e;
      return null;
    });
  if (error) throw error;
  const response = (res as { choices?: { message?: { content?: string } }[] })?.choices?.[0]?.message?.content ?? '';
  const start = response.indexOf('{');
  const end = response.lastIndexOf('}');
  if (start !== -1 && end !== -1) {
    try {
      const parsed = JSON.parse(response.substring(start, end + 1));
      return parsed?.text ?? '';
    } catch {
      return response;
    }
  }
  return response;
}

export async function generateMoACompletion(
  token: string = '',
  model: string,
  prompt: string,
  responses: string[]
): Promise<[Response | null, AbortController]> {
  const controller = new AbortController();
  let error: unknown = null;
  const baseUrl = await apiClient.getBaseUrl();
  const authToken = token || (await apiClient.getToken());
  const res = await fetch(`${baseUrl}/api/v1/tasks/moa/completions`, {
    signal: controller.signal,
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken || ''}`,
    },
    body: JSON.stringify({
      model,
      prompt,
      responses,
      stream: true,
    }),
  }).catch((e) => {
    console.error(e);
    error = e;
    return null;
  });
  if (error) throw error;
  return [res, controller];
}

export async function getUsage(token: string = '') {
  return req<unknown>(`${API}/usage`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  }, token || undefined);
}

export async function getBackendConfig() {
  return req<unknown>(`${API}/config`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  }, null);
}

export async function getChangelog() {
  return req<unknown>(`${API}/changelog`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  }, null);
}

export async function getVersion(token: string) {
  return req<unknown>(`${API}/version`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  }, token);
}

export async function getVersionUpdates(token: string) {
  return req<unknown>(`${API}/version/updates`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  }, token);
}

export async function getModelFilterConfig(token: string) {
  return req<unknown>(`${API}/config/model/filter`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  }, token);
}

export async function updateModelFilterConfig(
  token: string,
  enabled: boolean,
  models: string[]
) {
  return req<unknown>(`${API}/config/model/filter`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ enabled, models }),
  }, token);
}

export async function getWebhookUrl(token: string) {
  const res = await req<{ url?: string }>(`${API}/webhook`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  }, token);
  return (res as { url?: string })?.url;
}

export async function updateWebhookUrl(token: string, url: string) {
  const res = await req<{ url?: string }>(`${API}/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ url }),
  }, token);
  return (res as { url?: string })?.url;
}

export async function getCommunitySharingEnabledStatus(token: string) {
  return req<unknown>(`${API}/community_sharing`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  }, token);
}

export async function toggleCommunitySharingEnabledStatus(token: string) {
  return req<unknown>(`${API}/community_sharing/toggle`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  }, token);
}

export interface ModelConfig {
  id: string;
  name: string;
  meta: ModelMeta;
  base_model_id?: string;
  params: ModelParams;
}

export interface ModelMeta {
  toolIds: never[];
  description?: string;
  capabilities?: object;
  profile_image_url?: string;
}

export interface ModelParams {}

export type GlobalModelConfig = ModelConfig[];

export async function getModelConfig(
  token: string
): Promise<GlobalModelConfig> {
  const res = await req<{ models?: GlobalModelConfig }>(`${API}/config/models`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  }, token);
  return (res as { models?: GlobalModelConfig })?.models ?? [];
}

export async function updateModelConfig(
  token: string,
  config: GlobalModelConfig
) {
  return req<unknown>(`${API}/config/models`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ models: config }),
  }, token);
}
