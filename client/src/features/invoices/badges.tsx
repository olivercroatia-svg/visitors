import { Badge } from '@/components/ui/Badge';
import type { FiscalStatus, InvoiceStatus } from './api';

export function FiscalBadge({ status }: { status: FiscalStatus }) {
  switch (status) {
    case 'confirmed':
      return <Badge tone="success">Fiskaliziran</Badge>;
    case 'pending':
      return <Badge tone="warning">Fiskalizacija na čekanju</Badge>;
    case 'failed':
      return <Badge tone="danger">Greška fiskalizacije</Badge>;
    case 'not_required':
      return <Badge tone="neutral">Bez fiskalizacije</Badge>;
    default:
      return <Badge tone="neutral">—</Badge>;
  }
}

// Combined status for lists: draft / cancelled take priority, otherwise the
// fiscalization state of an issued invoice.
export function InvoiceStatusBadge({
  status,
  fiscal,
}: {
  status: InvoiceStatus;
  fiscal: FiscalStatus;
}) {
  if (status === 'draft') return <Badge tone="neutral">Nacrt</Badge>;
  if (status === 'cancelled') return <Badge tone="danger">Storniran</Badge>;
  return <FiscalBadge status={fiscal} />;
}
