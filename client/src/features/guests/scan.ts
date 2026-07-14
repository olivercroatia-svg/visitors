import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';

/** Mirrors the response of POST /guests/scan. Nothing here has been saved — these are proposals. */
export interface ScanResult {
  fields: Record<string, string | null>;
  document_kind: 'passport' | 'id_card' | 'driving_licence' | 'other';
  mrz_present: boolean;
  mrz_ok: boolean;
  mrz_failed: string[];
  /** Fields the MRZ check digits proved. Everything else is a plausible read, not a proven one. */
  verified_fields: string[];
  /** Country codes we could not confirm against the codebook. */
  unverified_fields: string[];
  notes: string | null;
}

// A phone photo is 3–5 MB, which no JSON body should carry and which the model does not need:
// 1600px on the long edge still resolves the MRZ and the small print. This is what keeps the
// request under the limit, so it is not an optimisation — the feature does not work without it.
const MAX_EDGE = 1600;
const QUALITY = 0.85;

export async function downscaleToBase64(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Fotografiju nije moguće obraditi.');
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', QUALITY),
  );
  if (!blob) throw new Error('Fotografiju nije moguće obraditi.');

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Fotografiju nije moguće pročitati.'));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(blob);
  });

  // Strip the "data:image/jpeg;base64," prefix — the API wants the payload only.
  const comma = dataUrl.indexOf(',');
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
}

export function useScanDocument() {
  // No cache invalidation on purpose: a scan changes nothing on the server, so there is
  // nothing to refetch. It only proposes values for the open form.
  return useMutation({
    mutationFn: (images: string[]) => api.post<ScanResult>('/guests/scan', { images }),
  });
}
