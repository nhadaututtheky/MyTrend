import { writable } from 'svelte/store';
import type { Toast, ToastType } from '$lib/types';

const DEFAULT_DURATION = 4000;

function createToastStore() {
  const { subscribe, update } = writable<Toast[]>([]);

  function addToast(type: ToastType, message: string, duration = DEFAULT_DURATION): void {
    const id = crypto.randomUUID();
    const toast: Toast = { id, type, message, duration };

    update((toasts) => [...toasts, toast]);

    setTimeout(() => {
      dismiss(id);
    }, duration);
  }

  function dismiss(id: string): void {
    update((toasts) => toasts.filter((t) => t.id !== id));
  }

  return {
    subscribe,
    success: (message: string, duration?: number) => addToast('success', message, duration),
    error: (message: string, duration?: number) => addToast('error', message, duration),
    info: (message: string, duration?: number) => addToast('info', message, duration),
    warning: (message: string, duration?: number) => addToast('warning', message, duration),
    dismiss,
  };
}

export const toast = createToastStore();
