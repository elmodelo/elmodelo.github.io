import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';

interface LoadingDialogProps {
  label: string;
  open?: boolean;
  dialogRef?: RefObject<HTMLDialogElement | null>;
}

export default function LoadingDialog({ label, open = true, dialogRef: externalRef }: LoadingDialogProps) {
  const internalRef = useRef<HTMLDialogElement>(null);
  const dialogRef = externalRef ?? internalRef;

  useEffect(() => {
    // Open after parent dialogs finish their layout effects so this loading
    // dialog remains on top when used inside a transaction drill-down.
    const dialog = dialogRef.current;
    if (open && !dialog?.open) dialog?.showModal();
    else if (!open) dialog?.close();
  }, [dialogRef, open]);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    // Close before React removes the dialog, allowing native focus restoration.
    return () => dialog?.close();
  }, [dialogRef]);

  return (
    <dialog
      ref={dialogRef}
      className="LoadingDialog"
      aria-label={label}
      onCancel={(event) => event.preventDefault()}
    >
      <span className="loading-indicator" aria-hidden="true" />
      <p role="status">{label}</p>
    </dialog>
  );
}
