import { useEffect } from "react";

export function ConfirmDialog({
  title,
  message,
  confirmLabel = "confirm",
  cancelLabel = "cancel",
  onConfirm,
  onCancel
}: {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  return (
    <div className="overlay">
      <button
        type="button"
        className="overlay-backdrop"
        aria-label="Cancel"
        onClick={onCancel}
      />
      <dialog open className="confirm-dialog" aria-label={title}>
        <div className="confirm-dialog-title">{title}</div>
        <div className="confirm-dialog-message">{message}</div>
        <div className="confirm-dialog-actions">
          <button className="btn btn-sm" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button className="btn btn-sm" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </dialog>
    </div>
  );
}
