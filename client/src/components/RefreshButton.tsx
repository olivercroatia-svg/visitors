import { RotateCw } from 'lucide-react';
import { cn } from '@/lib/utils';

// Full reload — the app is an installable PWA (standalone has no browser chrome),
// so this is the user-facing "refresh". Also picks up a new service-worker build.
export function RefreshButton({ className }: { className?: string }) {
  return (
    <button
      onClick={() => window.location.reload()}
      aria-label="Osvježi"
      title="Osvježi"
      className={cn(
        'inline-flex h-10 w-10 items-center justify-center rounded-xl text-muted transition-colors hover:bg-surface-2 hover:text-foreground',
        className,
      )}
    >
      <RotateCw className="h-5 w-5" />
    </button>
  );
}
