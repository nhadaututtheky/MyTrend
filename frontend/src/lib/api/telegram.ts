import pb from '$lib/config/pocketbase';
import type {
  TelegramFile,
  TelegramStatus,
  TelegramUploadResult,
  TelegramChannel,
} from '$lib/types';

export interface TelegramSettings {
  telegram_bot_token: string;
  telegram_channel_id: string;
  telegram_webhook_secret: string;
  env_bot_token_set: boolean;
  env_channel_id_set: boolean;
}

const PB_URL = import.meta.env.VITE_PB_URL || 'http://localhost:8090';

function authHeaders(): Record<string, string> {
  const token = pb.authStore.token;
  return token ? { Authorization: token } : {};
}

export async function getTelegramStatus(): Promise<TelegramStatus> {
  const res = await fetch(`${PB_URL}/api/telegram/status`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Failed to get Telegram status');
  return res.json();
}

export async function testTelegramConnection(): Promise<{
  success: boolean;
  message?: string;
  error?: string;
}> {
  const res = await fetch(`${PB_URL}/api/telegram/test`, {
    method: 'POST',
    headers: authHeaders(),
  });
  return res.json();
}

export async function resolveChannel(): Promise<{ channels: TelegramChannel[] }> {
  const res = await fetch(`${PB_URL}/api/telegram/resolve-channel`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Failed to resolve channel');
  return res.json();
}

export async function uploadToTelegram(
  file: File,
  options?: {
    linkedCollection?: string;
    linkedRecordId?: string;
    caption?: string;
  },
): Promise<TelegramUploadResult> {
  const formData = new FormData();
  formData.append('file', file);
  if (options?.linkedCollection) formData.append('linked_collection', options.linkedCollection);
  if (options?.linkedRecordId) formData.append('linked_record_id', options.linkedRecordId);
  if (options?.caption) formData.append('caption', options.caption);

  const res = await fetch(`${PB_URL}/api/telegram/upload`, {
    method: 'POST',
    headers: authHeaders(),
    body: formData,
  });

  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || 'Upload failed');
  }

  return res.json();
}

export function getTelegramFileUrl(recordId: string): string {
  const token = pb.authStore.token;
  return `${PB_URL}/api/telegram/files/${recordId}?token=${encodeURIComponent(token)}`;
}

export async function getTelegramFileInfo(recordId: string): Promise<TelegramFile> {
  const res = await fetch(`${PB_URL}/api/telegram/files/${recordId}/info`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Failed to get file info');
  return res.json();
}

export async function deleteTelegramFile(recordId: string): Promise<void> {
  const res = await fetch(`${PB_URL}/api/telegram/files/${recordId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Failed to delete file');
}

export async function fetchTelegramFiles(
  linkedCollection?: string,
  linkedRecordId?: string,
  page = 1,
): Promise<{ items: TelegramFile[]; page: number; per_page: number }> {
  const params = new URLSearchParams();
  if (linkedCollection) params.set('linked_collection', linkedCollection);
  if (linkedRecordId) params.set('linked_record_id', linkedRecordId);
  params.set('page', String(page));

  const res = await fetch(`${PB_URL}/api/telegram/files?${params}`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Failed to fetch files');
  return res.json();
}

export async function setupWebhook(
  webhookUrl: string,
): Promise<{ success: boolean; message?: string; error?: string }> {
  const res = await fetch(`${PB_URL}/api/telegram/webhook/setup`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: webhookUrl }),
  });
  return res.json();
}

export async function removeWebhook(): Promise<{ success: boolean }> {
  const res = await fetch(`${PB_URL}/api/telegram/webhook/setup`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  return res.json();
}

export async function getTelegramSettings(): Promise<TelegramSettings> {
  const res = await fetch(`${PB_URL}/api/mytrend/settings/telegram`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Failed to load Telegram settings');
  return res.json();
}

export async function saveTelegramSettings(
  settings: Pick<
    TelegramSettings,
    'telegram_bot_token' | 'telegram_channel_id' | 'telegram_webhook_secret'
  >,
): Promise<{ success: boolean }> {
  const res = await fetch(`${PB_URL}/api/mytrend/settings/telegram`, {
    method: 'PUT',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  });
  if (!res.ok) throw new Error('Failed to save Telegram settings');
  return res.json();
}

export async function sendVibeNotification(
  message: string,
  parseMode: 'Markdown' | 'HTML' = 'Markdown',
): Promise<{ success: boolean; message_id?: number; error?: string }> {
  const res = await fetch(`${PB_URL}/api/telegram/notify`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, parse_mode: parseMode }),
  });
  return res.json();
}

/** Send a content summary to Telegram (idea, conversation, project). */
export async function sendContentToTelegram(
  type: string,
  title: string,
  snippet: string,
  webPath: string,
): Promise<{ success: boolean; error?: string }> {
  const typeEmoji: Record<string, string> = {
    idea: '💡',
    conversation: '💬',
    project: '📁',
    plan: '📋',
  };
  const emoji = typeEmoji[type] ?? '🔗';
  const webUrl = import.meta.env.VITE_WEB_URL || 'http://localhost:5173';
  const lines = [
    `${emoji} <b>${title}</b>`,
    snippet ? `<i>${snippet.slice(0, 200)}</i>` : '',
    `<a href="${webUrl}${webPath}">View in MyTrend</a>`,
  ].filter(Boolean);
  return sendVibeNotification(lines.join('\n'), 'HTML');
}
