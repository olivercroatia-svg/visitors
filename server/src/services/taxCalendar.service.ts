import type { ProfileType, VatStatus } from '../types';

export interface Obligation {
  key: string;
  title: string;
  description: string;
  due_date: string; // YYYY-MM-DD
  category: 'porez' | 'pristojba' | 'obrazac' | 'pdv';
}

// IMPORTANT: these are orientational deadlines to help small renters not miss
// obligations. Exact dates/rates vary by JLS and year and are confirmed with an
// accountant / in Phase 0. The UI shows a disclaimer to that effect.
export const CALENDAR_DISCLAIMER =
  'Rokovi su orijentacijski i mogu se razlikovati po općini/gradu i godini. Potvrdite ih s knjigovođom.';

function q(year: number, key: string, title: string, description: string, due: string): Obligation {
  return { key: `${key}-${year}`, title, description, due_date: due, category: obligationCategory(key) };
}

function obligationCategory(key: string): Obligation['category'] {
  if (key.startsWith('pausal')) return 'porez';
  if (key.startsWith('pristojba')) return 'pristojba';
  if (key.startsWith('pdv')) return 'pdv';
  return 'obrazac';
}

function buildForYear(year: number, profileType: ProfileType, vatStatus: VatStatus): Obligation[] {
  const list: Obligation[] = [];

  // Paušalni porez na dohodak — tromjesečno, do kraja tromjesečja.
  const quarters: [string, string][] = [
    [`${year}-03-31`, '1.'],
    [`${year}-06-30`, '2.'],
    [`${year}-09-30`, '3.'],
    [`${year}-12-31`, '4.'],
  ];
  for (let i = 0; i < quarters.length; i++) {
    const [due, label] = quarters[i];
    list.push(
      q(year, `pausal-q${i + 1}`, `Paušalni porez — ${label} tromjesečje`,
        'Tromjesečna rata paušalnog poreza na dohodak i prireza.', due),
    );
  }

  // Turistička pristojba — godišnja paušalna, uobičajeno u ratama.
  for (const [key, due] of [
    ['pristojba-1', `${year}-07-31`],
    ['pristojba-2', `${year}-09-30`],
    ['pristojba-3', `${year}-11-30`],
  ] as const) {
    list.push(q(year, key, 'Turistička pristojba — rata', 'Paušalna godišnja turistička pristojba po krevetu (rata).', due));
  }

  // Godišnji obrazac.
  if (profileType === 'pausalni_obrt') {
    list.push(q(year, 'po-sd', 'PO-SD obrazac', 'Godišnje izvješće o prometu paušalnog obrta za prethodnu godinu.', `${year}-01-15`));
  } else {
    list.push(q(year, 'godisnja-prijava', 'Godišnja prijava / TZ članarina', 'Godišnje obveze za iznajmljivanje (prethodna godina).', `${year}-01-15`));
  }

  // PDV — samo za obveznike: mjesečno do 20.
  if (vatStatus === 'obveznik') {
    for (let m = 1; m <= 12; m++) {
      const mm = String(m).padStart(2, '0');
      list.push(q(year, `pdv-${mm}`, 'PDV obrazac i PDV-S', 'Mjesečni obračun PDV-a i zbirna prijava (do 20. u mjesecu za prethodni mjesec).', `${year}-${mm}-20`));
    }
  }

  return list;
}

// Upcoming obligations within `horizonDays`, from `today` (YYYY-MM-DD).
export function getUpcomingObligations(
  profileType: ProfileType,
  vatStatus: VatStatus,
  today: string,
  horizonDays = 120,
): Obligation[] {
  const year = Number(today.slice(0, 4));
  const all = [...buildForYear(year, profileType, vatStatus), ...buildForYear(year + 1, profileType, vatStatus)];

  const start = daysFromEpoch(today) - 3; // include very-recently-passed
  const end = daysFromEpoch(today) + horizonDays;

  return all
    .filter((o) => {
      const d = daysFromEpoch(o.due_date);
      return d >= start && d <= end;
    })
    .sort((a, b) => a.due_date.localeCompare(b.due_date));
}

export function daysUntil(dueDate: string, today: string): number {
  return daysFromEpoch(dueDate) - daysFromEpoch(today);
}

// Whole-day count from a fixed epoch, TZ-agnostic (parses the date parts).
function daysFromEpoch(isoDate: string): number {
  const [y, m, d] = isoDate.slice(0, 10).split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}
