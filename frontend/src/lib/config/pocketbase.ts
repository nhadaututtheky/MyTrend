import PocketBase from 'pocketbase';
import { writable } from 'svelte/store';
import type { User } from '$lib/types';

const PB_URL = import.meta.env.VITE_PB_URL || 'http://localhost:8090';

const pb = new PocketBase(PB_URL);

// Disable auto-cancellation to avoid issues with concurrent requests
pb.autoCancellation(false);

export default pb;

export const currentUser = writable<User | null>(pb.authStore.model as User | null);

pb.authStore.onChange(() => {
  currentUser.set(pb.authStore.model as User | null);
});

export function isAuthenticated(): boolean {
  return pb.authStore.isValid;
}
