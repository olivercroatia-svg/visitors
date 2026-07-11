import { Brand } from '@/components/layout/Brand';
import { ThemeToggle } from '@/components/ThemeToggle';

export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="relative min-h-dvh bg-background">
      {/* Ambient brand wash at the top */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-64 opacity-70"
        style={{
          background:
            'radial-gradient(120% 100% at 50% 0%, color-mix(in srgb, var(--color-primary) 22%, transparent), transparent 70%)',
        }}
        aria-hidden
      />
      <div className="absolute right-4 top-4 safe-t">
        <ThemeToggle />
      </div>

      <div className="relative mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 py-10">
        <div className="mb-8 flex flex-col items-center text-center">
          <Brand />
          <h1 className="mt-6 text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
          {subtitle && <p className="mt-1.5 text-sm text-muted">{subtitle}</p>}
        </div>

        {children}

        {footer && <div className="mt-6 text-center text-sm text-muted">{footer}</div>}
      </div>
    </div>
  );
}
