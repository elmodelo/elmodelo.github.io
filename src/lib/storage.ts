export function readStored<T extends string>(key: string, allowed: readonly T[]): T | null {
  try {
    const value = window.localStorage.getItem(key);
    return allowed.find((option) => option === value) ?? null;
  } catch {
    return null;
  }
}

export function preferenceKey(key: string, userId?: string | null): string {
  return `elmodelo:${userId ? `user:${encodeURIComponent(userId)}` : 'guest'}:${key}`;
}

export function readStoredData<T>(key: string, fallback: T, validate: (value: unknown) => value is T): T {
  try {
    const stored = window.localStorage.getItem(key);
    if (stored === null) return fallback;
    const value: unknown = JSON.parse(stored);
    return validate(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

export function writeStoredData<T>(key: string, value: T) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Keep the in-memory preference when storage is unavailable.
  }
}
