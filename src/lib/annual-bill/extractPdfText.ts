import { PDFParse } from 'pdf-parse';

export async function extractPdfText(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: buffer });
  try {
    const parsed = await parser.getText();
    return parsed.text.replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').trim();
  } finally {
    await parser.destroy();
  }
}
