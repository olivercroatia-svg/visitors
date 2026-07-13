import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import path from 'path';

const FONT_DIR = path.resolve(__dirname, '../../assets/fonts');
const FONT_REGULAR = path.join(FONT_DIR, 'DejaVuSans.ttf');
const FONT_BOLD = path.join(FONT_DIR, 'DejaVuSans-Bold.ttf');

const eur = new Intl.NumberFormat('hr-HR', { style: 'currency', currency: 'EUR' });
const money = (n: number) => eur.format(Number(n));

interface Profile {
  legal_name: string | null;
  oib: string | null;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  iban: string | null;
  vat_status: string;
}

// Renders a single-page A4 invoice PDF (with embedded Croatian-capable font
// and a verification QR) and resolves to a Buffer.
export async function renderInvoicePdf(invoice: any, profile: Profile): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: 42 });
  doc.registerFont('r', FONT_REGULAR);
  doc.registerFont('b', FONT_BOLD);

  const chunks: Buffer[] = [];
  doc.on('data', (c) => chunks.push(c as Buffer));
  const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  const left = 42;
  const right = 553;
  const isStorno = invoice.doc_type === 'storno';

  // Header — issuer
  doc.font('b').fontSize(15).fillColor('#12201d').text(profile.legal_name ?? 'Obrt', left, 42);
  doc.font('r').fontSize(9).fillColor('#5c6b67');
  const issuerLines = [
    [profile.address, `${profile.postal_code ?? ''} ${profile.city ?? ''}`.trim()].filter(Boolean).join(', '),
    profile.oib ? `OIB: ${profile.oib}` : '',
    profile.iban ? `IBAN: ${profile.iban}` : '',
  ].filter(Boolean);
  doc.text(issuerLines.join('\n'), left, 62);

  // Title block (right)
  doc.font('b').fontSize(18).fillColor('#0e7c6b').text(isStorno ? 'STORNO RAČUNA' : 'RAČUN', 320, 42, {
    width: right - 320,
    align: 'right',
  });
  doc.font('b').fontSize(12).fillColor('#12201d').text(invoice.number_full ?? '—', 320, 66, {
    width: right - 320,
    align: 'right',
  });
  doc.font('r').fontSize(9).fillColor('#5c6b67').text(
    [
      `Datum izdavanja: ${fmtDate(invoice.issue_date)}`,
      invoice.issue_datetime ? `Vrijeme: ${String(invoice.issue_datetime).slice(11, 16)}` : '',
      invoice.due_date ? `Dospijeće: ${fmtDate(invoice.due_date)}` : '',
    ]
      .filter(Boolean)
      .join('\n'),
    320,
    86,
    { width: right - 320, align: 'right' },
  );

  // Buyer band — guest on the left, the guest's company (if any) on the right.
  // The company is informational only; the buyer is still the guest.
  let y = 130;
  doc.moveTo(left, y).lineTo(right, y).strokeColor('#e0e6e3').stroke();
  y += 10;

  const colB = 320;
  doc.font('b').fontSize(9).fillColor('#5c6b67').text('KUPAC', left, y);
  doc.font('r').fontSize(10).fillColor('#12201d').text(
    invoice.guest_name_cache || [invoice.guest_first, invoice.guest_last].filter(Boolean).join(' ') || 'Krajnji potrošač',
    left,
    y + 12,
    { width: colB - left - 12 },
  );

  // 44 is the original fixed height of the guest block. Keeping it as the floor
  // means an invoice without a company renders exactly as it did before.
  let bandH = 44;

  if (invoice.company_name_cache) {
    const colW = right - colB;
    const companyLines = [
      invoice.company_address_cache,
      [invoice.company_postal_code_cache, invoice.company_city_cache].filter(Boolean).join(' '),
      isCroatia(invoice.company_country_cache) ? '' : invoice.company_country_cache,
      invoice.company_oib_cache ? `OIB: ${invoice.company_oib_cache}` : '',
      invoice.company_vat_id_cache ? `PDV ID: ${invoice.company_vat_id_cache}` : '',
    ].filter(Boolean);

    doc.font('b').fontSize(9).fillColor('#5c6b67').text('PODACI O TVRTKI', colB, y, { width: colW });
    doc.font('b').fontSize(10).fillColor('#12201d').text(invoice.company_name_cache, colB, y + 12, { width: colW });
    if (companyLines.length) {
      doc.font('r').fontSize(8.5).fillColor('#5c6b67').text(companyLines.join('\n'), colB, doc.y + 1, { width: colW });
    }
    bandH = Math.max(bandH, doc.y - y + 10);
  }

  y += bandH;

  // Items table. The "Popust" column only exists when the invoice actually has a
  // discount — otherwise the original 5-column grid is used unchanged, so an invoice
  // without a discount renders exactly as it did before this feature.
  const hasDiscount = Number(invoice.discount_total ?? 0) !== 0;
  const cols = hasDiscount
    ? { desc: left, qty: 268, price: 315, discount: 380, vat: 445, vatW: 40, total: 490 }
    : { desc: left, qty: 300, price: 350, discount: 0, vat: 425, vatW: 45, total: 480 };

  doc.font('b').fontSize(8.5).fillColor('#5c6b67');
  doc.text('Opis', cols.desc, y);
  doc.text('Kol.', cols.qty, y, { width: 40, align: 'right' });
  doc.text('Cijena', cols.price, y, { width: 60, align: 'right' });
  if (hasDiscount) doc.text('Popust', cols.discount, y, { width: 60, align: 'right' });
  doc.text('PDV', cols.vat, y, { width: cols.vatW, align: 'right' });
  doc.text('Iznos', cols.total, y, { width: right - cols.total, align: 'right' });
  y += 14;
  doc.moveTo(left, y).lineTo(right, y).strokeColor('#e0e6e3').stroke();
  y += 6;

  doc.font('r').fontSize(9.5).fillColor('#12201d');
  for (const it of invoice.items) {
    const rowH = Math.max(16, doc.heightOfString(it.description, { width: cols.qty - cols.desc - 8 }));
    doc.fillColor('#12201d').text(it.description, cols.desc, y, { width: cols.qty - cols.desc - 8 });
    doc.text(`${trimNum(it.quantity)} ${it.unit}`, cols.qty, y, { width: 40, align: 'right' });
    doc.text(money(it.unit_price), cols.price, y, { width: 60, align: 'right' });
    if (hasDiscount) {
      doc.text(lineDiscountLabel(it), cols.discount, y, { width: 60, align: 'right' });
    }
    doc.text(invoice.vat_applicable ? `${trimNum(it.vat_rate)}%` : '—', cols.vat, y, { width: cols.vatW, align: 'right' });
    doc.text(money(it.line_total), cols.total, y, { width: right - cols.total, align: 'right' });
    y += rowH + 4;
  }

  doc.moveTo(left, y).lineTo(right, y).strokeColor('#e0e6e3').stroke();
  y += 10;

  // Totals. Without a discount these coordinates are the original ones, untouched.
  const totalsX = hasDiscount ? 330 : 360;
  const labelW = hasDiscount ? 130 : 100;

  // The discount rows render for non-VAT payers too, who get no Osnovica/PDV rows —
  // otherwise a flat-rate renter's discount would be invisible on the document.
  if (hasDiscount) {
    doc.font('r').fontSize(9.5).fillColor('#5c6b67');
    doc.text('Osnovica prije popusta:', totalsX, y, { width: labelW, align: 'right' });
    doc.fillColor('#12201d').text(money(invoice.subtotal_gross), 460, y, { width: right - 460, align: 'right' });
    y += 16;
    doc.fillColor('#5c6b67').text(invoiceDiscountLabel(invoice), totalsX, y, { width: labelW, align: 'right' });
    doc
      .fillColor('#12201d')
      .text(`−${money(Math.abs(Number(invoice.discount_total)))}`, 460, y, { width: right - 460, align: 'right' });
    y += 16;
    if (!invoice.vat_applicable) {
      doc.fillColor('#5c6b67').text('Osnovica:', totalsX, y, { width: labelW, align: 'right' });
      doc.fillColor('#12201d').text(money(invoice.subtotal), 460, y, { width: right - 460, align: 'right' });
      y += 16;
    }
  }
  if (invoice.vat_applicable) {
    doc.font('r').fontSize(9.5).fillColor('#5c6b67');
    doc.text('Osnovica:', totalsX, y, { width: labelW, align: 'right' });
    doc.fillColor('#12201d').text(money(invoice.subtotal), 460, y, { width: right - 460, align: 'right' });
    y += 16;
    doc.fillColor('#5c6b67').text('PDV:', totalsX, y, { width: labelW, align: 'right' });
    doc.fillColor('#12201d').text(money(invoice.vat_total), 460, y, { width: right - 460, align: 'right' });
    y += 16;
  }
  doc.font('b').fontSize(12).fillColor('#0e7c6b');
  doc.text('UKUPNO:', totalsX, y, { width: labelW, align: 'right' });
  doc.text(money(invoice.total), 455, y, { width: right - 455, align: 'right' });
  y += 26;

  // VAT exemption clause for non-payers
  if (!invoice.vat_applicable && invoice.vat_clause) {
    doc.font('r').fontSize(8.5).fillColor('#5c6b67').text(invoice.vat_clause, left, y, { width: right - left });
    y += 26;
  }

  doc.font('r').fontSize(9).fillColor('#5c6b67');
  doc.text(`Način plaćanja: ${paymentLabel(invoice.payment_method)}`, left, y);
  y += 14;
  if (invoice.operator_label) {
    doc.text(`Operater: ${invoice.operator_label}`, left, y);
    y += 14;
  }

  // Fiscalization block + QR
  if (invoice.jir || invoice.zki) {
    y += 6;
    doc.moveTo(left, y).lineTo(right, y).strokeColor('#e0e6e3').stroke();
    y += 10;
    doc.font('b').fontSize(8.5).fillColor('#5c6b67').text('FISKALIZACIJA', left, y);
    doc.font('r').fontSize(8.5).fillColor('#12201d');
    if (invoice.jir) doc.text(`JIR: ${invoice.jir}`, left, y + 12);
    if (invoice.zki) doc.text(`ZKI: ${invoice.zki}`, left, y + 24);

    if (invoice.qr) {
      const qrBuf = await QRCode.toBuffer(invoice.qr, { margin: 0, width: 90 });
      doc.image(qrBuf, right - 90, y, { width: 90 });
    }
    y += 44;
  }

  // Footer note (anchored near the bottom, but inside the page margin so the
  // invoice always stays on a single page)
  if (invoice.note && !isStorno) {
    doc.font('r').fontSize(8).fillColor('#8a9793').text(invoice.note, left, 768, {
      width: right - left,
      lineBreak: false,
    });
  }
  doc.font('r').fontSize(7.5).fillColor('#8a9793').text('Izrađeno u Visitors', left, 784, {
    width: right - left,
    lineBreak: false,
  });

  doc.end();
  return done;
}

function fmtDate(d?: string | null): string {
  if (!d) return '—';
  const s = String(d).slice(0, 10);
  const [y, m, day] = s.split('-');
  return `${day}.${m}.${y}.`;
}

// A line's own percentage discount prints as "−10%"; anything else (a fixed amount, or
// a share of a whole-invoice discount pushed down into this line) prints in euros, which
// always reconciles against the line. Storno amounts are negative — show the magnitude,
// the reversal is already visible in the Iznos and UKUPNO columns.
function lineDiscountLabel(it: any): string {
  const amount = Number(it.discount_amount ?? 0);
  if (amount === 0) return '—';
  if (it.discount_type === 'percent') return `−${trimNum(it.discount_value)}%`;
  return `−${money(Math.abs(amount))}`;
}

function invoiceDiscountLabel(invoice: any): string {
  return invoice.discount_type === 'percent'
    ? `Popust (${trimNum(invoice.discount_value)}%):`
    : 'Popust:';
}

// Country is free text (same as guests.country), so match the spellings the app
// already treats as Croatia — it is only printed for foreign companies.
function isCroatia(c?: string | null): boolean {
  if (!c) return true;
  return ['hrvatska', 'hr', 'hrv', 'croatia'].includes(c.trim().toLowerCase());
}

function trimNum(n: any): string {
  const v = Number(n);
  return Number.isInteger(v) ? String(v) : String(v);
}

function paymentLabel(m: string): string {
  return (
    { gotovina: 'Gotovina', kartica: 'Kartica', transakcijski: 'Transakcijski račun', ostalo: 'Ostalo' }[m] ??
    m
  );
}
