import type { LocaleMessages } from '../locales/types';
import type { PreferencesStatus as Status } from '../hooks/usePreferences';

interface PreferencesStatusProps {
  messages: LocaleMessages;
  status: Status;
  onRetry: () => void;
}

export default function PreferencesStatus({ messages, status, onRetry }: PreferencesStatusProps) {
  const error = status === 'load-error' || status === 'save-error';
  return (
    <div className={`dashboard-status${error ? ' dashboard-status-error' : ''}`} role="status" aria-live="polite" aria-atomic="true">
      {status === 'loading' && <span>{messages.loadingPreferences}</span>}
      {status === 'saving' && <span>{messages.savingPreferences}</span>}
      {status === 'saved' && <span>✓ {messages.preferencesSaved}</span>}
      {error && <>
        <span>{status === 'load-error' ? messages.preferencesLoadError : messages.preferencesSaveError}</span>
        <button className="button button-secondary" type="button" onClick={onRetry}>{messages.retry}</button>
      </>}
    </div>
  );
}
