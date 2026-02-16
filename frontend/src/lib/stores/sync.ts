import { writable } from 'svelte/store';

export type SyncStatus = 'connected' | 'disconnected' | 'syncing';

export const syncStatus = writable<SyncStatus>('disconnected');
export const connectedDevices = writable<string[]>([]);

const DEVICE_KEY = 'mytrend-device-name';

export function getDeviceName(): string {
  if (typeof window === 'undefined') return 'unknown';
  let name = localStorage.getItem(DEVICE_KEY);
  if (!name) {
    name = `${navigator.platform}-${Date.now().toString(36)}`;
    localStorage.setItem(DEVICE_KEY, name);
  }
  return name;
}

export function setDeviceName(name: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(DEVICE_KEY, name);
}
