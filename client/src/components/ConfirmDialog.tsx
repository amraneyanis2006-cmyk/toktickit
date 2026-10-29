import { useEffect, useRef } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';

// Modal confirmation (ui-spec sec 6/9): focus moves into the dialog, Tab stays
// inside it, Esc cancels, and focus returns to the element that opened it.
// ponytail: custom instead of <dialog>.showModal() because jsdom (the test
// environment) does not implement showModal; switch once it does.
export default function ConfirmDialog({
  title, children, confirmLabel, cancelLabel = 'Never mind', busy = false, onConfirm, onCancel,
}: {
  title: string;
  children?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => opener?.focus();
  }, []);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    } else if (e.key === 'Tab') {
      const buttons = [...(ref.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    }
  };

  return (
    <div className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center p-3" style={{ background: 'rgba(0,0,0,0.4)', zIndex: 1050 }}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title" className="zg-card p-4" style={{ maxWidth: 440 }} onKeyDown={onKeyDown}>
        <p id="confirm-dialog-title" className="fw-semibold mb-2">{title}</p>
        {children}
        <div className="d-flex gap-2 justify-content-end mt-3">
          <button type="button" className="btn btn-sm btn-zg-secondary" onClick={onCancel} disabled={busy}>{cancelLabel}</button>
          <button type="button" className="btn btn-sm btn-zg-destructive" onClick={onConfirm} disabled={busy}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
