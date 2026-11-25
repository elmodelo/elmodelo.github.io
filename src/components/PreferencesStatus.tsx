import type { LocaleMessages } from '../locales/types';
import type { PreferencesStatus as Status } from '../hooks/usePreferences';
import { useStatusMessage } from '../hooks/useStatusMessages';
import LoadingDialog from './LoadingDialog';

interface PreferencesStatusProps {
  messages: LocaleMessages;
  status: Status;
  onRetry: () => void;
}

/** Translate the preferences workflow into generic inline status feedback. */
export function preferencesStatusMessage({ messages, status, onRetry }: PreferencesStatusProps) {
  const error = status === 'load-error' || status === 'save-error';
  const message = {
    idle: null,
    loading: null,
    saving: messages.savingPreferences,
    saved: messages.preferencesSaved,
    'load-error': messages.preferencesLoadError,
    'save-error': messages.preferencesSaveError,
  }[status];

  return {
    message,
    tone: error ? 'error' as const : status === 'saved' ? 'success' as const : 'info' as const,
    action: error ? { label: messages.retry, onClick: onRetry } : undefined,
    durationSeconds: status === 'saved' ? 4 : undefined,
  };
}

export default function PreferencesStatus(props: PreferencesStatusProps) {
  useStatusMessage(preferencesStatusMessage(props));
  return <LoadingDialog label={props.messages.loadingPreferences} open={props.status === 'loading'} priority={90} />;
}
