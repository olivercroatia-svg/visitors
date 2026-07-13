// The eVisitor layer is a REPLACEABLE component, exactly like fiscal/: the app only
// ever talks to EVisitorProvider and getEVisitorProvider() picks mock or http by env.
//
// One deliberate difference from FiscalizationProvider: every call takes credentials.
// eVisitor accounts are per-obveznik (each landlord opens their own account and API
// sub-user with their tourist board), so there is no single provider identity.

export type EVisitorOperation = 'checkin' | 'edit' | 'checkout' | 'cancel';
export type Gender = 'muski' | 'zenski';

export interface EVisitorCredentials {
  username: string;
  password: string;
  apikey?: string | null; // eVisitor currently requires this on the test platform only
  baseUrl: string;
}

// One check-in = one tourist = one ID prijave. We generate the GUID ourselves; it has
// been mandatory since 2017-06-01 and is our idempotency key across retries.
export interface EVisitorCheckIn {
  id: string;
  facility: string;
  stayFrom: string; // 'YYYY-MM-DD' — serialized to yyyyMMdd on the wire
  timeStayFrom: string; // 'HH:mm'
  foreseenStayUntil: string;
  timeEstimatedStayUntil: string;
  documentType: string;
  documentNumber: string;
  touristName: string;
  touristMiddleName?: string | null;
  touristSurname: string;
  gender: Gender;
  countryOfBirth: string;
  cityOfBirth?: string | null;
  citizenship: string;
  countryOfResidence: string;
  cityOfResidence: string;
  residenceAddress?: string | null;
  ttPaymentCategory: string;
  arrivalOrganisation: string;
  offeredServiceType: string;
  dateOfBirth: string; // 'YYYY-MM-DD'
  touristEmail?: string | null;
  touristTelephone?: string | null;
  visaType?: string | null;
  visaNumber?: string | null;
  visaValidityDate?: string | null;
  isEdit?: boolean; // -> EditOfExistingCheckIn="true" on the same ImportTourists route
  attempt?: number; // mock-only hint, mirrors FiscalInvoice.attempt
  note?: string | null; // mock-only trigger channel
}

export interface EVisitorCheckOut {
  id: string;
  checkOutDate: string; // 'YYYY-MM-DD'
  checkOutTime: string; // 'HH:mm'
  attempt?: number;
  note?: string | null;
}

export interface EVisitorMessage {
  severity: 'info' | 'warning' | 'error';
  text: string; // verbatim Croatian system message — surfaced to the user, per ch. 4.4.6
}

export interface EVisitorResult {
  status: 'confirmed' | 'failed';
  messages: EVisitorMessage[];
  error?: string;
  // true  -> transport problem (network, 5xx, expired session): re-sending unchanged
  //          may well work, so the request stays queued.
  // false -> business rejection (dupla prijava, category not allowed for the object,
  //          deactivated object): retrying can never succeed and just spams eVisitor,
  //          so the stay is marked failed and the user must fix the data.
  // FiscalizationResult has no equivalent — this is the one thing we do not copy.
  retryable: boolean;
  raw?: string;
}

export type CodebookKind =
  | 'country'
  | 'document_type'
  | 'tt_category'
  | 'settlement'
  | 'visa_type'
  | 'border_crossing'
  | 'arrival_org'
  | 'service_type';

export interface CodebookEntry {
  code: string;
  label: string;
  parentCode?: string | null;
  meta?: Record<string, unknown> | null;
}

export interface EVisitorFacility {
  facilityCode: string;
  name: string;
}

export interface EVisitorProvider {
  readonly name: string;

  // Login + Logout round trip; powers the "Testiraj vezu" button.
  verifyCredentials(creds: EVisitorCredentials): Promise<EVisitorResult>;

  // POST ImportTourists/ {Xml, Register: true}. `items` carries exactly one element in
  // practice: the endpoint accepts a batch, but success is an empty body, so a batch
  // gives us no way to tell WHICH tourist a returned error belongs to. The array shape
  // is kept so a future true-batch mode needs no signature change.
  checkIn(creds: EVisitorCredentials, items: EVisitorCheckIn[]): Promise<EVisitorResult>;

  // POST ImportTouristCheckOut/ {Xml}
  checkOut(creds: EVisitorCredentials, items: EVisitorCheckOut[]): Promise<EVisitorResult>;

  // POST CancelTouristCheckIn {ID} — poništenje prijave.
  cancel(creds: EVisitorCredentials, id: string): Promise<EVisitorResult>;

  fetchCodebook(creds: EVisitorCredentials, kind: CodebookKind): Promise<CodebookEntry[]>;

  // FacilityBrowse — so the landlord picks their objects instead of typing codes.
  fetchFacilities(creds: EVisitorCredentials): Promise<EVisitorFacility[]>;
}
