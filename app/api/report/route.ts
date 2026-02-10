import { NextResponse } from 'next/server';
import { generateReportPdf, type PdfPayload } from '@/lib/pdf';

export async function POST(request: Request) {
  const payload = (await request.json()) as PdfPayload;
  const bytes = await generateReportPdf(payload);

  return new NextResponse(Buffer.from(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="peak-shaving-report.pdf"'
    }
  });
}
