import { useRef, useState } from 'react';
import { Camera, Upload, ScanLine, X, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { ApiError } from '@/lib/api';
import { downscaleToBase64, useScanDocument, type ScanResult } from './scan';

const MAX_IMAGES = 3;

interface Shot {
  /** Object URL for the thumbnail. Revoked on removal. */
  preview: string;
  base64: string;
}

/**
 * Reads a guest's ID document and hands the fields to the form. It never saves anything —
 * `onResult` fills the open form and the user then reviews, corrects, and presses Spremi.
 */
export function DocumentScanner({ onResult }: { onResult: (r: ScanResult) => void }) {
  const [shots, setShots] = useState<Shot[]>([]);
  const [result, setResult] = useState<ScanResult | null>(null);
  const { showError, showSuccess } = useToast();
  const scan = useScanDocument();

  const cameraInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  async function addFiles(list: FileList | null, input: HTMLInputElement | null) {
    if (!list || list.length === 0) return;
    const room = MAX_IMAGES - shots.length;
    if (room <= 0) {
      showError(`Najviše ${MAX_IMAGES} fotografije.`);
      return;
    }
    try {
      const picked = Array.from(list).slice(0, room);
      const added = await Promise.all(
        picked.map(async (f) => ({
          preview: URL.createObjectURL(f),
          base64: await downscaleToBase64(f),
        })),
      );
      setShots((s) => [...s, ...added]);
      setResult(null); // the tray changed — the previous read no longer describes it
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Fotografiju nije moguće obraditi.');
    } finally {
      // Reset so picking the same file twice still fires onChange.
      if (input) input.value = '';
    }
  }

  function remove(i: number) {
    setShots((s) => {
      URL.revokeObjectURL(s[i].preview);
      return s.filter((_, idx) => idx !== i);
    });
    setResult(null);
  }

  async function run() {
    try {
      // Always re-reads the whole tray, so adding the back of an ID and pressing again gives
      // the model both sides at once and it merges them itself.
      const r = await scan.mutateAsync(shots.map((s) => s.base64));
      setResult(r);
      onResult(r);
      showSuccess('Podaci su prepoznati.');
    } catch (err) {
      showError(
        err instanceof ApiError
          ? err.message
          : 'Dokument nije moguće prepoznati. Pokušajte s oštrijom fotografijom.',
      );
    }
  }

  return (
    <div className="rounded-xl border border-border bg-surface-2/50 p-3.5">
      <div className="mb-1 flex items-center gap-2">
        <ScanLine className="h-4 w-4 text-primary" />
        <p className="text-sm font-medium text-foreground">Skeniraj dokument</p>
      </div>
      <p className="mb-3 text-xs text-muted">
        Fotografirajte stranicu s podacima. Za osobnu iskaznicu dodajte i poleđinu. Podaci se
        popunjavaju u obrazac — ništa se ne sprema dok ne pritisnete Spremi.
      </p>

      <div className="flex flex-wrap gap-2">
        {/* capture="environment" opens the phone's own camera app: autofocus and full resolution,
            which the MRZ needs. On desktop the attribute is ignored and this is a file picker. */}
        <input
          ref={cameraInput}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => addFiles(e.target.files, cameraInput.current)}
        />
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => addFiles(e.target.files, fileInput.current)}
        />

        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={shots.length >= MAX_IMAGES}
          onClick={() => cameraInput.current?.click()}
        >
          <Camera className="h-4 w-4" /> Fotografiraj
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={shots.length >= MAX_IMAGES}
          onClick={() => fileInput.current?.click()}
        >
          <Upload className="h-4 w-4" /> Učitaj datoteku
        </Button>
      </div>

      {shots.length > 0 && (
        <>
          <div className="mt-3 flex flex-wrap gap-2">
            {shots.map((s, i) => (
              <div key={s.preview} className="relative">
                <img
                  src={s.preview}
                  alt={`Fotografija ${i + 1}`}
                  className="h-20 w-28 rounded-lg border border-border object-cover"
                />
                <button
                  type="button"
                  onClick={() => remove(i)}
                  aria-label={`Ukloni fotografiju ${i + 1}`}
                  className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-danger text-white shadow"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>

          <Button
            type="button"
            size="sm"
            className="mt-3 w-full"
            loading={scan.isPending}
            onClick={run}
          >
            <ScanLine className="h-4 w-4" />
            {result ? 'Prepoznaj ponovno' : 'Prepoznaj podatke'}
          </Button>
        </>
      )}

      {result && <ScanSummary result={result} />}
    </div>
  );
}

/**
 * The review stop. The scan has filled the form and gone no further — this says what was read,
 * what was proven, and what is still missing, so the user knows what to check before saving.
 */
function ScanSummary({ result }: { result: ScanResult }) {
  const filled = Object.values(result.fields).filter((v) => v != null && v !== '').length;
  const warnings: string[] = [];

  if (result.mrz_present && !result.mrz_ok) {
    warnings.push(
      'Strojno čitljiva zona ne prolazi provjeru kontrolnih znamenki. Usporedite broj dokumenta i datum rođenja s dokumentom.',
    );
  }
  if (result.unverified_fields.length > 0) {
    warnings.push('Neke šifre država nisu potvrđene šifrarnikom. Provjerite ih.');
  }
  if (result.notes) warnings.push(result.notes);

  return (
    <div className="mt-3 space-y-2">
      <div className="flex items-start gap-2 rounded-lg border border-success/40 bg-success-soft p-2.5">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
        <p className="text-xs text-foreground">
          Prepoznato {filled} {filled === 1 ? 'polje' : 'polja'}.{' '}
          {result.mrz_ok && result.verified_fields.length > 0 && (
            <>Broj dokumenta i datum rođenja potvrđeni su MRZ zapisom. </>
          )}
          Provjerite podatke i spremite.
        </p>
      </div>

      {warnings.map((w) => (
        <div
          key={w}
          className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning-soft p-2.5"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <p className="text-xs text-foreground">{w}</p>
        </div>
      ))}
    </div>
  );
}
