import type { DocumentOcrProvider, OcrContext, OcrResult, ScanImage } from './types';

// Lets the whole flow — camera, tray, MRZ verification, merge, review — be developed and
// demoed without an API key and without spending a cent. Same role MockProvider plays for
// fiscalization.
//
// It models a Croatian ID card on purpose, because that is the document that actually forces
// the two-photo case: the eOI carries the address and the MRZ on the BACK. One photo gives a
// partial read and says so; a second photo completes it. That is the scenario worth rehearsing.

// Real TD1 lines with real check digits — the point is for verifyMrz() to genuinely pass,
// not to be waved through.
const MRZ_BACK = [
  'I<HRV1122334453<<<<<<<<<<<<<<<',
  '9207086F3207073HRV<<<<<<<<<<<6',
  'HORVAT<<ANA<<<<<<<<<<<<<<<<<<<',
];

export class MockOcrProvider implements DocumentOcrProvider {
  readonly name = 'mock';

  async extract(images: ScanImage[], _ctx: OcrContext): Promise<OcrResult> {
    await new Promise((r) => setTimeout(r, 600)); // make the loading state visible

    const hasBack = images.length > 1;

    return {
      document_kind: 'id_card',
      // Front only: no MRZ. The back is where it lives.
      mrz: hasBack ? MRZ_BACK : null,
      fields: {
        first_name: 'Ana',
        last_name: 'Horvat',
        middle_name: null,
        date_of_birth: '1992-07-08',
        gender: 'zenski',
        doc_type: 'osobna',
        doc_number: '112233445',
        // Never guessed — the route fills this only from a synced codebook.
        doc_type_code: null,
        citizenship_code: 'HRV',
        birth_country_code: 'HRV',
        birth_city: 'Zagreb',
        country: 'Hrvatska',

        // These are printed on the reverse of the card.
        residence_country_code: hasBack ? 'HRV' : null,
        residence_city: hasBack ? 'Zagreb' : null,
        residence_address: hasBack ? 'Ilica 42' : null,
      },
      notes: hasBack
        ? null
        : 'Adresa prebivališta i strojno čitljiva zona nisu vidljive — vjerojatno su na poleđini dokumenta.',
    };
  }
}
