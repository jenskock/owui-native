/**
 * Tools API — 1:1 with open-webui src/lib/apis/tools/index.ts (getTools)
 * Used to list tools that can be enabled/disabled per chat via tool_ids in completions.
 */

import { apiClient } from './client';
import type { Tool } from '../types/api';

const PREFIX = '/api/v1/tools';

export async function getTools(token: string = ''): Promise<Tool[]> {
  const res = await apiClient.request<Tool[]>(`${PREFIX}/`, {
    method: 'GET',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
  }, token || undefined);
  return Array.isArray(res) ? res : [];
}
