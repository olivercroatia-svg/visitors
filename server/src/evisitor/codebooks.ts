import type { CodebookEntry, CodebookKind } from './types';

// eVisitor exposes one lookup resource per coded field. We sync these and send the
// codes back verbatim rather than hardcoding them: pushing a guessed code into a state
// register is worse than refusing to send, and the lists (settlements especially) are
// far too large and too volatile to ship in the repo.
export const CODEBOOK_RESOURCES: Record<CodebookKind, string> = {
  country: 'CountryLookup',
  document_type: 'DocumentTtypeLookup',
  tt_category: 'TTPaymentCategoryLookup',
  settlement: 'SettlementLookup',
  visa_type: 'VisaTypeLookup',
  border_crossing: 'BorderCrossingHRlookup',
  arrival_org: 'ArrivalOrganisationLookup',
  service_type: 'OfferedServiceTypeLookup',
};

export const CODEBOOK_KINDS = Object.keys(CODEBOOK_RESOURCES) as CodebookKind[];

// Ch. 4.3 ties a BP category to the guest's age and eVisitor rejects a mismatch, so the
// age bounds have to live somewhere we can validate against BEFORE sending. The codes
// and letters are from the official codebook list; the bounds come from the category
// names themselves ("Djeca : do 12 godina" etc.). Categories with no age rule are absent.
export const TT_CATEGORY_AGE_RULES: Record<string, { letter: string; minAge?: number; maxAge?: number }> = {
  '1': { letter: 'A', maxAge: 11 }, // Djeca: do 12 godina
  '2': { letter: 'J', minAge: 12, maxAge: 17 }, // Djeca: od navršenih 12-18 godina
  '5': { letter: 'N', maxAge: 29 }, // Osobe do 29 godina: članovi međunarodne omladinske organizacije
};

// ISO 3166-1 alpha-3, which is the form eVisitor's CountryLookup returns
// (CodeThreeLetters). Public, stable data — safe to ship, unlike the codes we cannot know.
// This is a working subset (EU + neighbours + the main source markets); the full list
// replaces it on the first codebook sync.
const COUNTRIES: [string, string][] = [
  ['HRV', 'Hrvatska'], ['AUT', 'Austrija'], ['BEL', 'Belgija'], ['BIH', 'Bosna i Hercegovina'],
  ['BGR', 'Bugarska'], ['MNE', 'Crna Gora'], ['CZE', 'Češka'], ['DNK', 'Danska'],
  ['EST', 'Estonija'], ['FIN', 'Finska'], ['FRA', 'Francuska'], ['GRC', 'Grčka'],
  ['IRL', 'Irska'], ['ITA', 'Italija'], ['ISR', 'Izrael'], ['JPN', 'Japan'],
  ['CAN', 'Kanada'], ['CHN', 'Kina'], ['XKX', 'Kosovo'], ['LVA', 'Latvija'],
  ['LTU', 'Litva'], ['LUX', 'Luksemburg'], ['HUN', 'Mađarska'], ['MKD', 'Sjeverna Makedonija'],
  ['MLT', 'Malta'], ['NLD', 'Nizozemska'], ['NOR', 'Norveška'], ['DEU', 'Njemačka'],
  ['POL', 'Poljska'], ['PRT', 'Portugal'], ['ROU', 'Rumunjska'], ['RUS', 'Rusija'],
  ['USA', 'Sjedinjene Američke Države'], ['SVK', 'Slovačka'], ['SVN', 'Slovenija'],
  ['SRB', 'Srbija'], ['ESP', 'Španjolska'], ['SWE', 'Švedska'], ['CHE', 'Švicarska'],
  ['TUR', 'Turska'], ['UKR', 'Ukrajina'], ['GBR', 'Ujedinjeno Kraljevstvo'],
  ['AUS', 'Australija'], ['KOR', 'Južna Koreja'], ['BRA', 'Brazil'],
];

// eVisitor's own labels are authoritative, but these let the UI render something
// sensible before the first sync and give the mock provider data to serve.
const FALLBACK: Partial<Record<CodebookKind, CodebookEntry[]>> = {
  country: COUNTRIES.map(([code, label]) => ({ code, label })),
  tt_category: [
    { code: '1', label: 'Djeca : do 12 godina', meta: TT_CATEGORY_AGE_RULES['1'] },
    { code: '2', label: 'Djeca : od navršenih 12-18 godina', meta: TT_CATEGORY_AGE_RULES['2'] },
    { code: '4', label: 'Đaci koji nemaju prebivalište u općini ili gradu u kojem se školuju', meta: { letter: 'J' } },
    { code: '5', label: 'Osobe do 29 godina : članovi međunarodne omladinske organizacije', meta: TT_CATEGORY_AGE_RULES['5'] },
    { code: '6', label: 'Osobe koje koriste uslugu noćenja u svom mjestu prebivališta', meta: { letter: 'L' } },
    { code: '7', label: 'Osobe sa tjelesnim invaliditetom 70% i više', meta: { letter: 'B' } },
    { code: '8', label: 'Pratitelj osobe sa tjelesnim invaliditetom 70% i više', meta: { letter: 'B' } },
    { code: '9', label: 'Putnici na putničkom brodu u međunarodnom pomorskom prometu kada se brod nalazi na vezu u luci', meta: { letter: 'H' } },
    { code: '10', label: 'Sezonski radnici', meta: { letter: 'G' } },
    { code: '11', label: 'Studenti koji nemaju prebivalište u općini ili gradu u kojem se školuju', meta: { letter: 'N' } },
    { code: '12', label: 'Sudionici školskih paket aranžmana odobrenih od strane školske ustanove', meta: { letter: 'C' } },
    { code: '13', label: 'Turist koji koristi usluge chartera', meta: { letter: 'N' } },
    { code: '14', label: 'Turist koji boravi u ugostiteljskom objektu', meta: { letter: 'N' } },
    { code: '15', label: 'Osobe koje uslugu noćenja koriste u okviru ostvarivanja programa socijalne skrbi', meta: { letter: 'N' } },
    { code: '16', label: 'Prijatelji i ostale osobe vlasnika kuće ili stana za odmor', meta: { letter: 'N' } },
    { code: '17', label: 'Osobe koje koriste uslugu noćenja u stanu ili kući stanovnika grada ili općine', meta: { letter: 'N' } },
    { code: '18', label: 'Vlasnici kuće za odmor i članovi njegove obitelji', meta: { letter: 'N' } },
  ],
  arrival_org: [
    { code: 'I', label: 'Individualno' },
    { code: 'A', label: 'Organizirano (agencija)' },
  ],
  service_type: [{ code: 'noćenje', label: 'Noćenje' }],
};

export function fallbackCodebook(kind: CodebookKind): CodebookEntry[] {
  return FALLBACK[kind] ?? [];
}
