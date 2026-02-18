/**
 * Open Web UI API types
 * Based on Open Web UI API structure
 */

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
}

export interface Chat {
  id: string;
  title: string;
  create_time: string;
  update_time?: string;
  chat_model_id?: string;
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

export interface Message {
  id?: string;
  role: 'user' | 'assistant' | 'system';
  content: MessageContent;
  [key: string]: unknown;
}

export interface ModelInfo {
  id: string;
  name: string;
  [key: string]: unknown;
}

export interface ChatMessageRequest {
  model: string;
  messages: Message[];
  stream?: boolean;
  regenerate?: boolean;
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
