import { cn } from '@/lib/utils';

export function Brand({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden>
          <path
            d="M7 4h8a3 3 0 0 1 3 3v13l-2.5-1.6L13 20l-1.5-1.5L10 20l-1.5-1.5L6 20V7a3 3 0 0 1 1-3z"
            fill="currentColor"
          />
          <path d="M9 9h6M9 12h6M9 15h3.5" stroke="var(--color-primary)" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </span>
      {!compact && (
        <span className="text-lg font-semibold tracking-tight text-foreground">Visitors</span>
      )}
    </div>
  );
}
