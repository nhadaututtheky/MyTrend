import { writable, derived } from 'svelte/store';
import pb, { currentUser } from '$lib/config/pocketbase';
import type { User } from '$lib/types';

export { currentUser };

export const isLoggedIn = derived(currentUser, ($user) => $user !== null);

export const authLoading = writable(false);
export const authError = writable<string | null>(null);

export async function login(email: string, password: string): Promise<boolean> {
  authLoading.set(true);
  authError.set(null);

  try {
    await pb.collection('users').authWithPassword(email, password);
    return true;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Login failed';
    authError.set(message);
    return false;
  } finally {
    authLoading.set(false);
  }
}

export async function register(
  email: string,
  password: string,
  displayName: string,
): Promise<boolean> {
  authLoading.set(true);
  authError.set(null);

  try {
    await pb.collection('users').create({
      email,
      password,
      passwordConfirm: password,
      display_name: displayName,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      preferences: { theme: 'light', defaultProject: null, sidebarCollapsed: false },
    });
    // Auto-login after registration
    await pb.collection('users').authWithPassword(email, password);
    return true;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Registration failed';
    authError.set(message);
    return false;
  } finally {
    authLoading.set(false);
  }
}

export async function loginWithTelegramToken(token: string): Promise<boolean> {
  authLoading.set(true);
  authError.set(null);

  try {
    const res = await fetch('/api/auth/telegram/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Verification failed');
    }

    const { email, password } = await res.json();
    await pb.collection('users').authWithPassword(email, password);
    return true;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Login failed';
    authError.set(message);
    return false;
  } finally {
    authLoading.set(false);
  }
}

export function logout(): void {
  pb.authStore.clear();
}

export function getUser(): User | null {
  return pb.authStore.model as User | null;
}
