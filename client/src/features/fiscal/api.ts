import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

// Mirrors CertView on the server. The .p12 and its password are never sent back to the
// browser — only what the user needs to recognise which certificate is installed.
export interface Certificate {
  configured: boolean;
  filename: string | null;
  environment: 'test' | 'prod';
  subject_oib: string | null;
  valid_from: string | null;
  valid_to: string | null;
  last_verified_at: string | null;
  last_error: string | null;
  expired: boolean;
}

export function useCertificate() {
  return useQuery<Certificate>({
    queryKey: ['fiscal-certificate'],
    queryFn: () => api.get('/fiscal/certificate'),
  });
}

// `me` carries the sequence mark and the operator OIB, so it has to be invalidated
// alongside the certificate itself.
export function useFiscalMutation<TVars>(fn: (vars: TVars) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fiscal-certificate'] });
      qc.invalidateQueries({ queryKey: ['me'] });
    },
  });
}

// The API takes the certificate as base64 in JSON — there is no multipart endpoint.
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Datoteku nije moguće pročitati.'));
    reader.onload = () => {
      const result = String(reader.result);
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.readAsDataURL(file);
  });
}
