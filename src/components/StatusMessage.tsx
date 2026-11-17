import type { StatusMessageOptions } from '../lib/statusMessages';

export type StatusMessageProps = Omit<StatusMessageOptions, 'durationSeconds'>;

/** Presentation for an entry published with useStatusMessage. */
export default function StatusMessage({ message, tone = 'info', action }: StatusMessageProps) {
  return (
    <div className={`status-message status-message-${tone}`}>
      {message && <>
        <span>{tone === 'success' && <span aria-hidden="true">✓ </span>}{message}</span>
        {action && <button
          className="button button-secondary"
          type="button"
          onClick={action.onClick}
          disabled={action.disabled}
        >{action.label}</button>}
      </>}
    </div>
  );
}
