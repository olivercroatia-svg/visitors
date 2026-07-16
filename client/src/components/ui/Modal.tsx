import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

// Bottom sheet on mobile, centered dialog on desktop. Closes on Esc / backdrop.
// Backdrop close is opt-out via closeOnBackdrop; Esc always closes.
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  role = 'dialog',
  closeOnBackdrop = true,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
  role?: 'dialog' | 'alertdialog';
  // Forms pass false so a stray click outside can't discard half-typed input.
  closeOnBackdrop?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center sm:items-center"
      role={role}
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={closeOnBackdrop ? onClose : undefined}
      />
      <div
        className={cn(
          'relative z-10 flex max-h-[92dvh] w-full flex-col bg-surface shadow-xl',
          'rounded-t-3xl sm:max-w-lg sm:rounded-2xl',
        )}
      >
        {title && (
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <h2 className="text-base font-semibold text-foreground">{title}</h2>
            <button
              onClick={onClose}
              aria-label="Zatvori"
              className="-mr-1 flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        )}
        <div className="no-scrollbar flex-1 overflow-y-auto px-5 py-4 safe-b">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3.5 safe-b">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
