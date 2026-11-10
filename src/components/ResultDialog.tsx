import { useEffect, useRef } from 'react';

interface ResultDialogProps {
  title: string;
  message: string;
  closeLabel: string;
  onClose: () => void;
}

export default function ResultDialog({ title, message, closeLabel, onClose }: ResultDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="result-dialog"
      aria-labelledby="result-dialog-title"
      onClose={(event) => {
        // Strict Mode reopens the dialog before the cleanup's queued close
        // event arrives. Only dismiss the result when it is actually closed.
        if (!event.currentTarget.open) onClose();
      }}
    >
      <h2 id="result-dialog-title">{title}</h2>
      <p>{message}</p>
      <form method="dialog">
        <button className="button button-secondary" autoFocus>{closeLabel}</button>
      </form>
    </dialog>
  );
}
