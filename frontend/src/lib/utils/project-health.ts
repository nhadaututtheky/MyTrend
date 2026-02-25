export type HealthLevel = 'active' | 'stalling' | 'dormant' | 'unknown';

export interface HealthStatus {
  level: HealthLevel;
  label: string;
  dotColor: string;
}

export function getHealthStatus(lastActivity: string | null): HealthStatus {
  if (!lastActivity) {
    return { level: 'unknown', label: 'No activity', dotColor: 'var(--text-muted)' };
  }
  const days = (Date.now() - new Date(lastActivity).getTime()) / 86_400_000;
  if (days < 3) return { level: 'active', label: 'Active', dotColor: 'var(--accent-green)' };
  if (days < 14) return { level: 'stalling', label: 'Stalling', dotColor: 'var(--accent-yellow)' };
  return { level: 'dormant', label: 'Dormant', dotColor: 'var(--accent-red)' };
}
