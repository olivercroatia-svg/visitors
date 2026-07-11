import { ApiError } from './api';

// Robust file download: fetch the resource, then save it via a blob: URL.
// This avoids the fragile `<a href download>` + Content-Disposition path, which
// misbehaves behind the dev proxy and in installed-PWA (standalone) windows —
// Chrome would ignore the filename and save an extensionless, often phantom
// file. A blob: URL is always same-origin, so the `download` name is honoured.
export async function downloadFile(path: string, filename: string): Promise<void> {
  const res = await fetch(`/api${path}`, { credentials: 'include' });
  if (!res.ok) {
    let message = `Preuzimanje nije uspjelo (${res.status}).`;
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, message);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
