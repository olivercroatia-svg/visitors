import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2, Mail, MapPin, Hash, Globe } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { formatEur, formatDate } from '@/lib/utils';
import { useTenant } from './api';

export function TenantDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: t, isLoading } = useTenant(Number(id));

  if (isLoading || !t) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <button onClick={() => navigate('/admin')} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Administracija
      </button>

      <div>
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-semibold text-foreground">{t.name}</h2>
          <Badge tone={t.vat_status === 'obveznik' ? 'info' : 'neutral'}>
            {t.vat_status === 'obveznik' ? 'Obveznik PDV-a' : 'Nije obveznik'}
          </Badge>
        </div>
        <p className="text-sm text-muted">Registriran {formatDate(t.created_at)}</p>
      </div>

      <Card className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
        <Meta icon={<Mail className="h-4 w-4" />} label="Vlasnik" value={`${t.owner_name} · ${t.owner_email}`} />
        <Meta icon={<Hash className="h-4 w-4" />} label="OIB" value={t.oib ?? '—'} />
        <Meta icon={<MapPin className="h-4 w-4" />} label="Mjesto" value={t.city ?? '—'} />
        <Meta icon={<Globe className="h-4 w-4" />} label="Strane platforme" value={t.uses_foreign_platforms ? (t.has_vat_id ? 'Da (ima PDV ID)' : 'Da (bez PDV ID-a)') : 'Ne'} />
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Računa (izdano)" value={String(t.invoices.issued)} />
        <Stat label="Promet" value={formatEur(t.invoices.revenue)} />
        <Stat label="Stornirano" value={String(t.invoices.cancelled)} />
        <Stat label="Fisk. na čekanju" value={String(t.invoices.pending_fiscal)} tone={t.invoices.pending_fiscal ? 'warning' : undefined} />
      </div>

      <Card className="p-0">
        <p className="border-b border-border px-4 py-3 text-sm font-semibold text-foreground">Nedavna aktivnost</p>
        <div className="max-h-96 divide-y divide-border overflow-y-auto">
          {t.recent_activity.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted">Nema zabilježene aktivnosti.</p>
          ) : (
            t.recent_activity.map((a, i) => (
              <div key={i} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm text-foreground">{a.action}</p>
                  <p className="truncate text-xs text-muted">{a.user_name ?? 'sustav'}</p>
                </div>
                <span className="shrink-0 text-xs text-muted-2">{formatDate(a.created_at)}</span>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}

function Meta({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 text-muted">{icon}</span>
      <div className="min-w-0">
        <p className="text-xs text-muted">{label}</p>
        <p className="truncate text-sm font-medium text-foreground">{value}</p>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'warning' }) {
  return (
    <Card className="p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-0.5 text-lg font-semibold tnum ${tone === 'warning' ? 'text-warning' : 'text-foreground'}`}>{value}</p>
    </Card>
  );
}
