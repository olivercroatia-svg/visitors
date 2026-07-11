import { Link } from 'react-router-dom';
import { Loader2, Lock, ArrowRight, CircleAlert } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { useOnboarding } from '@/features/onboarding/useOnboarding';
import { InvoiceForm } from './InvoiceForm';

// Phase 2 delivers the GATE. The actual invoice form arrives in Phase 3, but
// the block-until-complete rule is live now so an incomplete profile can never
// reach invoice creation.
export function NewInvoicePage() {
  const { data, isLoading } = useOnboarding();

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (data && !data.canIssueInvoices) {
    const missing = data.steps.filter((s) => s.required && !s.done);
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-foreground">Novi račun</h2>
        <Card className="border-warning/40 bg-warning-soft p-5">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface text-warning">
              <Lock className="h-5 w-5" />
            </span>
            <div>
              <h3 className="text-sm font-semibold text-warning">Izdavanje računa je zaključano</h3>
              <p className="mt-1 text-xs text-foreground/70">
                Da bi vaši računi bili ispravni i fiskalizabilni, prvo dovršite obavezne podatke. Ovime vas
                štitimo od računa s pogreškama.
              </p>
            </div>
          </div>
        </Card>

        <Card className="divide-y divide-border p-0">
          {missing.map((s) => (
            <Link
              key={s.key}
              to={s.href}
              className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-surface-2"
            >
              <CircleAlert className="h-5 w-5 shrink-0 text-warning" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">{s.label}</p>
                <p className="truncate text-xs text-muted">{s.hint}</p>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-muted-2" />
            </Link>
          ))}
        </Card>
      </div>
    );
  }

  // Profile complete → the real invoice form.
  return <InvoiceForm />;
}
