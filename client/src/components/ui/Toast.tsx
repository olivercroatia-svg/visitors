import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';

type ToastTone = 'success' | 'error' | 'info';
interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
}

interface ToastContextValue {
  showSuccess: (message: string) => void;
  showError: (message: string) => void;
  showInfo: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);
let nextId = 1;

const toneMap: Record<ToastTone, { icon: typeof Info; ring: string }> = {
  success: { icon: CheckCircle2, ring: 'text-success' },
  error: { icon: AlertTriangle, ring: 'text-danger' },
  info: { icon: Info, ring: 'text-info' },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (tone: ToastTone, message: string) => {
      const id = nextId++;
      setToasts((prev) => [...prev, { id, tone, message }]);
      setTimeout(() => remove(id), 4500);
    },
    [remove],
  );

  const value: ToastContextValue = {
    showSuccess: (m) => push('success', m),
    showError: (m) => push('error', m),
    showInfo: (m) => push('info', m),
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-[100] flex flex-col items-center gap-2 p-4 safe-t">
        {toasts.map((t) => {
          const { icon: Icon, ring } = toneMap[t.tone];
          return (
            <div
              key={t.id}
              role="alert"
              className={cn(
                'pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border border-border',
                'bg-surface px-4 py-3 shadow-lg',
              )}
            >
              <Icon className={cn('mt-0.5 h-5 w-5 shrink-0', ring)} />
              <p className="flex-1 text-sm text-foreground">{t.message}</p>
              <button
                onClick={() => remove(t.id)}
                className="text-muted-2 transition-colors hover:text-foreground"
                aria-label="Zatvori"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
