import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import path from 'path';
import { pool } from '../db/pool';

const FONT_DIR = path.resolve(__dirname, '../../assets/fonts');
const eur = new Intl.NumberFormat('hr-HR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money = (n: number) => eur.format(n);

export interface KprEntry {
  rb: number;
  date: string;
  number_full: string;
  description: string;
  cash: number;
  cashless: number;
  total: number;
  cumulative: number;
}

export interface KprRange {
  from?: string; // YYYY-MM-DD, inclusive
  to?: string; // YYYY-MM-DD, inclusive
}

// Knjiga prometa (KPR): chronological record of turnover built automatically
// from issued documents (invoices + storno), split cash / cashless, with a
// running cumulative — exactly what a flat-rate renter must keep.
//
// A date range narrows the WINDOW, not the book: Rb and Kumulativ are still
// counted from 1 January of `year`, seeded from the entries that fall before
// `from`. So a given invoice always carries the same ordinal and the same
// year-to-date cumulative, whichever range you happen to be looking at — which is
// the number the flat-rate turnover threshold is actually measured against.
//
// NOTE: unlike analytics, this deliberately has no doc_type/status filter. Storno
// documents belong in the book (negative total, "STORNO — " prefix); the set is
// keyed off number_full instead.
export async function getKprEntries(
  tenantId: number,
  year: number,
  range: KprRange = {},
): Promise<KprEntry[]> {
  // Seed: everything earlier in the same year. `< from` here and `>= from` below,
  // so the two windows neither overlap nor leave a gap.
  let seedCount = 0;
  let seedSum = 0;
  if (range.from) {
    const [[seed]] = await pool.query<any[]>(
      `SELECT COUNT(*) AS n, COALESCE(SUM(total), 0) AS s
       FROM invoices
       WHERE tenant_id = ? AND number_full IS NOT NULL AND YEAR(issue_date) = ?
         AND issue_date < ?`,
      [tenantId, year, range.from],
    );
    seedCount = Number(seed?.n ?? 0);
    seedSum = Math.round(Number(seed?.s ?? 0) * 100) / 100;
  }

  const params: any[] = [tenantId, year];
  let where = 'tenant_id = ? AND number_full IS NOT NULL AND YEAR(issue_date) = ?';
  if (range.from) {
    where += ' AND issue_date >= ?';
    params.push(range.from);
  }
  if (range.to) {
    where += ' AND issue_date <= ?';
    params.push(range.to);
  }

  const [rows] = await pool.query<any[]>(
    `SELECT number_full, issue_date, issue_datetime, payment_method, total, doc_type, guest_name_cache
     FROM invoices
     WHERE ${where}
     ORDER BY issue_datetime ASC, id ASC`,
    params,
  );

  let cumulative = seedSum;
  return rows.map((r, i) => {
    const total = Number(r.total);
    const isCash = r.payment_method === 'gotovina';
    cumulative = Math.round((cumulative + total) * 100) / 100;
    return {
      rb: seedCount + i + 1,
      date: String(r.issue_date).slice(0, 10),
      number_full: r.number_full,
      description:
        (r.doc_type === 'storno' ? 'STORNO — ' : '') + (r.guest_name_cache || 'Krajnji potrošač'),
      cash: isCash ? total : 0,
      cashless: isCash ? 0 : total,
      total,
      cumulative,
    };
  });
}

// "2026." with no range; "01.07.2026. – 30.09.2026." with one.
export function kprPeriodLabel(year: number, range: KprRange = {}): string {
  if (range.from && range.to) return `${fmtDate(range.from)} – ${fmtDate(range.to)}`;
  if (range.from) return `${year}. — od ${fmtDate(range.from)}`;
  if (range.to) return `${year}. — do ${fmtDate(range.to)}`;
  return `${year}.`;
}

export function kprCsv(entries: KprEntry[]): string {
  const header = ['Rb', 'Datum', 'Broj računa', 'Opis', 'Gotovina', 'Bezgotovinski', 'Ukupno', 'Kumulativ'];
  const rows = entries.map((e) =>
    [e.rb, e.date, e.number_full, e.description, e.cash.toFixed(2), e.cashless.toFixed(2), e.total.toFixed(2), e.cumulative.toFixed(2)]
      .map((c) => `"${String(c).replace(/"/g, '""')}"`)
      .join(';'),
  );
  return '﻿' + [header.map((h) => `"${h}"`).join(';'), ...rows].join('\r\n');
}

// Native .xlsx — amounts are real numbers (Excel applies the user's locale), so
// it opens cleanly on desktop and mobile (Excel / Numbers / Sheets).
export async function renderKprXlsx(
  entries: KprEntry[],
  profileName: string,
  year: number,
  range: KprRange = {},
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Visitors';
  // Sheet name stays the bare year: Excel caps names at 31 chars and forbids
  // / \ ? * [ ] : — the period goes in the title cell instead.
  const ws = wb.addWorksheet(`KPR ${year}`);

  ws.mergeCells('A1:H1');
  const title = ws.getCell('A1');
  title.value = `Knjiga prometa (KPR) — ${kprPeriodLabel(year, range)}`;
  title.font = { bold: true, size: 14 };
  ws.getCell('A2').value = profileName;

  ws.columns = [
    { key: 'rb', width: 6 },
    { key: 'datum', width: 12 },
    { key: 'broj', width: 14 },
    { key: 'opis', width: 30 },
    { key: 'gotovina', width: 13 },
    { key: 'bezgot', width: 15 },
    { key: 'ukupno', width: 13 },
    { key: 'kumulativ', width: 14 },
  ];

  const head = ws.addRow(['Rb', 'Datum', 'Broj računa', 'Opis', 'Gotovina', 'Bezgotovinski', 'Ukupno', 'Kumulativ']);
  head.font = { bold: true };
  const MONEY = '#,##0.00 "€"';
  for (const e of entries) {
    const row = ws.addRow([e.rb, fmtDate(e.date), e.number_full, e.description, e.cash, e.cashless, e.total, e.cumulative]);
    ['E', 'F', 'G', 'H'].forEach((col) => (row.getCell(col).numFmt = MONEY));
  }

  const totalCash = entries.reduce((s, e) => s + e.cash, 0);
  const totalCashless = entries.reduce((s, e) => s + e.cashless, 0);
  const grand = entries.reduce((s, e) => s + e.total, 0);
  const totals = ws.addRow(['', '', '', 'UKUPNO', totalCash, totalCashless, grand, '']);
  totals.font = { bold: true };
  ['E', 'F', 'G'].forEach((col) => (totals.getCell(col).numFmt = MONEY));

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

export async function renderKprPdf(
  entries: KprEntry[],
  profileName: string,
  year: number,
  range: KprRange = {},
): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 36 });
  doc.registerFont('r', path.join(FONT_DIR, 'DejaVuSans.ttf'));
  doc.registerFont('b', path.join(FONT_DIR, 'DejaVuSans-Bold.ttf'));

  const chunks: Buffer[] = [];
  doc.on('data', (c) => chunks.push(c as Buffer));
  const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  doc
    .font('b')
    .fontSize(14)
    .fillColor('#12201d')
    .text(`Knjiga prometa (KPR) — ${kprPeriodLabel(year, range)}`, 36, 36);
  doc.font('r').fontSize(9).fillColor('#5c6b67').text(profileName, 36, 56);

  const cols = [
    { x: 36, w: 30, label: 'Rb', align: 'left' as const },
    { x: 66, w: 62, label: 'Datum', align: 'left' as const },
    { x: 128, w: 80, label: 'Broj', align: 'left' as const },
    { x: 208, w: 230, label: 'Opis', align: 'left' as const },
    { x: 438, w: 90, label: 'Gotovina', align: 'right' as const },
    { x: 528, w: 90, label: 'Bezgotov.', align: 'right' as const },
    { x: 618, w: 90, label: 'Ukupno', align: 'right' as const },
    { x: 708, w: 96, label: 'Kumulativ', align: 'right' as const },
  ];

  let y = 82;
  doc.font('b').fontSize(8.5).fillColor('#5c6b67');
  for (const c of cols) doc.text(c.label, c.x, y, { width: c.w, align: c.align });
  y += 14;
  doc.moveTo(36, y).lineTo(804, y).strokeColor('#e0e6e3').stroke();
  y += 4;

  doc.font('r').fontSize(8.5).fillColor('#12201d');
  for (const e of entries) {
    if (y > 540) {
      doc.addPage();
      y = 40;
    }
    const cells = [String(e.rb), fmtDate(e.date), e.number_full, e.description, money(e.cash), money(e.cashless), money(e.total), money(e.cumulative)];
    cells.forEach((val, i) => doc.text(val, cols[i].x, y, { width: cols[i].w, align: cols[i].align, lineBreak: false }));
    y += 14;
  }

  y += 6;
  doc.moveTo(36, y).lineTo(804, y).strokeColor('#e0e6e3').stroke();
  y += 6;
  const totalCash = entries.reduce((s, e) => s + e.cash, 0);
  const totalCashless = entries.reduce((s, e) => s + e.cashless, 0);
  const grand = entries.reduce((s, e) => s + e.total, 0);
  doc.font('b').fontSize(9).fillColor('#12201d');
  doc.text('UKUPNO', cols[3].x, y, { width: cols[3].w, align: 'right' });
  doc.text(money(totalCash), cols[4].x, y, { width: cols[4].w, align: 'right' });
  doc.text(money(totalCashless), cols[5].x, y, { width: cols[5].w, align: 'right' });
  doc.text(money(grand), cols[6].x, y, { width: cols[6].w, align: 'right' });

  doc.end();
  return done;
}

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}.`;
}
