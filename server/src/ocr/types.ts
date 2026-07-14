// Document OCR is a REPLACEABLE component, for the same reason fiscalization is: the app
// talks only to this interface. Today the concrete provider is a vision model; tomorrow it
// could be a dedicated MRZ/ID service. Callers never learn the difference.
//
// Nothing here persists an image. The route decodes, extracts, and drops the buffer —
// a photographed passport is sensitive personal data, and the cheapest way to protect it
// is never to store it.

export type ScanMediaType = 'image/jpeg' | 'image/png' | 'image/webp';

export interface ScanImage {
  base64: string;
  mediaType: ScanMediaType;
}

/** The guest columns a document can plausibly fill. Anything not visible must stay null. */
export interface ExtractedGuest {
  first_name: string | null;
  last_name: string | null;
  middle_name: string | null;
  date_of_birth: string | null; // YYYY-MM-DD
  gender: 'muski' | 'zenski' | null;
  doc_type: 'osobna' | 'putovnica' | 'ostalo' | null;
  doc_number: string | null;
  /** eVisitor's own code (e.g. "008"). Only ever set from a synced codebook — never guessed. */
  doc_type_code: string | null;
  citizenship_code: string | null; // ISO 3166-1 alpha-3
  birth_country_code: string | null;
  birth_city: string | null;
  residence_country_code: string | null;
  residence_city: string | null;
  residence_address: string | null;
  /** Human-readable country name for the legacy `country` column. */
  country: string | null;
}

export interface OcrResult {
  fields: ExtractedGuest;
  /** Raw MRZ lines, verbatim and uncorrected. null when the document has none / it is not visible. */
  mrz: string[] | null;
  document_kind: 'passport' | 'id_card' | 'driving_licence' | 'other';
  /** What the model could not read, in Croatian, for the user. e.g. "Adresa je vjerojatno na poleđini." */
  notes: string | null;
}

/**
 * Codebooks the provider is allowed to pick codes from. Passed in rather than read inside
 * the provider so the route stays the only thing that touches the database.
 * `synced` is false when we are serving the shipped fallback list — see getCodebook().
 */
export interface OcrContext {
  countries: { code: string; label: string }[];
  countriesSynced: boolean;
  docTypes: { code: string; label: string }[];
  docTypesSynced: boolean;
}

export interface DocumentOcrProvider {
  readonly name: string;
  extract(images: ScanImage[], ctx: OcrContext): Promise<OcrResult>;
}
