import { NextResponse } from 'next/server';
import { extractAnnualBillFromPdf } from '@/src/lib/annual-bill';

export const runtime = 'nodejs';

function logAnnualBillExtract(message: string, extra?: Record<string, unknown>): void {
  if (extra) {
    console.log(`[annual-bill-extract] ${message}`, extra);
    return;
  }
  console.log(`[annual-bill-extract] ${message}`);
}

function serializeError(error: unknown): { message: string; details: string } {
  if (error instanceof Error) {
    return {
      message: error.message,
      details: error.stack ?? error.message
    };
  }

  return {
    message: 'Jaarnota kon niet worden uitgelezen.',
    details: String(error)
  };
}

export async function POST(request: Request) {
  const startedAt = performance.now();
  logAnnualBillExtract('request received');

  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Geen PDF ontvangen.' }, { status: 400 });
    }

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json({ error: 'Upload een PDF-jaarnota.' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    logAnnualBillExtract('pdf received', { fileName: file.name, bytes: buffer.byteLength });

    const result = await extractAnnualBillFromPdf(buffer);
    logAnnualBillExtract('pdf extracted', {
      fileName: file.name,
      durationMs: Math.round(performance.now() - startedAt),
      textLength: result.diagnostics.textLength,
      recognizedFields: result.diagnostics.recognizedFields,
      issueCount: result.diagnostics.issueCount
    });

    return NextResponse.json(result);
  } catch (error) {
    const serialized = serializeError(error);
    console.error('[annual-bill-extract] failed', serialized.details);
    return NextResponse.json(
      {
        error: serialized.message,
        diagnostics: {
          stage: 'pdf_text_extraction',
          parser: 'pdf-parse',
          details: process.env.NODE_ENV === 'production' ? undefined : serialized.details
        }
      },
      { status: 500 }
    );
  }
}

