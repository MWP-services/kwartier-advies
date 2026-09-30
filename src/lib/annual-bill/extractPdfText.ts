import { logAnnualBill, annualBillErrorDetails } from './logging';

export async function extractPdfText(buffer: Buffer, traceId?: string): Promise<string> {
  const startedAt = performance.now();
  let parser: InstanceType<typeof import('pdf-parse')['PDFParse']> | undefined;
  let stage = 'import';
  logAnnualBill('pdf.parser.started', traceId, { bytes: buffer.byteLength });
  try {
    // Keep native/pdf.js loading inside the request's error boundary.
    const { PDFParse } = await import('pdf-parse');
    logAnnualBill('pdf.parser.imported', traceId);
    stage = 'construct';
    parser = new PDFParse({ data: buffer });
    stage = 'get_text';
    const parsed = await parser.getText();
    const text = parsed.text.replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').trim();
    logAnnualBill('pdf.parser.completed', traceId, { textLength: text.length, durationMs: Math.round(performance.now() - startedAt) });
    return text;
  } catch (error) {
    logAnnualBill('pdf.parser.failed', traceId, { stage, ...annualBillErrorDetails(error), durationMs: Math.round(performance.now() - startedAt) }, 'error');
    throw error;
  } finally {
    if (parser) {
      try {
        await parser.destroy();
      } catch (error) {
        // Cleanup must not replace the original extraction error or discard valid text.
        logAnnualBill('pdf.parser.cleanup_failed', traceId, annualBillErrorDetails(error), 'warn');
      }
    }
  }
}
