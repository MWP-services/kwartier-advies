import { readFileSync, writeFileSync } from 'node:fs';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { PDFParse } from 'pdf-parse';
import { extractMeterTable } from '../src/lib/annual-bill/extractMeterTable';
(async()=>{const pdf=await PDFDocument.create(); const font=await pdf.embedFont(StandardFonts.Helvetica);pdf.addPage([700,1500]).drawText(readFileSync('tests/fixtures/eneco-meter-registers.txt','utf8'),{font,size:10,x:20,y:1470,lineHeight:12}); const parser=new PDFParse({data:await pdf.save()}); const text=(await parser.getText()).text; writeFileSync('.tmp-meter.txt',text); console.log(JSON.stringify(extractMeterTable(text))); await parser.destroy();})();
