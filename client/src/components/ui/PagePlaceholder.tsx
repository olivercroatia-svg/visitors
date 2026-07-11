import { Construction } from 'lucide-react';
import { Card } from './Card';

// Honest "coming in a later phase" state — keeps unbuilt routes looking
// intentional instead of blank while the foundation is in place.
export function PagePlaceholder({
  title,
  description,
  phase,
}: {
  title: string;
  description: string;
  phase?: string;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-foreground">{title}</h2>
      </div>
      <Card className="flex flex-col items-center gap-3 px-6 py-12 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-2 text-muted">
          <Construction className="h-6 w-6" />
        </span>
        <p className="max-w-sm text-sm text-muted">{description}</p>
        {phase && (
          <span className="rounded-full bg-accent/15 px-3 py-1 text-xs font-medium text-accent">
            {phase}
          </span>
        )}
      </Card>
    </div>
  );
}
