/**
 * App configuration constants
 */

export const STORAGE_KEYS = {
  AUTH_TOKEN: '@owui_auth_token',
  BASE_URL: '@owui_base_url',
  USER: '@owui_user',
} as const;

export const API_ENDPOINTS = {
  LOGIN: '/api/login',
  CHATS: '/api/chats',
  CHAT: '/api/chat',
  MODELS: '/api/models',
} as const;
