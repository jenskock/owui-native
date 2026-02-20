/**
 * OWUI Native API Client
 * Handles all API communication with Open WebUI
 */

import { STORAGE_KEYS, API_ENDPOINTS } from '../constants/config';

/** UUID v4 using Math.random() — works in RN without crypto polyfill. */
function uuidv4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  LoginRequest,
  LoginResponse,
  Chat,
  ChatListItem,
  ChatDetail,
  Message,
  MessageFile,
  ModelInfo,
  ChatMessageRequest,
  StreamChunk,
} from '../types/api';

export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public response?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Strip client-only fields (e.g. _fileName) from content so the server/web UI don't see them. */
function contentForApi(content: Message['content']): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return JSON.stringify(content);
  const sanitized = content.map((part) => {
    if (part == null || typeof part !== 'object') return part;
    const obj = part as unknown as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(obj)) {
      if (!key.startsWith('_')) out[key] = obj[key];
    }
    return out;
  });
  return JSON.stringify(sanitized);
}

/** Cache TTL for models list (2 min). Reduces 1–2s delay when opening chat/settings. */
const MODELS_CACHE_TTL_MS = 2 * 60 * 1000;

/** Server message shape for POST chat (history.messages entry). */
type ServerHistoryMessage = {
  id: string;
  parentId: string | null;
  childrenIds: string[];
  role: string;
  content: string;
  timestamp: number;
  models?: string[];
  model?: string;
  modelName?: string;
  modelIdx?: number;
  files?: unknown[];
  [key: string]: unknown;
};

class ApiClient {
  private baseUrl: string = '';
  private token: string | null = null;
  private initialized: boolean = false;
  private modelsCache: {
    baseUrl: string;
    data: ModelInfo[];
    ts: number;
  } | null = null;

  async initialize(): Promise<void> {
    if (this.initialized) return;
    const [url, token] = await Promise.all([
      AsyncStorage.getItem(STORAGE_KEYS.BASE_URL),
      AsyncStorage.getItem(STORAGE_KEYS.AUTH_TOKEN),
    ]);
    if (url) this.baseUrl = url.replace(/\/$/, '');
    if (token) this.token = token;
    this.initialized = true;
  }

  setBaseUrl(url: string): void {
    this.baseUrl = url.replace(/\/$/, '');
    this.modelsCache = null;
  }

  setToken(token: string | null): void {
    this.token = token;
    this.modelsCache = null;
  }

  /**
   * Get the base URL (for constructing file URLs from file IDs)
   */
  async getBaseUrl(): Promise<string> {
    await this.initialize();
    return this.baseUrl;
  }

  /**
   * Convert a file ID to a full file URL
   */
  async getFileUrl(fileId: string): Promise<string> {
    const baseUrl = await this.getBaseUrl();
    return `${baseUrl}/api/v1/files/${fileId}/content`;
  }

  /**
   * Fetch an image with authentication and convert to data URL
   */
  async fetchImageAsDataUrl(imageUrl: string): Promise<string | null> {
    await this.initialize();
    try {
      console.log('Fetching image from:', imageUrl.substring(0, 100));
      const headers: Record<string, string> = {};
      if (this.token) {
        headers.Authorization = `Bearer ${this.token}`;
      }
      const response = await fetch(imageUrl, { headers });
      if (!response.ok) {
        console.error('Failed to fetch image:', response.status, response.statusText);
        return null;
      }
      console.log('Image fetched successfully, content-type:', response.headers.get('content-type'));
      
      // Convert response to base64 using React Native compatible method
      const arrayBuffer = await response.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      console.log('Image size:', uint8Array.length, 'bytes');
      
      // Base64 encoding function that works in React Native
      const base64Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
      let base64 = '';
      let i = 0;
      while (i < uint8Array.length) {
        const byte1 = uint8Array[i++];
        const byte2 = i < uint8Array.length ? uint8Array[i++] : undefined;
        const byte3 = i < uint8Array.length ? uint8Array[i++] : undefined;
        
        // Encode first 6 bits (always present)
        base64 += base64Chars.charAt((byte1 >> 2) & 63);
        
        // Encode next 6 bits (combines last 2 bits of byte1 and first 4 bits of byte2)
        if (byte2 !== undefined) {
          base64 += base64Chars.charAt(((byte1 << 4) | (byte2 >> 4)) & 63);
        } else {
          base64 += base64Chars.charAt((byte1 << 4) & 63);
          base64 += '==';
          break;
        }
        
        // Encode next 6 bits (combines last 4 bits of byte2 and first 2 bits of byte3)
        if (byte3 !== undefined) {
          base64 += base64Chars.charAt(((byte2 << 2) | (byte3 >> 6)) & 63);
          base64 += base64Chars.charAt(byte3 & 63);
        } else {
          base64 += base64Chars.charAt((byte2 << 2) & 63);
          base64 += '=';
          break;
        }
      }
      
      const contentType = response.headers.get('content-type') || 'image/png';
      const dataUrl = `data:${contentType};base64,${base64}`;
      console.log('Converted to data URL, length:', dataUrl.length);
      return dataUrl;
    } catch (error) {
      console.error('Error fetching image:', error);
      if (error instanceof Error) {
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
      }
      return null;
    }
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    requiresAuth = true
  ): Promise<T> {
    await this.initialize();
    const url = `${this.baseUrl}${endpoint}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };
    if (requiresAuth && this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }
    const response = await fetch(url, { ...options, headers });
    if (!response.ok) {
      const errorBody = await response.text();
      throw new ApiError(
        errorBody || response.statusText,
        response.status,
        errorBody
      );
    }
    const text = await response.text();
    if (!text) return {} as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      return {} as T;
    }
  }

  async login(baseUrl: string, credentials: LoginRequest): Promise<LoginResponse> {
    this.setBaseUrl(baseUrl);
    const response = await this.request<LoginResponse>(
      API_ENDPOINTS.LOGIN,
      {
        method: 'POST',
        body: JSON.stringify(credentials),
      },
      false
    );
    return response;
  }

  /** GET /api/v1/chats/?page=1 → list; response is array of { id, title, created_at, updated_at } */
  async getChats(page = 1): Promise<Chat[]> {
    const response = await this.request<ChatListItem[]>(
      `${API_ENDPOINTS.CHATS}/?page=${page}`
    );
    const list = Array.isArray(response) ? response : [];
    return list.map((item) => ({
      id: item.id,
      title: item.title ?? '',
      create_time: new Date((item.created_at ?? 0) * 1000).toISOString(),
      update_time: new Date((item.updated_at ?? 0) * 1000).toISOString(),
    }));
  }

  /** GET /api/v1/chats/:id → single chat with messages */
  async getChat(chatId: string): Promise<Chat & { messages?: Message[] }> {
    await this.initialize();
    const raw = await this.request<ChatDetail>(
      `${API_ENDPOINTS.CHATS}/${chatId}`
    );
    const messages: Message[] = [];
    type ChatMessageLike = { id?: string; role?: string; content?: unknown; files?: unknown[]; timestamp?: number; [key: string]: unknown };
    let ms: ChatMessageLike[] | undefined = Array.isArray(raw.chat?.messages) ? (raw.chat.messages as ChatMessageLike[]) : undefined;
    if (!ms && raw.chat?.history?.messages && typeof raw.chat.history.messages === 'object') {
      const historyMessages = raw.chat.history.messages as Record<string, ChatMessageLike>;
      ms = Object.values(historyMessages).sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));
    }
    if (Array.isArray(ms)) {
      for (const m of ms) {
        const files: MessageFile[] = [];
        
        // Debug: log the raw message structure
        console.log('Processing message:', m.role, 'Content type:', typeof m.content, 'Has files property:', 'files' in m);
        console.log('Raw message:', JSON.stringify(m, null, 2));
        
        // Extract files from the message (user attachments and assistant sources)
        type FileEntry = {
          id?: string;
          url?: string;
          name?: string;
          content_type?: string;
          type?: string;
          file?: { id?: string; meta?: { content_type?: string; name?: string } };
        };
        const messageWithFiles = m as { files?: FileEntry[] };

        const pushFile = (entry: FileEntry) => {
          const fileId =
            entry.id ??
            (entry.url && !entry.url.startsWith('http') && !entry.url.startsWith('/') ? entry.url : undefined) ??
            entry.file?.id;
          let fileUrl: string;
          if (entry.url?.startsWith('http')) {
            fileUrl = entry.url;
          } else if (entry.url?.startsWith('/')) {
            fileUrl = `${this.baseUrl}${entry.url}`;
          } else if (fileId) {
            fileUrl = `${this.baseUrl}/api/v1/files/${fileId}/content`;
          } else {
            return;
          }
          const id = fileId ?? fileUrl.match(/\/files\/([^/]+)\//)?.[1] ?? '';
          if (files.some((f) => f.id === id)) return;
          const contentType =
            entry.content_type ??
            entry.file?.meta?.content_type ??
            (entry.type === 'image' ? 'image/png' : 'application/octet-stream');
          const name = entry.name ?? entry.file?.meta?.name ?? `file-${id || 'unknown'}`;
          console.log('Adding file:', id, fileUrl, contentType);
          files.push({
            type: 'file',
            id,
            url: fileUrl,
            name,
            content_type: contentType,
          });
        };

        if (Array.isArray(messageWithFiles.files)) {
          console.log('Found files array with', messageWithFiles.files.length, 'files');
          for (const file of messageWithFiles.files) {
            if (file.url) pushFile(file);
            else if (file.id) pushFile({ ...file, id: file.id, name: file.name ?? file.file?.meta?.name, content_type: file.content_type ?? file.file?.meta?.content_type });
            else if (file.file?.id) pushFile({ id: file.file.id, name: file.file.meta?.name, content_type: file.content_type ?? file.file.meta?.content_type });
          }
        }
        // Intentionally skip sources: they reference the same files the user already attached; no need to show them again on the assistant message.
        // Preserve content structure - could be string or array
        // If content is a JSON string, try to parse it
        let messageContent: Message['content'];
        if (typeof m.content === 'string') {
          // Try to parse as JSON first (might be a stringified array)
          try {
            const parsed = JSON.parse(m.content);
            if (Array.isArray(parsed)) {
              messageContent = parsed;
            } else {
              messageContent = m.content;
            }
          } catch {
            // Not JSON, use as plain string
            messageContent = m.content;
          }
        } else if (Array.isArray(m.content)) {
          messageContent = m.content;
        } else {
          messageContent = '';
        }

        // When server omits files array, derive file refs from content so image previews still work
        if (files.length === 0 && Array.isArray(messageContent)) {
          for (const part of messageContent) {
            if (part && typeof part === 'object' && (part as { type?: string }).type === 'image_url') {
              const imageUrl = (part as { image_url?: { url?: string } }).image_url?.url;
              if (imageUrl && !imageUrl.startsWith('data:')) {
                const fileId = imageUrl.startsWith('http') ? undefined : imageUrl;
                if (fileId) pushFile({ id: fileId, url: imageUrl, content_type: 'image/png' });
              }
            }
          }
        }

        messages.push({
          id: m.id,
          role: (m.role as 'user' | 'assistant' | 'system') ?? 'user',
          content: messageContent,
          files: files.length > 0 ? files : undefined,
        });
      }
    }
    const chatModelId = Array.isArray((raw.chat as { models?: string[] })?.models)
      ? (raw.chat as { models: string[] }).models[0]
      : undefined;
    return {
      id: raw.id,
      title: raw.title ?? '',
      create_time: raw.created_at
        ? new Date(raw.created_at * 1000).toISOString()
        : '',
      update_time: raw.updated_at
        ? new Date(raw.updated_at * 1000).toISOString()
        : undefined,
      messages,
      chat_model_id: chatModelId,
    };
  }

  /** POST /api/v1/chats/new → create chat; body from HAR */
  async createChat(title?: string): Promise<Chat> {
    const response = await this.request<ChatDetail>(
      `${API_ENDPOINTS.CHATS}/new`,
      {
        method: 'POST',
        body: JSON.stringify({
          chat: {
            id: '',
            title: title ?? 'Neuer Chat',
            models: [],
            params: {},
            history: { messages: {}, currentId: null },
            messages: [],
            tags: [],
            timestamp: Date.now(),
          },
          folder_id: null,
        }),
      }
    );
    return {
      id: response.id,
      title: response.title ?? title ?? 'Neuer Chat',
      create_time: response.created_at
        ? new Date(response.created_at * 1000).toISOString()
        : new Date().toISOString(),
      update_time: response.updated_at
        ? new Date(response.updated_at * 1000).toISOString()
        : undefined,
    };
  }

  /** DELETE /api/v1/chats/:id */
  async deleteChat(chatId: string): Promise<void> {
    await this.request<unknown>(`${API_ENDPOINTS.CHATS}/${chatId}`, {
      method: 'DELETE',
    });
  }

  /**
   * POST /api/v1/chats/:id — update chat state with a new user message (and empty assistant placeholder).
   * Matches the web UI flow so the server has the message before we call completions.
   */
  async updateChatWithNewMessage(
    chatId: string,
    existingMessages: Message[],
    newUserContent: Message['content'],
    modelId: string
  ): Promise<void> {
    await this.initialize();
    const now = Math.floor(Date.now() / 1000);
    const newUserMsgId = uuidv4();
    const newAssistantMsgId = uuidv4();

    const contentStr =
      typeof newUserContent === 'string'
        ? newUserContent
        : Array.isArray(newUserContent)
          ? JSON.stringify(newUserContent)
          : '';

    const orderedIds: string[] = existingMessages.map((m) => (m.id as string) ?? uuidv4());
    const historyMessages: Record<string, ServerHistoryMessage> = {};
    let prevId: string | null = null;

    for (let i = 0; i < existingMessages.length; i++) {
      const m = existingMessages[i];
      const id = orderedIds[i];
      const nextId = i + 1 < existingMessages.length ? orderedIds[i + 1] : newUserMsgId;
      const content =
        typeof m.content === 'string'
          ? m.content
          : Array.isArray(m.content)
            ? JSON.stringify(m.content)
            : '';
      const entry: ServerHistoryMessage = {
        id,
        parentId: prevId,
        childrenIds: [nextId],
        role: m.role,
        content,
        timestamp: (m.timestamp as number) ?? now,
      };
      if (m.role === 'user') {
        entry.models = [modelId];
        if (m.files?.length) entry.files = m.files;
      } else if (m.role === 'assistant') {
        entry.model = modelId;
        entry.modelName = '';
        entry.modelIdx = 0;
      }
      historyMessages[id] = entry;
      prevId = id;
    }

    historyMessages[newUserMsgId] = {
      id: newUserMsgId,
      parentId: prevId,
      childrenIds: [newAssistantMsgId],
      role: 'user',
      content: contentStr,
      timestamp: now,
      models: [modelId],
    };
    historyMessages[newAssistantMsgId] = {
      id: newAssistantMsgId,
      parentId: newUserMsgId,
      childrenIds: [],
      role: 'assistant',
      content: '',
      timestamp: now,
      model: modelId,
      modelName: '',
      modelIdx: 0,
    };

    const messagesArray: ServerHistoryMessage[] = [
      ...orderedIds.map((id) => historyMessages[id]),
      historyMessages[newUserMsgId],
      historyMessages[newAssistantMsgId],
    ];

    const body = {
      chat: {
        models: [modelId],
        history: { messages: historyMessages, currentId: newAssistantMsgId },
        messages: messagesArray,
        params: {},
      },
    };

    await this.request<unknown>(`${API_ENDPOINTS.CHATS}/${chatId}`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async getModels(): Promise<ModelInfo[]> {
    await this.initialize();
    const now = Date.now();
    const cached =
      this.modelsCache &&
      this.modelsCache.baseUrl === this.baseUrl &&
      now - this.modelsCache.ts < MODELS_CACHE_TTL_MS;
    if (cached && this.modelsCache) {
      const data = this.modelsCache.data;
      // Refresh in background so next time is still fresh
      this.fetchAndCacheModels().catch(() => {});
      return data;
    }
    return this.fetchAndCacheModels();
  }

  private async fetchAndCacheModels(): Promise<ModelInfo[]> {
    try {
      const response = await this.request<unknown>(API_ENDPOINTS.MODELS);
      if (response == null || typeof response !== 'object') {
        this.modelsCache = { baseUrl: this.baseUrl, data: [], ts: Date.now() };
        return [];
      }
      let rawList: unknown[] = [];
      if (Array.isArray(response)) {
        rawList = response;
      } else {
        const obj = response as Record<string, unknown>;
        if (Array.isArray(obj.data)) rawList = obj.data;
        else if (Array.isArray(obj.models)) rawList = obj.models;
      }
      const result: ModelInfo[] = rawList
        .filter((m): m is Record<string, unknown> => m != null && typeof m === 'object')
        .map((m) => ({
          id: typeof m.id === 'string' ? m.id : String(m.id ?? ''),
          name: typeof m.name === 'string' ? m.name : String(m.name ?? m.id ?? ''),
          ...m,
        }));
      this.modelsCache = { baseUrl: this.baseUrl, data: result, ts: Date.now() };
      return result;
    } catch (error) {
      console.error('getModels error:', error);
      throw error;
    }
  }

  async *streamChat(
    chatId: string,
    request: ChatMessageRequest
  ): AsyncGenerator<string, void, unknown> {
    await this.initialize();
    const url = `${this.baseUrl}${API_ENDPOINTS.CHAT_COMPLETIONS}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: this.token ? `Bearer ${this.token}` : '',
    };
    const messages = request.messages.map((m) => ({
      role: m.role,
      content: contentForApi(m.content),
    }));
    const requestBody = JSON.stringify({
      stream: true,
      model: request.model,
      messages,
      params: {},
      chat_id: chatId,
    });
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: requestBody,
    });
    if (!response.ok) {
      const errorBody = await response.text();
      throw new ApiError(
        errorBody || response.statusText,
        response.status,
        errorBody
      );
    }
    
    // Check content-type to determine if it's JSON or a stream
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      // OWUI Native returns JSON with task_id for async streaming
      const jsonResponse = await response.json();
      if (jsonResponse.task_id) {
        // Fall back to non-streaming: send the same request with stream: false
        // and yield the complete response as a single chunk
        try {
          const nonStreamResponse = await this.sendChatMessage(chatId, {
            ...request,
            stream: false,
          });
          const r = nonStreamResponse as { message?: { content?: unknown }; choices?: Array<{ message?: { content?: unknown } }> };
          const raw = r.message?.content ?? r.choices?.[0]?.message?.content;
          const assistantContent = typeof raw === 'string' ? raw : Array.isArray(raw) ? '' : String(raw ?? '');
          if (assistantContent) {
            yield assistantContent;
          }
          return;
        } catch (fallbackError) {
          throw new ApiError(
            `Streaming not available (task_id: ${jsonResponse.task_id}). Fallback also failed: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`,
            501,
            jsonResponse
          );
        }
      }
      // If it's JSON but not task-based, try to parse as a single message
      if (jsonResponse.choices?.[0]?.message?.content) {
        yield jsonResponse.choices[0].message.content;
        return;
      }
      throw new ApiError(
        'Unexpected JSON response format',
        500,
        jsonResponse
      );
    }
    
    // Try to read as stream (for text/event-stream or similar)
    const responseStream = (response as Response & { body?: { getReader: () => { read: () => Promise<{ done: boolean; value?: Uint8Array }>; releaseLock: () => void } } }).body;
    const reader = responseStream?.getReader();
    if (!reader) {
      // Fallback: read as text and parse
      const text = await response.text();
      if (!text) {
        throw new ApiError('No response body');
      }
      // Try to parse as SSE format
      const lines = text.split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') return;
          try {
            const parsed: StreamChunk = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content ?? '';
            if (content) yield content;
          } catch {
            // Skip invalid JSON
          }
        }
      }
      return;
    }
    
    // TextDecoder is available in React Native 0.84+
    // @ts-expect-error TextDecoder is available at runtime in React Native
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value ?? new Uint8Array());
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') return;
            try {
              const parsed: StreamChunk = JSON.parse(data);
              const content =
                parsed.choices?.[0]?.delta?.content ?? '';
              if (content) yield content;
            } catch {
              // Skip invalid JSON
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  async sendChatMessage(
    chatId: string,
    request: ChatMessageRequest
  ): Promise<{ message: Message }> {
    const messages = request.messages.map((m) => ({
      role: m.role,
      content: contentForApi(m.content),
    }));
    return this.request(`${API_ENDPOINTS.CHAT_COMPLETIONS}`, {
      method: 'POST',
      body: JSON.stringify({
        stream: false,
        model: request.model,
        messages,
        params: {},
        chat_id: chatId,
      }),
    });
  }
}

export const apiClient = new ApiClient();
