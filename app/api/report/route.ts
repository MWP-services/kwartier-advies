import { NextResponse } from 'next/server';
import type { PdfPayload } from '@/lib/pdf';
import { generateInteractiveReportHtml } from '@/lib/reportHtml';

export async function POST(request: Request) {
  const payload = (await request.json()) as PdfPayload;
  const html = generateInteractiveReportHtml(payload);

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Disposition': 'attachment; filename="wattsnext-peak-shaving-report.html"'
    }
  });
}
