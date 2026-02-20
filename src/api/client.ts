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
    const ms = raw.chat?.messages;
    if (Array.isArray(ms)) {
      for (const m of ms) {
        const files: MessageFile[] = [];
        
        // Debug: log the raw message structure
        console.log('Processing message:', m.role, 'Content type:', typeof m.content, 'Has files property:', 'files' in m);
        console.log('Raw message:', JSON.stringify(m, null, 2));
        
        // Extract files from the message if they exist
        // Files can be in format: {type: "image", url: "/api/v1/files/{id}/content"}
        const messageWithFiles = m as { 
          files?: Array<{ 
            type?: string;
            id?: string; 
            url?: string; 
            name?: string; 
            content_type?: string;
          }>;
        };
        
        // Check files array
        if (Array.isArray(messageWithFiles.files)) {
          console.log('Found files array with', messageWithFiles.files.length, 'files');
          for (const file of messageWithFiles.files) {
            // Process file if it has a url (can be relative or absolute)
            if (file.url) {
              // Construct full file URL
              let fileUrl: string;
              if (file.url.startsWith('http')) {
                // Already absolute URL
                fileUrl = file.url;
              } else if (file.url.startsWith('/')) {
                // Relative URL - prepend base URL
                fileUrl = `${this.baseUrl}${file.url}`;
              } else if (file.id) {
                // Construct from file ID
                fileUrl = `${this.baseUrl}/api/v1/files/${file.id}/content`;
              } else {
                // Try to extract ID from URL pattern /api/v1/files/{id}/content
                const match = file.url.match(/\/api\/v1\/files\/([^/]+)\/content/);
                if (match && match[1]) {
                  fileUrl = `${this.baseUrl}/api/v1/files/${match[1]}/content`;
                } else {
                  continue; // Skip if we can't construct a valid URL
                }
              }
              
              // Extract file ID from URL if not provided
              const fileId = file.id || fileUrl.match(/\/files\/([^/]+)\//)?.[1] || '';
              
              // Determine content type from file type or use default
              const contentType = file.content_type || 
                (file.type === 'image' ? 'image/png' : undefined);
              
              console.log('Adding file:', fileId, fileUrl, contentType);
              files.push({
                type: 'file',
                id: fileId,
                url: fileUrl,
                name: file.name || `file-${fileId || 'unknown'}`,
                content_type: contentType,
              });
            } else if (file.id) {
              // File has ID but no URL - construct URL
              const fileUrl = `${this.baseUrl}/api/v1/files/${file.id}/content`;
              console.log('Adding file from ID:', file.id, fileUrl);
              files.push({
                type: 'file',
                id: file.id,
                url: fileUrl,
                name: file.name || `file-${file.id}`,
                content_type: file.content_type,
              });
            }
          }
        }
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
