import { useEffect, useRef } from 'react';

interface LoadingDialogProps {
  label: string;
}

export default function LoadingDialog({ label }: LoadingDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

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
