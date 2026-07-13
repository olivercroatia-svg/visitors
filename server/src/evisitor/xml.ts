import type { EVisitorCheckIn, EVisitorCheckOut, Gender } from './types';

// eVisitor's import payload is attribute-only XML, so a full XML library would be dead
// weight — we only ever WRITE it. The shape here mirrors the HTZ reference TestData
// files exactly (same root, same namespaces, same prolog).

const XML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
};

export function escapeXml(value: string): string {
  return value
    .replace(/[&<>"']/g, (c) => XML_ESCAPES[c])
    // Control characters are illegal in XML 1.0 and would make the document unparseable
    // on eVisitor's side; guest names pasted from booking sites do contain them.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
}

const GENDER_XML: Record<Gender, string> = { muski: 'muški', zenski: 'ženski' };

// 'YYYY-MM-DD' (and MySQL's 'YYYY-MM-DD HH:mm:ss') -> 'yyyyMMdd'
function toDate8(value: string): string {
  return value.slice(0, 10).replace(/-/g, '');
}

type Attrs = Record<string, string | null | undefined>;

// Optional attributes are omitted entirely rather than sent empty — that is what the
// reference files do (the second sample tourist simply has no VisaType attribute).
function renderAttrs(attrs: Attrs): string {
  return Object.entries(attrs)
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([k, v]) => `${k}="${escapeXml(String(v))}"`)
    .join(' ');
}

function checkInAttrs(item: EVisitorCheckIn): Attrs {
  return {
    ID: item.id,
    EditOfExistingCheckIn: item.isEdit ? 'true' : undefined,
    Facility: item.facility,
    StayFrom: toDate8(item.stayFrom),
    TimeStayFrom: item.timeStayFrom,
    ForeseenStayUntil: toDate8(item.foreseenStayUntil),
    TimeEstimatedStayUntil: item.timeEstimatedStayUntil,
    DocumentType: item.documentType,
    DocumentNumber: item.documentNumber,
    TouristName: item.touristName,
    TouristMiddleName: item.touristMiddleName,
    TouristSurname: item.touristSurname,
    Gender: GENDER_XML[item.gender],
    CountryOfBirth: item.countryOfBirth,
    CityOfBirth: item.cityOfBirth,
    Citizenship: item.citizenship,
    CountryOfResidence: item.countryOfResidence,
    CityOfResidence: item.cityOfResidence,
    ResidenceAddress: item.residenceAddress,
    TTPaymentCategory: item.ttPaymentCategory,
    ArrivalOrganisation: item.arrivalOrganisation,
    OfferedServiceType: item.offeredServiceType,
    DateOfBirth: toDate8(item.dateOfBirth),
    TouristEmail: item.touristEmail,
    TouristTelephone: item.touristTelephone,
    VisaType: item.visaType,
    VisaNumber: item.visaNumber,
    VisaValidityDate: item.visaValidityDate ? toDate8(item.visaValidityDate) : undefined,
  };
}

const NS = 'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"';

export function buildCheckInXml(items: EVisitorCheckIn[]): string {
  const rows = items.map((i) => `\t<TouristCheckIn ${renderAttrs(checkInAttrs(i))} />`).join('\n');
  return `<?xml version="1.0"?>\n<ArrayOfTouristCheckIn ${NS}>\n${rows}\n</ArrayOfTouristCheckIn>`;
}

export function buildCheckOutXml(items: EVisitorCheckOut[]): string {
  const rows = items
    .map((i) =>
      `\t<TouristCheckOut ${renderAttrs({
        ID: i.id,
        CheckOutDate: toDate8(i.checkOutDate),
        CheckOutTime: i.checkOutTime,
      })} />`,
    )
    .join('\n');
  return `<?xml version="1.0"?>\n<ArrayOfTouristCheckOut ${NS}>\n${rows}\n</ArrayOfTouristCheckOut>`;
}
