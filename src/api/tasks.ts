/**
 * Tasks API — 1:1 with open-webui src/lib/apis/tasks/index.ts
 */

import { apiClient } from './client';

const PREFIX = '/api/v1/tasks';

export async function checkActiveChats(token: string, chatIds: string[]) {
  return apiClient.request<unknown>(`${PREFIX}/active/chats`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_ids: chatIds }),
  }, token);
}
