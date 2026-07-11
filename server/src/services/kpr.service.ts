import PDFDocument from 'pdfkit';
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

// Knjiga prometa (KPR): chronological record of turnover built automatically
// from issued documents (invoices + storno), split cash / cashless, with a
// running cumulative — exactly what a flat-rate renter must keep.
export async function getKprEntries(tenantId: number, year: number): Promise<KprEntry[]> {
  const [rows] = await pool.query<any[]>(
    `SELECT number_full, issue_date, issue_datetime, payment_method, total, doc_type, guest_name_cache
     FROM invoices
     WHERE tenant_id = ? AND number_full IS NOT NULL AND YEAR(issue_date) = ?
     ORDER BY issue_datetime ASC, id ASC`,
    [tenantId, year],
  );

  let cumulative = 0;
  return rows.map((r, i) => {
    const total = Number(r.total);
    const isCash = r.payment_method === 'gotovina';
    cumulative = Math.round((cumulative + total) * 100) / 100;
    return {
      rb: i + 1,
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

export function kprCsv(entries: KprEntry[]): string {
  const header = ['Rb', 'Datum', 'Broj računa', 'Opis', 'Gotovina', 'Bezgotovinski', 'Ukupno', 'Kumulativ'];
  const rows = entries.map((e) =>
    [e.rb, e.date, e.number_full, e.description, e.cash.toFixed(2), e.cashless.toFixed(2), e.total.toFixed(2), e.cumulative.toFixed(2)]
      .map((c) => `"${String(c).replace(/"/g, '""')}"`)
      .join(';'),
  );
  return '﻿' + [header.map((h) => `"${h}"`).join(';'), ...rows].join('\r\n');
}

export async function renderKprPdf(
  entries: KprEntry[],
  profileName: string,
  year: number,
): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 36 });
  doc.registerFont('r', path.join(FONT_DIR, 'DejaVuSans.ttf'));
  doc.registerFont('b', path.join(FONT_DIR, 'DejaVuSans-Bold.ttf'));

  const chunks: Buffer[] = [];
  doc.on('data', (c) => chunks.push(c as Buffer));
  const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  doc.font('b').fontSize(14).fillColor('#12201d').text(`Knjiga prometa (KPR) — ${year}`, 36, 36);
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
