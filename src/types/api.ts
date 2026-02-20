/**
 * OWUI Native API types
 * Based on OWUI Native API structure
 */

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  token_type?: string;
}

/** Normalized chat for app (create_time/update_time as ISO strings) */
export interface Chat {
  id: string;
  title: string;
  create_time: string;
  update_time?: string;
  chat_model_id?: string;
  [key: string]: unknown;
}

/** Raw list item from GET /api/v1/chats/ (created_at/updated_at are Unix seconds) */
export interface ChatListItem {
  id: string;
  title: string;
  created_at: number;
  updated_at: number;
  [key: string]: unknown;
}

/** Full chat from GET/POST /api/v1/chats/:id or POST /api/v1/chats/new */
export interface ChatDetail {
  id: string;
  user_id?: string;
  title: string;
  chat?: {
    messages?: Array<{ id?: string; role: string; content: string; [key: string]: unknown }>;
    history?: { messages?: Record<string, unknown> };
    [key: string]: unknown;
  };
  created_at?: number;
  updated_at?: number;
  [key: string]: unknown;
}

export interface FileContent {
  type: 'file';
  file_url?: { url: string };
  file_path?: string;
  file_name?: string;
}

export interface TextContent {
  type: 'text';
  text: string;
}

export interface ImageContent {
  type: 'image_url';
  image_url: { url: string };
}

export type MessageContent =
  | string
  | Array<string | FileContent | TextContent | ImageContent>;

export interface MessageFile {
  type: 'file';
  id: string;
  url: string; // File ID or full URL
  name: string;
  content_type?: string;
  [key: string]: unknown;
}

/** Tool/source citation on an assistant message (e.g. MCP tool_search_post) */
export interface MessageSource {
  source?: { name?: string };
  document?: string[];
  metadata?: Array<{ source?: string; parameters?: Record<string, unknown> }>;
  tool_result?: boolean;
}

export interface Message {
  id?: string;
  role: 'user' | 'assistant' | 'system';
  content: MessageContent;
  files?: MessageFile[];
  sources?: MessageSource[];
  [key: string]: unknown;
}

export interface ModelInfo {
  id: string;
  name: string;
  /** Backend model config: default tools for this model (from workspace model editor) */
  info?: { meta?: { toolIds?: string[] }; [key: string]: unknown };
  [key: string]: unknown;
}

/** Tool from GET /api/v1/tools/ (enable/disable per chat via tool_ids in completions) */
export interface Tool {
  id: string;
  user_id?: string;
  name: string;
  meta?: { description?: string; manifest?: Record<string, unknown> };
  access_grants?: unknown[];
  updated_at?: number;
  created_at?: number;
  user?: unknown;
}

export interface ChatMessageRequest {
  model: string;
  messages: Message[];
  stream?: boolean;
  regenerate?: boolean;
  /** Tool IDs to enable for this request (from GET /api/v1/tools/) */
  tool_ids?: string[];
}

export interface StreamChunk {
  id?: string;
  object?: string;
  created?: number;
  model?: string;
  choices?: Array<{
    index?: number;
    delta?: { content?: string; role?: string };
    finish_reason?: string;
  }>;
}
