export interface StatusMessageProps {
  /** Omit the message when idle; the live region stays mounted for announcements. */
  message?: string | null;
  tone?: 'info' | 'success' | 'error';
  action?: {
    label: string;
    onClick: () => void;
    disabled?: boolean;
  };
}

/** Inline workflow feedback. The caller owns wording, visibility, and dismissal timing. */
export default function StatusMessage({ message, tone = 'info', action }: StatusMessageProps) {
  return (
    <div className={`status-message status-message-${tone}`} role="status" aria-live="polite" aria-atomic="true">
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
