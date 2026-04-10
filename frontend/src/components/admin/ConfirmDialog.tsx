import { useEffect, useRef } from "react";

export const FOCUSABLE_SELECTORS =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isPending: boolean;
  error: string | null;
  title: string;
  titleId: string;
  message: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  confirmClassName?: string;
  icon?: React.ReactNode;
}

export default function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  isPending,
  error,
  title,
  titleId,
  message,
  confirmLabel,
  cancelLabel = "Cancel",
  confirmClassName = "btn btn--danger",
  icon,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  // Focus trap: move focus into dialog when it opens
  useEffect(() => {
    if (!isOpen) return;
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS);
    if (focusable && focusable.length > 0) {
      focusable[0].focus();
    }
  }, [isOpen]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "Tab") return;
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS);
    if (!focusable || focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  if (!isOpen) return null;

  return (
    <div
      className="dialog-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      ref={dialogRef}
      onKeyDown={handleKeyDown}
    >
      <div className="dialog">
        {icon && <div className="dialog__icon dialog__icon--warning">{icon}</div>}
        <h2 className="dialog__title" id={titleId}>{title}</h2>
        <p className="dialog__body">{message}</p>
        {error && (
          <p className="dialog__error" role="alert">{error}</p>
        )}
        <div className="dialog__actions">
          <button
            className="btn btn--secondary"
            onClick={onClose}
            disabled={isPending}
          >
            {cancelLabel}
          </button>
          <button
            className={confirmClassName}
            onClick={onConfirm}
            disabled={isPending}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
