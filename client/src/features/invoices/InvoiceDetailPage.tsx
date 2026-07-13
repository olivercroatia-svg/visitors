import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Loader2,
  Download,
  Ban,
  RefreshCw,
  ShieldCheck,
  AlertTriangle,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input, Field } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { formatEur, formatDate } from '@/lib/utils';
import { ApiError } from '@/lib/api';
import { useInvoice, useStorno, useRetryFiscal, PAYMENT_METHODS, type InvoiceDetail } from './api';
import { InvoiceStatusBadge } from './badges';

export function InvoiceDetailPage() {
  const { id } = useParams();
  const invoiceId = Number(id);
  const navigate = useNavigate();
  const { data: inv, isLoading } = useInvoice(invoiceId);
  const { showSuccess, showError } = useToast();
  const storno = useStorno(invoiceId);
  const retry = useRetryFiscal(invoiceId);
  const [stornoOpen, setStornoOpen] = useState(false);
  const [reason, setReason] = useState('');

  if (isLoading || !inv) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const vatApplicable = Boolean(inv.vat_applicable);
  const isStorno = inv.doc_type === 'storno';
  const canStorno = inv.doc_type === 'invoice' && inv.status === 'issued';

  async function doStorno() {
    if (reason.trim().length < 3) return;
    try {
      const s = await storno.mutateAsync(reason.trim());
      setStornoOpen(false);
      showSuccess('Račun je storniran.');
      navigate(`/racuni/${s.id}`, { replace: true });
    } catch (err) {
      showError(err instanceof ApiError ? err.message : 'Storniranje nije uspjelo.');
    }
  }

  async function doRetry() {
    try {
      const r = await retry.mutateAsync();
      if (r.fiscal_status === 'confirmed') showSuccess('Račun je uspješno fiskaliziran.');
      else showError('Fiskalizacija još nije uspjela — pokušajte ponovno kasnije.');
    } catch (err) {
      showError(err instanceof ApiError ? err.message : 'Greška.');
    }
  }

  return (
    <div className="space-y-4">
      <button
        onClick={() => navigate('/racuni')}
        className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Računi
      </button>

      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold text-foreground">{inv.number_full ?? 'Nacrt'}</h2>
            {isStorno && (
              <span className="rounded bg-danger-soft px-2 py-0.5 text-xs font-medium text-danger">STORNO</span>
            )}
          </div>
          <p className="text-sm text-muted">
            {inv.issue_date ? formatDate(inv.issue_date) : '—'}
            {inv.issue_datetime && ` · ${String(inv.issue_datetime).slice(11, 16)}`}
          </p>
        </div>
        <InvoiceStatusBadge status={inv.status} fiscal={inv.fiscal_status} />
      </div>

      {/* Cancelled / storno cross-links */}
      {inv.status === 'cancelled' && inv.cancelled_by && (
        <Card className="flex items-center gap-3 border-danger/30 bg-danger-soft p-3.5">
          <Ban className="h-5 w-5 shrink-0 text-danger" />
          <p className="flex-1 text-sm text-foreground/80">
            Račun je storniran{inv.cancelled_reason ? ` (${inv.cancelled_reason})` : ''}. Storno dokument:{' '}
            <Link to={`/racuni/${inv.cancelled_by.id}`} className="font-medium text-danger hover:underline">
              {inv.cancelled_by.number_full}
            </Link>
          </p>
        </Card>
      )}
      {isStorno && inv.cancels_invoice_id && (
        <Card className="flex items-center gap-3 p-3.5">
          <p className="flex-1 text-sm text-muted">
            Ovo je storno računa{' '}
            <Link to={`/racuni/${inv.cancels_invoice_id}`} className="font-medium text-primary hover:underline">
              #{inv.cancels_invoice_id}
            </Link>
          </p>
        </Card>
      )}

      {/* Fiscalization block */}
      {inv.fiscal_status === 'pending' ? (
        <Card className="border-warning/30 bg-warning-soft p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 shrink-0 text-warning" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-warning">Fiskalizacija na čekanju</p>
              <p className="mt-0.5 text-xs text-foreground/70">
                Račun je izdan i evidentiran, ali još nije potvrđen od Porezne. Pokrenite naknadnu fiskalizaciju.
              </p>
              <Button size="sm" className="mt-3" onClick={doRetry} loading={retry.isPending}>
                <RefreshCw className="h-4 w-4" /> Naknadna fiskalizacija
              </Button>
            </div>
          </div>
        </Card>
      ) : (
        (inv.jir || inv.zki) && (
          <Card className="p-4">
            <div className="flex items-start gap-4">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-success">
                  <ShieldCheck className="h-4 w-4" /> Fiskalizirano
                </p>
                <dl className="mt-2 space-y-1 text-xs">
                  {inv.jir && (
                    <div>
                      <dt className="text-muted">JIR</dt>
                      <dd className="break-all font-medium text-foreground">{inv.jir}</dd>
                    </div>
                  )}
                  {inv.zki && (
                    <div>
                      <dt className="text-muted">ZKI</dt>
                      <dd className="break-all font-medium text-foreground">{inv.zki}</dd>
                    </div>
                  )}
                </dl>
              </div>
              {inv.qr_data_url && (
                <img src={inv.qr_data_url} alt="QR kod računa" className="h-24 w-24 rounded-lg bg-white p-1" />
              )}
            </div>
          </Card>
        )
      )}

      {/* Meta */}
      <Card className="grid grid-cols-2 gap-3 p-4 text-sm">
        <Meta label="Gost" value={inv.guest_name_cache || 'Krajnji potrošač'} />
        <Meta label="Način plaćanja" value={paymentLabel(inv.payment_method)} />
        <Meta label="Prostor / uređaj" value={`${inv.premise_code ?? '—'} / ${inv.device_code ?? '—'}`} />
        <Meta label="Operater" value={inv.operator_label ?? '—'} />
        {inv.company_name_cache && (
          <div className="col-span-2 border-t border-border pt-3">
            <dt className="text-xs text-muted">Tvrtka (informativno)</dt>
            <dd className="text-sm font-medium text-foreground">{inv.company_name_cache}</dd>
            {companyDetails(inv) && <p className="mt-0.5 text-xs text-muted">{companyDetails(inv)}</p>}
          </div>
        )}
      </Card>

      {/* Items */}
      <Card className="p-4">
        <div className="space-y-2">
          {inv.items.map((it) => (
            <div key={it.id} className="flex items-start justify-between gap-3 border-b border-border pb-2 last:border-0 last:pb-0">
              <div className="min-w-0">
                <p className="text-sm text-foreground">{it.description}</p>
                <p className="text-xs text-muted">
                  {trimNum(it.quantity)} {it.unit} × {formatEur(Number(it.unit_price))}
                  {Number(it.discount_amount) !== 0 && (
                    <span className="text-danger">
                      {' '}
                      · popust {it.discount_type === 'percent' ? `${trimNum(it.discount_value)}%` : ''} −
                      {formatEur(Math.abs(Number(it.discount_amount)))}
                    </span>
                  )}
                  {vatApplicable && ` · PDV ${trimNum(it.vat_rate)}%`}
                </p>
              </div>
              <span className="tnum shrink-0 text-sm font-medium text-foreground">
                {formatEur(Number(it.line_total))}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-3 space-y-1 border-t border-border pt-3 text-sm">
          {Number(inv.discount_total) !== 0 && (
            <>
              <Row label="Osnovica prije popusta" value={formatEur(Number(inv.subtotal_gross))} />
              <Row
                label={inv.discount_type === 'percent' ? `Popust (${trimNum(inv.discount_value)}%)` : 'Popust'}
                value={`−${formatEur(Math.abs(Number(inv.discount_total)))}`}
              />
            </>
          )}
          {(vatApplicable || Number(inv.discount_total) !== 0) && (
            <Row label="Osnovica" value={formatEur(Number(inv.subtotal))} />
          )}
          {vatApplicable && <Row label="PDV" value={formatEur(Number(inv.vat_total))} />}
          <div className="flex items-center justify-between pt-1 text-base font-semibold text-foreground">
            <span>Ukupno</span>
            <span className="tnum">{formatEur(Number(inv.total))}</span>
          </div>
        </div>

        {!vatApplicable && inv.vat_clause && (
          <p className="mt-3 rounded-lg bg-surface-2 p-2.5 text-xs text-muted">{inv.vat_clause}</p>
        )}
      </Card>

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        <a
          href={`/api/invoices/${inv.id}/pdf`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-11 items-center gap-2 rounded-xl border border-border bg-surface px-4 text-sm font-medium text-foreground transition-colors hover:bg-surface-2"
        >
          <Download className="h-4 w-4" /> Preuzmi PDF
        </a>
        {canStorno && (
          <Button variant="danger" onClick={() => setStornoOpen(true)}>
            <Ban className="h-4 w-4" /> Storniraj
          </Button>
        )}
      </div>

      <Modal
        open={stornoOpen}
        onClose={() => setStornoOpen(false)}
        role="alertdialog"
        title="Storniranje računa"
        footer={
          <>
            <Button variant="ghost" onClick={() => setStornoOpen(false)} disabled={storno.isPending}>
              Odustani
            </Button>
            <Button variant="danger" onClick={doStorno} loading={storno.isPending} disabled={reason.trim().length < 3}>
              Storniraj račun
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-muted">
            Storniranjem se izrađuje novi storno dokument koji poništava ovaj račun. Original ostaje evidentiran.
          </p>
          <Field label="Razlog storniranja">
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Npr. pogrešan iznos" autoFocus />
          </Field>
        </div>
      </Modal>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="text-sm font-medium text-foreground">{value}</dd>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-muted">
      <span>{label}</span>
      <span className="tnum">{value}</span>
    </div>
  );
}

function trimNum(n: string): string {
  const v = Number(n);
  return Number.isInteger(v) ? String(v) : String(v);
}

function paymentLabel(m: string): string {
  return PAYMENT_METHODS.find((p) => p.value === m)?.label ?? m;
}

// Reads the invoice's own frozen copy, never the current companies row.
function companyDetails(inv: InvoiceDetail): string {
  return [
    [inv.company_address_cache, [inv.company_postal_code_cache, inv.company_city_cache].filter(Boolean).join(' ')]
      .filter(Boolean)
      .join(', '),
    inv.company_country_cache,
    inv.company_oib_cache ? `OIB: ${inv.company_oib_cache}` : '',
    inv.company_vat_id_cache ? `PDV ID: ${inv.company_vat_id_cache}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}
