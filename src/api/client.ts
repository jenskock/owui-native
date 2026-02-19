/**
 * OWUI Native API Client
 * Handles all API communication with OWUI Native instance
 */

import { STORAGE_KEYS, API_ENDPOINTS } from '../constants/config';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  LoginRequest,
  LoginResponse,
  Chat,
  ChatListItem,
  ChatDetail,
  Message,
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

class ApiClient {
  private baseUrl: string = '';
  private token: string | null = null;
  private initialized: boolean = false;

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
  }

  setToken(token: string | null): void {
    this.token = token;
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
    const raw = await this.request<ChatDetail>(
      `${API_ENDPOINTS.CHATS}/${chatId}`
    );
    const messages: Message[] = [];
    const ms = raw.chat?.messages;
    if (Array.isArray(ms)) {
      for (const m of ms) {
        messages.push({
          id: m.id,
          role: (m.role as 'user' | 'assistant' | 'system') ?? 'user',
          content: typeof m.content === 'string' ? m.content : '',
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

  async getModels(): Promise<ModelInfo[]> {
    try {
      const response = await this.request<unknown>(API_ENDPOINTS.MODELS);
      if (response == null || typeof response !== 'object') {
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
      content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
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
          const assistantContent = 
            typeof nonStreamResponse.message?.content === 'string'
              ? nonStreamResponse.message.content
              : '';
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
      content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
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
