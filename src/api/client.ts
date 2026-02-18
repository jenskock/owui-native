/**
 * Open Web UI API Client
 * Handles all API communication with Open Web UI instance
 */

import { STORAGE_KEYS, API_ENDPOINTS } from '../constants/config';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { TextDecoder } from 'text-encoding';
import type {
  LoginRequest,
  LoginResponse,
  Chat,
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

  async getChats(): Promise<Chat[]> {
    const response = await this.request<{ chats: Chat[] } | Chat[]>(
      API_ENDPOINTS.CHATS
    );
    if (Array.isArray(response)) return response;
    return response?.chats ?? [];
  }

  async getChat(chatId: string): Promise<Chat & { messages?: Message[] }> {
    return this.request(`${API_ENDPOINTS.CHATS}/${chatId}`);
  }

  async createChat(title?: string): Promise<Chat> {
    const response = await this.request<Chat>(API_ENDPOINTS.CHATS, {
      method: 'POST',
      body: JSON.stringify(title ? { title } : {}),
    });
    return response;
  }

  async getModels(): Promise<ModelInfo[]> {
    const response = await this.request<
      | { data: ModelInfo[] }
      | ModelInfo[]
      | { models: ModelInfo[] }
    >(API_ENDPOINTS.MODELS);
    if (Array.isArray(response)) return response;
    return (
      (response as { data?: ModelInfo[] })?.data ??
      (response as { models?: ModelInfo[] })?.models ??
      []
    );
  }

  async *streamChat(
    chatId: string,
    request: ChatMessageRequest
  ): AsyncGenerator<string, void, unknown> {
    await this.initialize();
    const url = `${this.baseUrl}${API_ENDPOINTS.CHAT}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: this.token ? `Bearer ${this.token}` : '',
    };
    const requestBody = JSON.stringify({
      ...request,
      stream: true,
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
    const responseStream = (response as Response & { body?: { getReader: () => { read: () => Promise<{ done: boolean; value?: Uint8Array }>; releaseLock: () => void } } }).body;
    const reader = responseStream?.getReader();
    if (!reader) throw new ApiError('No response body');
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
    return this.request(`${API_ENDPOINTS.CHAT}`, {
      method: 'POST',
      body: JSON.stringify({
        ...request,
        stream: false,
        chat_id: chatId,
      }),
    });
  }
}

export const apiClient = new ApiClient();
