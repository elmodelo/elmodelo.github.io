import type { AppSection } from '../components/Menu';

type PanelStorage = Pick<Storage, 'getItem' | 'setItem'>;
const panels = new Set(['transactions', 'net-worth', 'cash-flow', 'uncategorized', 'preferences', 'account']);
const key = (userId: string) => `elmodelo:last-panel:${userId}`;

export function restoreLastPanel(userId: string, pinnedFilterIds: string[], storage?: PanelStorage): AppSection {
  try {
    const target = storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
    const saved = target?.getItem(key(userId));
    if (saved && (panels.has(saved) || pinnedFilterIds.some((id) => saved === `saved-filter:${id}`))) {
      return saved as AppSection;
    }
  } catch {
    // Storage may be unavailable or denied by browser privacy settings.
  }
  return 'transactions';
}

export function rememberLastPanel(userId: string, section: AppSection, storage?: PanelStorage) {
  try {
    const target = storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
    target?.setItem(key(userId), section);
  } catch {
    // Navigation must continue even when local storage is unavailable or full.
  }
}
