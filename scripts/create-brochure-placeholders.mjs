import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { existsSync, writeFileSync } from 'node:fs';

for (const capacity of [5, 10, 15, 20, 30, 40]) {
  const target = `public/assets/${capacity}.pdf`;
  if (existsSync(target)) continue;
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const green = rgb(0.18, 0.37, 0.2);
  page.drawRectangle({ x: 0, y: 605, width: 595, height: 237, color: green });
  page.drawText('WattsNext', { x: 45, y: 775, size: 25, font: bold, color: rgb(1, 1, 1) });
  page.drawText(`Batterijadvies ${capacity} kWh`, { x: 45, y: 700, size: 30, font: bold, color: rgb(1, 1, 1) });
  page.drawText('PLACEHOLDER - PRODUCTBROCHURE VOLGT', { x: 45, y: 650, size: 13, font, color: rgb(1, 1, 1) });
  [
    'Deze pagina reserveert de plek voor de bijpassende brochure.',
    'Er is nog geen definitief merk of model geselecteerd.',
    'De genoemde capaciteit komt uit het indicatieve jaarnota-advies.',
    'Vermogen, uitvoering en installatie worden later vastgesteld.',
    '',
    'Vraag uw adviseur om de definitieve productspecificaties.'
  ].forEach((line, index) => page.drawText(line, { x: 45, y: 545 - index * 30, size: 12, font, color: green }));
  pdf.setTitle(`WattsNext ${capacity} kWh - placeholder brochure`);
  writeFileSync(target, await pdf.save());
}
