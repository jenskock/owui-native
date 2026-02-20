/**
 * OWUI Native API Client
 * Handles all API communication with Open WebUI
 */

import { STORAGE_KEYS, API_ENDPOINTS } from '../constants/config';
import * as chatsApi from './chats';
import * as apiIndex from './index';

/** UUID v4 using Math.random() — works in RN without crypto polyfill. */
/* eslint-disable no-bitwise */
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
  ChatDetail,
  Message,
  MessageFile,
  MessageSource,
  ModelInfo,
  ChatMessageRequest,
  StreamChunk,
} from '../types/api';

/** Decode ArrayBuffer to UTF-8 string. Safe when TextDecoder is undefined (e.g. some RN runtimes). */
function arrayBufferToString(ab: ArrayBuffer): string {
  const TD = (globalThis as { TextDecoder?: new () => { decode(buf: ArrayBuffer): string } }).TextDecoder;
  if (typeof TD !== 'undefined') {
    return new TD().decode(ab);
  }
  const bytes = new Uint8Array(ab);
  let s = '';
  let i = 0;
  while (i < bytes.length) {
    const b = bytes[i++];
    if (b < 0x80) s += String.fromCharCode(b);
    else if (b < 0xe0) {
      if (i >= bytes.length) break;
      s += String.fromCharCode(((b & 0x1f) << 6) | (bytes[i++] & 0x3f));
    } else if (b < 0xf0) {
      if (i + 1 >= bytes.length) break;
      s += String.fromCharCode(((b & 0x0f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f));
    } else {
      if (i + 2 >= bytes.length) break;
      const c =
        ((b & 0x07) << 18) |
        ((bytes[i++] & 0x3f) << 12) |
        ((bytes[i++] & 0x3f) << 6) |
        (bytes[i++] & 0x3f);
      s += String.fromCharCode(0xd800 + ((c - 0x10000) >> 10), 0xdc00 + ((c - 0x10000) & 0x3ff));
    }
  }
  return s;
}
/* eslint-enable no-bitwise */

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
      const headers: Record<string, string> = {};
      if (this.token) {
        headers.Authorization = `Bearer ${this.token}`;
      }
      const response = await fetch(imageUrl, { headers });
      if (!response.ok) return null;
      const arrayBuffer = await response.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      const base64Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
      let base64 = '';
      let i = 0;
      /* eslint-disable no-bitwise */
      while (i < uint8Array.length) {
        const byte1 = uint8Array[i++];
        const byte2 = i < uint8Array.length ? uint8Array[i++] : undefined;
        const byte3 = i < uint8Array.length ? uint8Array[i++] : undefined;

        base64 += base64Chars.charAt((byte1 >> 2) & 63);

        if (byte2 !== undefined) {
          base64 += base64Chars.charAt(((byte1 << 4) | (byte2 >> 4)) & 63);
        } else {
          base64 += base64Chars.charAt((byte1 << 4) & 63);
          base64 += '==';
          break;
        }

        if (byte3 !== undefined) {
          base64 += base64Chars.charAt(((byte2 << 2) | (byte3 >> 6)) & 63);
          base64 += base64Chars.charAt(byte3 & 63);
        } else {
          base64 += base64Chars.charAt((byte2 << 2) & 63);
          base64 += '=';
          break;
        }
      }
      /* eslint-enable no-bitwise */

      const contentType = response.headers.get('content-type') || 'image/png';
      return `data:${contentType};base64,${base64}`;
    } catch (error) {
      console.error('Error fetching image:', error);
      return null;
    }
  }

  /**
   * Low-level request (1:1 with web app pattern).
   * path is relative to baseUrl (e.g. '/api/v1/chats').
   * authToken: when provided, use it; when undefined, use this.token; when null, no Authorization.
   */
  async request<T>(
    path: string,
    options: RequestInit = {},
    authToken?: string | null
  ): Promise<T> {
    await this.initialize();
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(options.headers as Record<string, string>),
    };
    const token = authToken !== undefined ? authToken : this.token;
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    const response = await fetch(url, { ...options, headers });
    if (!response.ok) {
      let err: unknown;
      try {
        err = await response.json();
      } catch {
        err = await response.text();
      }
      throw err;
    }
    const text = await response.text();
    if (!text) return {} as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      return {} as T;
    }
  }

  /** Get current token (e.g. for passing to 1:1 API functions). */
  async getToken(): Promise<string | null> {
    await this.initialize();
    return this.token;
  }

  async login(baseUrl: string, credentials: LoginRequest): Promise<LoginResponse> {
    this.setBaseUrl(baseUrl);
    return this.request<LoginResponse>(
      API_ENDPOINTS.LOGIN,
      {
        method: 'POST',
        body: JSON.stringify(credentials),
      },
      null
    );
  }

  /** GET /api/v1/chats/?page=1 → list (delegates to 1:1 getChatList, maps to Chat[]). */
  async getChats(page = 1): Promise<Chat[]> {
    const token = await this.getToken();
    const list = await chatsApi.getChatList(token ?? '', page, false, false);
    return (list as unknown as { id: string; title?: string; created_at?: number; updated_at?: number }[]).map((item) => ({
      id: item.id,
      title: item.title ?? '',
      create_time: new Date((item.created_at ?? 0) * 1000).toISOString(),
      update_time: new Date((item.updated_at ?? 0) * 1000).toISOString(),
    }));
  }

  /** GET /api/v1/chats/pinned → pinned chats (maps to Chat[]). */
  async getPinnedChats(): Promise<Chat[]> {
    const token = await this.getToken();
    const list = await chatsApi.getPinnedChatList(token ?? '');
    return (list as unknown as { id: string; title?: string; created_at?: number; updated_at?: number }[]).map((item) => ({
      id: item.id,
      title: item.title ?? '',
      create_time: new Date((item.created_at ?? 0) * 1000).toISOString(),
      update_time: new Date((item.updated_at ?? 0) * 1000).toISOString(),
    }));
  }

  /** POST /api/v1/chats/:id/pin → toggle pinned status. */
  async toggleChatPinned(chatId: string): Promise<void> {
    const token = await this.getToken();
    await chatsApi.toggleChatPinnedStatusById(token ?? '', chatId);
  }

  /** GET /api/v1/chats/:id → single chat with messages (delegates to 1:1 getChatById). */
  async getChat(chatId: string): Promise<Chat & { messages?: Message[] }> {
    await this.initialize();
    const token = await this.getToken();
    const raw = await chatsApi.getChatById(token ?? '', chatId) as ChatDetail;
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
          files.push({
            type: 'file',
            id,
            url: fileUrl,
            name,
            content_type: contentType,
          });
        };

        if (Array.isArray(messageWithFiles.files)) {
          for (const file of messageWithFiles.files) {
            if (file.url) pushFile(file);
            else if (file.id) pushFile({ ...file, id: file.id, name: file.name ?? file.file?.meta?.name, content_type: file.content_type ?? file.file?.meta?.content_type });
            else if (file.file?.id) pushFile({ id: file.file.id, name: file.file.meta?.name, content_type: file.content_type ?? file.file.meta?.content_type });
          }
        }
        // Intentionally skip sources: they reference the same files the user already attached.
        let messageContent: Message['content'];
        if (typeof m.content === 'string') {
          try {
            const parsed = JSON.parse(m.content);
            messageContent = Array.isArray(parsed) ? parsed : m.content;
          } catch {
            messageContent = m.content;
          }
        } else if (Array.isArray(m.content)) {
          messageContent = m.content;
        } else {
          messageContent = '';
        }

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

        const rawSources = (m as { sources?: unknown }).sources;
        const sources: MessageSource[] | undefined = Array.isArray(rawSources)
          ? (rawSources as MessageSource[])
          : undefined;

        messages.push({
          id: m.id,
          role: (m.role as 'user' | 'assistant' | 'system') ?? 'user',
          content: messageContent,
          files: files.length > 0 ? files : undefined,
          ...(sources && sources.length > 0 ? { sources } : {}),
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

  /** POST /api/v1/chats/new → create chat (delegates to 1:1 createNewChat). */
  async createChat(title?: string): Promise<Chat> {
    const token = await this.getToken();
    const chatPayload = {
      id: '',
      title: title ?? 'Neuer Chat',
      models: [],
      params: {},
      history: { messages: {}, currentId: null },
      messages: [],
      tags: [],
      timestamp: Date.now(),
    };
    const response = await chatsApi.createNewChat(token ?? '', chatPayload, null) as ChatDetail & { id: string; title?: string; created_at?: number; updated_at?: number };
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

  /** DELETE /api/v1/chats/:id (delegates to 1:1 deleteChatById). */
  async deleteChat(chatId: string): Promise<void> {
    const token = await this.getToken();
    await chatsApi.deleteChatById(token ?? '', chatId);
  }

  /** GET /api/v1/chats/:id — raw response for updating (delegates to 1:1 getChatById). */
  async getChatRaw(chatId: string): Promise<ChatDetail> {
    const token = await this.getToken();
    return chatsApi.getChatById(token ?? '', chatId) as Promise<ChatDetail>;
  }

  /** POST /api/v1/chats/:id — update last assistant message content so it persists when user reopens the chat. */
  async updateChatAssistantContent(chatId: string, assistantContent: string): Promise<void> {
    await this.initialize();
    const raw = await this.getChatRaw(chatId);
    const chat = raw.chat;
    if (!chat) return;

    const history = chat.history?.messages as Record<string, { id?: string; role?: string; content?: string; [key: string]: unknown }> | undefined;
    const messagesArray = Array.isArray(chat.messages) ? (chat.messages as { id?: string; role?: string; content?: string }[]) : [];

    const lastAssistant = messagesArray.filter((m) => m.role === 'assistant').pop();
    if (!lastAssistant?.id) return;

    if (history?.[lastAssistant.id]) {
      history[lastAssistant.id] = { ...history[lastAssistant.id], content: assistantContent };
    }
    const idx = messagesArray.findIndex((m) => m.id === lastAssistant.id);
    if (idx >= 0) {
      messagesArray[idx] = { ...messagesArray[idx], content: assistantContent };
    }

    const token = await this.getToken();
    await chatsApi.updateChatById(token ?? '', chatId, {
      ...chat,
      history: chat.history ? { ...chat.history, messages: history } : undefined,
      messages: messagesArray,
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

    const chatPayload = {
      models: [modelId],
      history: { messages: historyMessages, currentId: newAssistantMsgId },
      messages: messagesArray,
      params: {},
    };

    const token = await this.getToken();
    await chatsApi.updateChatById(token ?? '', chatId, chatPayload);
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
      this.fetchAndCacheModels().catch(() => {});
      return data;
    }
    return this.fetchAndCacheModels();
  }

  private async fetchAndCacheModels(): Promise<ModelInfo[]> {
    try {
      const token = await this.getToken();
      const rawList = await apiIndex.getModels(token ?? '', null, false, false);
      const result: ModelInfo[] = (Array.isArray(rawList) ? rawList : [])
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

  /** Connect Socket.IO (path + auth per open-webui). Resolves when connected. Never throws — returns a socket or null. */
  private connectSocket(): Promise<import('socket.io-client').Socket | null> {
    const token = this.token;
    if (!token) return Promise.resolve(null);
    let io: (url: string, opts: Record<string, unknown>) => import('socket.io-client').Socket;
    try {
      // Default export works more reliably in React Native than named { io }
      const socketIo = require('socket.io-client');
      io = socketIo.default ?? socketIo.io ?? socketIo;
      if (typeof io !== 'function') return Promise.resolve(null);
    } catch {
      return Promise.resolve(null);
    }
    const wsUrl = this.baseUrl.replace(/^http:\/\//, 'ws://').replace(/^https:\/\//, 'wss://');
    return new Promise((resolve) => {
      try {
        const s = io(wsUrl, {
          path: '/ws/socket.io',
          auth: { token },
          transports: ['websocket'],
        });
        s.on('connect', () => {
          s.emit('user-join', { auth: { token } });
          resolve(s);
        });
        s.on('connect_error', () => {
          s.removeAllListeners();
          s.close();
          resolve(null);
        });
        // Timeout so we don't block send forever if server never connects
        setTimeout(() => {
          if (s.connected) return;
          s.removeAllListeners();
          s.close();
          resolve(null);
        }, 8000);
      } catch {
        resolve(null);
      }
    });
  }

  /** Flatten message content to plain string for streaming display */
  private contentToString(content: Message['content']): string {
    if (typeof content === 'string') return content;
    if (!Array.isArray(content)) return '';
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object' && (part as { type?: string }).type === 'text' && 'text' in part)
          return String((part as { text: string }).text);
        return '';
      })
      .join('');
  }

  async *streamChat(
    chatId: string,
    request: ChatMessageRequest
  ): AsyncGenerator<string, void, unknown> {
    await this.initialize();
    const url = `${this.baseUrl}${API_ENDPOINTS.CHAT_COMPLETIONS}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      Authorization: this.token ? `Bearer ${this.token}` : '',
    };
    const messages = request.messages.map((m) => ({
      role: m.role,
      content: contentForApi(m.content),
    }));

    // Single queue for both XHR SSE and socket chunks so the generator yields incrementally.
    const queue: string[] = [];
    let streamDone = false;
    let resolveNext: (() => void) | null = null;
    const finishStream = (): void => {
      streamDone = true;
      if (resolveNext) {
        resolveNext();
        resolveNext = null;
      }
    };

    type EventPayload = { chat_id?: string; data?: { type?: string; data?: { content?: string } } };
    let socket: import('socket.io-client').Socket | null = null;
    let eventsHandler: ((event: EventPayload) => void) | null = null;

    try {
      socket = await this.connectSocket();
      eventsHandler = (event: EventPayload) => {
        if (event.chat_id !== chatId) return;
        const type = event.data?.type ?? null;
        const data = event.data?.data ?? null;
        if (type === 'chat:message:delta' || type === 'message') {
          if (data && typeof data.content === 'string') {
            queue.push(data.content);
            if (resolveNext) {
              resolveNext();
              resolveNext = null;
            }
          }
        } else if (type === 'chat:completion') {
          finishStream();
        }
      };
      if (socket) {
        socket.on('events', eventsHandler);
        socket.on('disconnect', finishStream);
        socket.on('connect_error', () => finishStream());
      }
    } catch {
      socket = null;
    }

    // Request title generation on first user message (matches web app behavior).
    // Backend needs "id" (assistant message id) to run background_tasks_handler and find the message.
    const isFirstExchange =
      messages.length === 1 ||
      (messages.length === 2 &&
        messages[0].role === 'system' &&
        messages[1].role === 'user');
    const assistantMessageId = uuidv4();
    const lastUserMessage = request.messages.length > 0 ? request.messages[request.messages.length - 1] : null;
    const parentId = lastUserMessage && (lastUserMessage as Message).id ? (lastUserMessage as Message).id : undefined;
    const requestBody = JSON.stringify({
      stream: true,
      model: request.model,
      messages,
      params: {},
      chat_id: chatId,
      id: assistantMessageId,
      ...(parentId ? { parent_id: parentId } : {}),
      ...(socket?.id ? { session_id: socket.id } : {}),
      ...(request.tool_ids?.length ? { tool_ids: request.tool_ids } : {}),
      ...(isFirstExchange ? { background_tasks: { title_generation: true } } : {}),
    });

    // React Native's fetch does not support response.body.getReader() for streaming.
    // Use XMLHttpRequest so we get onprogress and can yield chunks incrementally to the UI.
    const waitNext = (): Promise<void> =>
      new Promise((r) => {
        resolveNext = r;
      });

    const flushNext = (): void => {
      if (resolveNext) {
        resolveNext();
        resolveNext = null;
      }
    };

    // React Native only sends incremental data when responseType is '' or 'text'.
    // With 'arraybuffer' the body is only available at the end, so streaming never gets chunks.
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.responseType = 'text';
    Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v));

    let lastProcessedLength = 0;
    const parseSSEChunkFromText = (full: string): void => {
      const tail = full.slice(lastProcessedLength);
      lastProcessedLength = full.length;
      const lines = tail.split('\n');
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') return;
        try {
          const parsed: StreamChunk = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content ?? '';
          if (content) queue.push(content);
        } catch {
          // ignore non-JSON lines
        }
      }
      if (queue.length > 0) flushNext();
    };

    type XhrResult = { ok: boolean; body?: string | ArrayBuffer; status?: number; statusText?: string };
    const xhrDone = new Promise<XhrResult>((resolve) => {
      xhr.onload = () => {
        const response = xhr.response;
        if (typeof response === 'string' && response.length > lastProcessedLength) {
          parseSSEChunkFromText(response);
        }
        finishStream();
        flushNext();
        resolve({
          ok: xhr.status >= 200 && xhr.status < 300,
          body: response,
          status: xhr.status,
          statusText: xhr.statusText,
        });
      };
      xhr.onerror = () => {
        finishStream();
        flushNext();
        resolve({ ok: false, status: 0, statusText: 'Network error' });
      };
      xhr.ontimeout = () => {
        finishStream();
        flushNext();
        resolve({ ok: false, status: 0, statusText: 'Timeout' });
      };
    });

    xhr.onprogress = () => {
      const response = xhr.response;
      if (typeof response === 'string' && response.length > lastProcessedLength) {
        parseSSEChunkFromText(response);
      }
    };

    xhr.send(requestBody);

    // Yield chunks as they arrive (from SSE parsing in onprogress, or from socket)
    try {
      while (!streamDone || queue.length > 0) {
        if (queue.length > 0) {
          yield queue.shift()!;
        } else {
          await waitNext();
        }
      }
    } finally {
      if (socket) {
        socket.off('events', eventsHandler!);
        socket.off('disconnect');
        socket.off('connect_error');
        socket.removeAllListeners();
        socket.close();
      }
    }

    const result = await xhrDone;
    if (!result.ok) {
      let errBody = '';
      if (result.body != null) {
        errBody =
          typeof result.body === 'string'
            ? result.body
            : result.body.byteLength > 0
              ? arrayBufferToString(result.body)
              : '';
        if (!errBody) errBody = String(result.statusText);
      }
      throw new ApiError(
        errBody || result.statusText || 'Request failed',
        result.status ?? 0,
        errBody
      );
    }

    // If response was JSON (e.g. task_id or single message) and we didn't stream via SSE/socket
    const bodyLength =
      result.body == null
        ? 0
        : typeof result.body === 'string'
          ? result.body.length
          : result.body.byteLength;
    if (bodyLength > 0 && queue.length === 0) {
      const text =
        typeof result.body === 'string'
          ? result.body
          : result.body != null
            ? arrayBufferToString(result.body)
            : '';
      if (text.trim().startsWith('{')) {
        try {
          const jsonResponse = JSON.parse(text) as {
            task_id?: string;
            choices?: Array<{ message?: { content?: string } }>;
          };
          if (jsonResponse.choices?.[0]?.message?.content) {
            yield jsonResponse.choices[0].message.content;
          } else if (jsonResponse.task_id) {
            // Server returned task_id (async path); socket streaming may not be available. Fetch full reply.
            const nonStream = await this.sendChatMessage(chatId, { ...request, stream: false });
            const r = nonStream as { message?: { content?: unknown }; choices?: Array<{ message?: { content?: unknown } }> };
            const raw = r.message?.content ?? r.choices?.[0]?.message?.content;
            const content = typeof raw === 'string' ? raw : Array.isArray(raw) ? '' : String(raw ?? '');
            if (content) yield content;
          }
        } catch {
          // not JSON, ignore
        }
      }
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

  /**
   * POST /api/chat/completed — notify backend that a chat completion finished.
   * Triggers title generation and other post-processing. Open WebUI requires model, chat_id, id, session_id.
   */
  async notifyChatCompleted(
    chatId: string,
    opts: { model: string; messageId?: string; sessionId?: string; messages?: unknown[] }
  ): Promise<void> {
    await this.initialize();
    const body: Record<string, unknown> = {
      chat_id: chatId,
      model: opts.model,
      id: opts.messageId ?? '',
      session_id: opts.sessionId ?? '',
    };
    if (opts.messages && opts.messages.length > 0) {
      body.messages = opts.messages;
    }
    await this.request<unknown>(API_ENDPOINTS.CHAT_COMPLETED, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }
}

export const apiClient = new ApiClient();
