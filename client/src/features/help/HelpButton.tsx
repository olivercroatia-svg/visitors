import { Suspense, lazy, useState } from 'react';
import { HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

// The manual pulls in the markdown renderer — load it only when opened so it
// stays out of the main bundle.
const HelpModal = lazy(() => import('./HelpModal'));

export function HelpButton({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Pomoć"
        title="Pomoć"
        className={cn(
          'inline-flex h-10 w-10 items-center justify-center rounded-xl text-muted transition-colors hover:bg-surface-2 hover:text-foreground',
          className,
        )}
      >
        <HelpCircle className="h-5 w-5" />
      </button>
      {open && (
        <Suspense fallback={null}>
          <HelpModal open={open} onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </>
  );
}
