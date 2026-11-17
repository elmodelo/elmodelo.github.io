import type { LocaleMessages } from '../locales/types';
import type { PreferencesStatus as Status } from '../hooks/usePreferences';
import StatusMessage from './StatusMessage';

interface PreferencesStatusProps {
  messages: LocaleMessages;
  status: Status;
  onRetry: () => void;
}

/** Translate the preferences workflow into generic inline status feedback. */
export default function PreferencesStatus({ messages, status, onRetry }: PreferencesStatusProps) {
  const error = status === 'load-error' || status === 'save-error';
  const message = {
    idle: null,
    loading: messages.loadingPreferences,
    saving: messages.savingPreferences,
    saved: messages.preferencesSaved,
    'load-error': messages.preferencesLoadError,
    'save-error': messages.preferencesSaveError,
  }[status];

  return <StatusMessage
    message={message}
    tone={error ? 'error' : status === 'saved' ? 'success' : 'info'}
    action={error ? { label: messages.retry, onClick: onRetry } : undefined}
  />;
}
