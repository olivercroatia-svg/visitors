import { Badge } from '@/components/ui/Badge';
import type { EvisitorStatus, StayStatus } from './api';

export function EvisitorBadge({ status }: { status: EvisitorStatus }) {
  switch (status) {
    case 'confirmed':
      return <Badge tone="success">Zaprimljeno u eVisitoru</Badge>;
    case 'pending':
      return <Badge tone="warning">Na čekanju</Badge>;
    case 'failed':
      return <Badge tone="danger">Greška</Badge>;
    default:
      return <Badge tone="neutral">Nije poslano</Badge>;
  }
}

// In a list the business state is what the landlord thinks in ("je li gost prijavljen?"),
// but a transport problem has to win — a stay that never reached eVisitor is not prijavljen,
// no matter what our own status column says.
export function StayStatusBadge({
  status,
  evisitor,
}: {
  status: StayStatus;
  evisitor: EvisitorStatus;
}) {
  if (status === 'cancelled') return <Badge tone="danger">Poništeno</Badge>;
  if (evisitor === 'failed') return <Badge tone="danger">Greška</Badge>;
  if (evisitor === 'pending') return <Badge tone="warning">Na čekanju</Badge>;
  if (status === 'checked_out') return <Badge tone="neutral">Odjavljen</Badge>;
  if (status === 'checked_in') return <Badge tone="success">Prijavljen</Badge>;
  return <Badge tone="neutral">Nacrt</Badge>;
}
