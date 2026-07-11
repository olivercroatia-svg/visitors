import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import path from 'path';
import type { Analytics } from './analytics.service';

const FONT_DIR = path.resolve(__dirname, '../../assets/fonts');
const eur = new Intl.NumberFormat('hr-HR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money = (n: number) => eur.format(Number(n));

export interface ExportMeta {
  profileName: string;
  from?: string;
  to?: string;
}

const PAYMENT_LABEL: Record<string, string> = {
  gotovina: 'Gotovina',
  kartica: 'Kartica',
  transakcijski: 'Transakcijski',
  ostalo: 'Ostalo',
};
const CATEGORY_LABEL: Record<string, string> = {
  smjestaj: 'Smještaj',
  standard: 'Standardna',
  snizena_5: 'Snižena 5%',
  oslobodeno: 'Oslobođeno',
};

function periodLabel(meta: ExportMeta): string {
  if (meta.from && meta.to) return `${fmtDate(meta.from)} – ${fmtDate(meta.to)}`;
  if (meta.from) return `od ${fmtDate(meta.from)}`;
  if (meta.to) return `do ${fmtDate(meta.to)}`;
  return 'Cijelo razdoblje';
}

// ---- CSV (detailed rows) ----------------------------------------------------

export function exportCsv(rows: any[]): string {
  const header = ['Broj', 'Datum', 'Gost', 'Prostor', 'Plaćanje', 'Osnovica', 'PDV', 'Ukupno', 'JIR'];
  const lines = rows.map((r) =>
    [
      r.number_full,
      fmtDate(r.issue_date),
      r.guest_name_cache || 'Krajnji potrošač',
      r.premise_code || '',
      PAYMENT_LABEL[r.payment_method] ?? r.payment_method,
      Number(r.subtotal).toFixed(2),
      Number(r.vat_total).toFixed(2),
      Number(r.total).toFixed(2),
      r.jir || '',
    ]
      .map((c) => `"${String(c).replace(/"/g, '""')}"`)
      .join(';'),
  );
  return '﻿' + [header.map((h) => `"${h}"`).join(';'), ...lines].join('\r\n');
}

// ---- XLSX (Sažetak + Računi sheets) ----------------------------------------

export async function exportXlsx(a: Analytics, rows: any[], meta: ExportMeta): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Visitors';

  const s = wb.addWorksheet('Sažetak');
  s.columns = [{ width: 28 }, { width: 16 }, { width: 12 }];
  const titleRow = s.addRow(['Analitika poslovanja']);
  titleRow.font = { bold: true, size: 14 };
  s.addRow([meta.profileName]);
  s.addRow([`Razdoblje: ${periodLabel(meta)}`]);
  s.addRow([]);

  const kpiHeader = s.addRow(['Pokazatelj', 'Vrijednost']);
  kpiHeader.font = { bold: true };
  const kpiRows: [string, number, boolean][] = [
    ['Promet', a.kpis.revenue, true],
    ['Broj računa', a.kpis.invoice_count, false],
    ['Prosječan račun', a.kpis.avg_value, true],
    ['Gosti', a.kpis.unique_guests, false],
    ['Noćenja', a.kpis.total_nights, false],
    ['Gotovina', a.kpis.cash_total, true],
    ['Bezgotovinski', a.kpis.cashless_total, true],
  ];
  for (const [label, val, isMoney] of kpiRows) {
    const row = s.addRow([label, val]);
    if (isMoney) row.getCell(2).numFmt = '#,##0.00 "€"';
  }
  s.addRow([]);

  section(s, 'Promet po mjesecu', ['Mjesec', 'Promet', 'Računa'],
    a.by_month.map((m) => [m.month, m.revenue, m.count]), [false, true, false]);
  section(s, 'Promet po prostoru', ['Prostor', 'Promet', 'Računa'],
    a.by_premise.map((p) => [`${p.premise} (${p.code})`, p.revenue, p.count]), [false, true, false]);
  section(s, 'Po načinu plaćanja', ['Način', 'Promet', 'Računa'],
    a.by_payment.map((p) => [PAYMENT_LABEL[p.method] ?? p.method, p.revenue, p.count]), [false, true, false]);

  // Detailed invoices sheet
  const d = wb.addWorksheet('Računi');
  d.columns = [
    { header: 'Broj', key: 'broj', width: 14 },
    { header: 'Datum', key: 'datum', width: 12 },
    { header: 'Gost', key: 'gost', width: 26 },
    { header: 'Prostor', key: 'prostor', width: 10 },
    { header: 'Plaćanje', key: 'placanje', width: 14 },
    { header: 'Osnovica', key: 'osnovica', width: 12 },
    { header: 'PDV', key: 'pdv', width: 10 },
    { header: 'Ukupno', key: 'ukupno', width: 12 },
    { header: 'JIR', key: 'jir', width: 38 },
  ];
  d.getRow(1).font = { bold: true };
  for (const r of rows) {
    const row = d.addRow({
      broj: r.number_full,
      datum: fmtDate(r.issue_date),
      gost: r.guest_name_cache || 'Krajnji potrošač',
      prostor: r.premise_code || '',
      placanje: PAYMENT_LABEL[r.payment_method] ?? r.payment_method,
      osnovica: Number(r.subtotal),
      pdv: Number(r.vat_total),
      ukupno: Number(r.total),
      jir: r.jir || '',
    });
    ['osnovica', 'pdv', 'ukupno'].forEach((k) => (row.getCell(k).numFmt = '#,##0.00 "€"'));
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

function section(ws: ExcelJS.Worksheet, title: string, headers: string[], data: any[][], moneyCols: boolean[]) {
  const t = ws.addRow([title]);
  t.font = { bold: true };
  const h = ws.addRow(headers);
  h.font = { italic: true, color: { argb: 'FF5C6B67' } };
  for (const r of data) {
    const row = ws.addRow(r);
    moneyCols.forEach((m, i) => {
      if (m) row.getCell(i + 1).numFmt = '#,##0.00 "€"';
    });
  }
  ws.addRow([]);
}

// ---- PDF (summary report) ---------------------------------------------------

export async function exportPdf(a: Analytics, meta: ExportMeta): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: 42 });
  doc.registerFont('r', path.join(FONT_DIR, 'DejaVuSans.ttf'));
  doc.registerFont('b', path.join(FONT_DIR, 'DejaVuSans-Bold.ttf'));
  const chunks: Buffer[] = [];
  doc.on('data', (c) => chunks.push(c as Buffer));
  const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  const left = 42;
  const right = 553;
  doc.font('b').fontSize(16).fillColor('#12201d').text('Analitika poslovanja', left, 42);
  doc.font('r').fontSize(9).fillColor('#5c6b67').text(`${meta.profileName} · ${periodLabel(meta)}`, left, 64);

  let y = 92;
  // KPI grid
  const kpis: [string, string][] = [
    ['Promet', money(a.kpis.revenue) + ' €'],
    ['Broj računa', String(a.kpis.invoice_count)],
    ['Prosječan račun', money(a.kpis.avg_value) + ' €'],
    ['Gosti', String(a.kpis.unique_guests)],
    ['Noćenja', String(a.kpis.total_nights)],
    ['Gotovina / bezgot.', `${money(a.kpis.cash_total)} / ${money(a.kpis.cashless_total)} €`],
  ];
  const colW = (right - left) / 3;
  kpis.forEach((k, i) => {
    const x = left + (i % 3) * colW;
    const ky = y + Math.floor(i / 3) * 46;
    doc.font('r').fontSize(8.5).fillColor('#5c6b67').text(k[0], x, ky);
    doc.font('b').fontSize(13).fillColor('#12201d').text(k[1], x, ky + 12);
  });
  y += 108;

  pdfTable(doc, left, right, y, 'Promet po mjesecu', ['Mjesec', 'Promet', 'Računa'],
    a.by_month.map((m) => [m.month, money(m.revenue) + ' €', String(m.count)]));
  y = doc.y + 16;
  pdfTable(doc, left, right, y, 'Promet po prostoru', ['Prostor', 'Promet', 'Računa'],
    a.by_premise.map((p) => [`${p.premise} (${p.code})`, money(p.revenue) + ' €', String(p.count)]));
  y = doc.y + 16;
  pdfTable(doc, left, right, y, 'Po načinu plaćanja', ['Način', 'Promet', 'Računa'],
    a.by_payment.map((p) => [PAYMENT_LABEL[p.method] ?? p.method, money(p.revenue) + ' €', String(p.count)]));

  doc.end();
  return done;
}

function pdfTable(doc: any, left: number, right: number, y: number, title: string, headers: string[], data: string[][]) {
  if (y > 720) {
    doc.addPage();
    y = 42;
  }
  doc.font('b').fontSize(10).fillColor('#0e7c6b').text(title, left, y);
  y += 16;
  const c1 = left, c2 = 360, c3 = 470;
  doc.font('b').fontSize(8).fillColor('#5c6b67');
  doc.text(headers[0], c1, y);
  doc.text(headers[1], c2, y, { width: 100, align: 'right' });
  doc.text(headers[2], c3, y, { width: right - c3, align: 'right' });
  y += 12;
  doc.moveTo(left, y).lineTo(right, y).strokeColor('#e0e6e3').stroke();
  y += 4;
  doc.font('r').fontSize(9).fillColor('#12201d');
  for (const row of data) {
    doc.text(row[0], c1, y, { width: c2 - c1 - 8, lineBreak: false });
    doc.text(row[1], c2, y, { width: 100, align: 'right' });
    doc.text(row[2], c3, y, { width: right - c3, align: 'right' });
    y += 14;
  }
  doc.y = y;
}

function fmtDate(d?: string | null): string {
  if (!d) return '';
  const [y, m, day] = String(d).slice(0, 10).split('-');
  return `${day}.${m}.${y}.`;
}

export { PAYMENT_LABEL, CATEGORY_LABEL };
