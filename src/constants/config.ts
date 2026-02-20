/**
 * App configuration constants
 */

export const STORAGE_KEYS = {
  AUTH_TOKEN: '@owui_auth_token',
  BASE_URL: '@owui_base_url',
  USER: '@owui_user',
  DEFAULT_MODEL: '@owui_default_model',
  THEME_MODE: '@owui_theme_mode',
} as const;

export const API_ENDPOINTS = {
  LOGIN: '/api/v1/auths/signin',
  /** List: GET ?page=1; create: POST /new; get/update: GET/POST /:id */
  CHATS: '/api/v1/chats',
  /** Send/stream messages */
  CHAT_COMPLETIONS: '/api/chat/completions',
  /** Notify backend that a chat completion finished (triggers title generation, etc.) */
  CHAT_COMPLETED: '/api/chat/completed',
  MODELS: '/api/models',
} as const;
