import { NextResponse } from 'next/server';
import { generateReportPdf, type PdfPayload } from '@/lib/pdf';
import { generateInteractiveReportHtml } from '@/lib/reportHtml';

export async function POST(request: Request) {
  const payload = (await request.json()) as PdfPayload;
  if (payload.reportVariant === 'financial') {
    const pdf = await generateReportPdf(payload);
    return new NextResponse(Buffer.from(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="wattsnext-pv-financial-report.pdf"'
      }
    });
  }

  let html: string;
  try {
    html = generateInteractiveReportHtml(payload);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Het rapport kon niet worden gemaakt.' }, { status: 400 });
  }
  const filename =
    payload.analysisType === 'PV_SELF_CONSUMPTION'
      ? 'wattsnext-pv-report.html'
      : 'wattsnext-peak-shaving-report.html';

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`
    }
  });
}
