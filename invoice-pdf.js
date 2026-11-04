/* Invoice rendering is deliberately self-contained and runs only in the browser. */
(function (root) {
  async function createInvoicePdf(PDFLib, fields, rows) {
    const { PDFDocument, StandardFonts, rgb } = PDFLib;
    const doc = await PDFDocument.create();
    const regular = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    const wine = rgb(0.40, 0.13, 0.22), ink = rgb(0.15, 0.13, 0.14), muted = rgb(0.43, 0.39, 0.40);
    const pale = rgb(0.97, 0.95, 0.95), rule = rgb(0.88, 0.85, 0.86);
    const width = 595.28, height = 841.89, left = 48, right = width - 48, bottom = 58;
    let page, y;
    const value = key => (fields[key] || '').trim();
    const date = s => /^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s.slice(8,10)}.${s.slice(5,7)}.${s.slice(0,4)}` : s;
    const euro = cents => (cents / 100).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    function text(s, x, baseline, opts = {}) {
      if (!s) return;
      const size = opts.size || 10, font = opts.font || regular;
      let xPos = x;
      if (opts.align === 'right') xPos -= font.widthOfTextAtSize(String(s), size);
      page.drawText(String(s), { x: xPos, y: baseline, font, size, color: opts.color || ink });
    }
    function line(x1, y1, x2, y2, color = rule) { page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: 0.6, color }); }
    function newPage() { page = doc.addPage([width, height]); y = height - 44; }
    function ensure(space) { if (y - space < bottom) newPage(); }
    function wrap(input, maxWidth, font = regular, size = 10) {
      const result = [];
      for (const paragraph of String(input).replace(/\r/g, '').split('\n')) {
        if (!paragraph.trim()) { result.push(''); continue; }
        let current = '';
        for (const word of paragraph.trim().split(/\s+/)) {
          const candidate = current ? current + ' ' + word : word;
          if (font.widthOfTextAtSize(candidate, size) <= maxWidth) { current = candidate; continue; }
          if (current) { result.push(current); current = ''; }
          let part = '';
          for (const char of word) {
            if (part && font.widthOfTextAtSize(part + char, size) > maxWidth) { result.push(part); part = ''; }
            part += char;
          }
          current = part;
        }
        if (current) result.push(current);
      }
      return result;
    }
    function block(input, opts = {}) {
      const size = opts.size || 10, font = opts.font || regular, leading = opts.leading || size + 3;
      for (const piece of wrap(input, opts.width || right - left, font, size)) {
        ensure(leading); text(piece, left, y, { size, font, color: opts.color }); y -= leading;
      }
    }
    function label(s) { ensure(16); text(s, left, y, { size: 8, font: bold, color: wine }); y -= 15; }
    function gap(h) { ensure(h); y -= h; }
    newPage();
    text('RECHNUNG', left, y, { font: bold, size: 23, color: wine }); y -= 16;
    line(left, y, right, y, wine); y -= 19;
    ensure(22); text('VON', left, y, { size: 8, font: bold, color: wine });
    text('AN', 310, y, { size: 8, font: bold, color: wine }); y -= 15;
    const sender = [...wrap(value('senderName'), 215, bold, 10), ...wrap(value('senderAddress'), 215, regular, 10)];
    const recipient = [...wrap(value('recipientName'), 225, bold, 10), ...wrap(value('recipientAddress'), 225, regular, 10)];
    for (let i = 0; i < Math.max(sender.length, recipient.length); i++) {
      ensure(13);
      if (sender[i]) text(sender[i], left, y, { size: 10, font: i === 0 ? bold : regular });
      if (recipient[i]) text(recipient[i], 310, y, { size: 10, font: i === 0 ? bold : regular });
      y -= 13;
    }
    gap(9);
    label('RECHNUNGSDETAILS');
    for (const item of [
      `Rechnungsnummer: ${value('invoiceNumber')}`,
      `Rechnungsdatum: ${value('city') ? value('city') + ', ' : ''}${date(value('invoiceDate'))}`,
      `Leistungszeitraum: ${date(value('periodStart'))} - ${date(value('periodEnd'))}`,
      value('location') ? `Standort: ${value('location')}` : ''
    ]) if (item) block(item, { size: 10, leading: 13 });
    gap(10);
    const x = { date: left + 8, time: 115, course: 161, base: 386, bonus: 460, total: right - 8 };
    function tableHead() {
      ensure(38);
      page.drawRectangle({ x: left, y: y - 22, width: right - left, height: 25, color: wine });
      const o = { size: 8, font: bold, color: rgb(1,1,1) };
      text('DATUM', x.date, y - 14, o); text('ZEIT', x.time, y - 14, o); text('KURS', x.course, y - 14, o);
      text('BASIS EUR', x.base, y - 14, { ...o, align: 'right' }); text('BONUS EUR', x.bonus, y - 14, { ...o, align: 'right' }); text('SUMME EUR', x.total, y - 14, { ...o, align: 'right' });
      y -= 26;
    }
    tableHead();
    rows.forEach((row, index) => {
      const courseLines = wrap(row.course, 139, regular, 9.2);
      let offset = 0, first = true;
      do {
        if (y - 23 < bottom) { newPage(); tableHead(); }
        const available = Math.max(1, Math.floor((y - bottom - 8) / 12));
        const segment = courseLines.slice(offset, offset + available);
        const rowHeight = Math.max(23, segment.length * 12 + 9);
        if (index % 2 === 0) page.drawRectangle({ x: left, y: y - rowHeight, width: right - left, height: rowHeight, color: pale });
        const baseline = y - 15;
        if (first) {
          text(date(row.date), x.date, baseline, { size: 9 }); text(row.time, x.time, baseline, { size: 9 });
          for (const key of ['base','bonus','total']) text(euro(row[key]), x[key], baseline, { size: 9, align: 'right', font: key === 'total' ? bold : regular });
        }
        segment.forEach((part, i) => text(part, x.course, baseline - i * 12, { size: 9.2 }));
        y -= rowHeight; offset += segment.length; first = false;
      } while (offset < courseLines.length);
    });
    const sums = ['base','bonus','total'].map(key => rows.reduce((acc, row) => acc + row[key], 0));
    ensure(64); line(left, y, right, y); y -= 16;
    text(`${rows.length} ${rows.length === 1 ? 'Kurs' : 'Kurse'} gesamt`, x.date, y, { font: bold, size: 9 });
    text(euro(sums[0]), x.base, y, { size: 9, align: 'right' }); text(euro(sums[1]), x.bonus, y, { size: 9, align: 'right' }); text(euro(sums[2]), x.total, y, { size: 9, font: bold, align: 'right' });
    y -= 17; page.drawRectangle({ x: left, y: y - 32, width: right - left, height: 32, color: pale });
    text('GESAMTBETRAG', left + 12, y - 20, { size: 9, font: bold, color: wine });
    text(`${euro(sums[2])} EUR`, right - 12, y - 22, { size: 16, font: bold, color: wine, align: 'right' }); y -= 45;
    if (value('note')) { label('HINWEIS'); block(value('note')); gap(7); }
    if ([value('accountHolder'),value('bank'),value('iban'),value('bic')].some(Boolean)) {
      label('BANKVERBINDUNG');
      block('Bitte überweisen Sie den Gesamtbetrag auf folgendes Konto:');
      for (const item of [value('accountHolder'), value('bank'), value('iban') ? `IBAN: ${value('iban')}` : '', value('bic') ? `BIC: ${value('bic')}` : '']) if (item) block(item);
      gap(7);
    }
    block('Vielen Dank & mit freundlichen Grüßen,'); block(value('senderName'), { font: bold });
    for (const item of [value('phone') ? `Tel: ${value('phone')}` : '', value('email') ? `E-Mail: ${value('email')}` : '', value('taxId') ? `Steuernummer / USt-ID: ${value('taxId')}` : '', value('taxOffice') ? `Finanzamt: ${value('taxOffice')}` : '']) if (item) block(item, { size: 9, color: muted });
    const pages = doc.getPages();
    pages.forEach((p, i) => {
      page = p; line(left, 39, right, 39);
      text('RECHNUNG', left, 26, { size: 7.5, color: muted });
      text(`Seite ${i + 1} / ${pages.length}`, right, 26, { size: 7.5, color: muted, align: 'right' });
    });
    return doc.save();
  }
  root.createInvoicePdf = createInvoicePdf;
})(typeof globalThis !== 'undefined' ? globalThis : window);
