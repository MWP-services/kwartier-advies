import { NextResponse } from 'next/server';
import { extractAnnualBillFromPdf } from '@/src/lib/annual-bill';
import { logAnnualBill, annualBillErrorDetails } from '@/src/lib/annual-bill/logging';

export const runtime = 'nodejs';

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
  const requestedTrace = request.headers.get('x-annual-bill-trace-id');
  const traceId = requestedTrace && /^[a-zA-Z0-9-]{1,64}$/.test(requestedTrace) ? requestedTrace : crypto.randomUUID();
  logAnnualBill('upload.received', traceId);

  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      logAnnualBill('upload.rejected', traceId, { reason: 'file_missing' }, 'warn');
      return NextResponse.json({ error: 'Geen PDF ontvangen.' }, { status: 400 });
    }

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      logAnnualBill('upload.rejected', traceId, { reason: 'not_pdf' }, 'warn');
      return NextResponse.json({ error: 'Upload een PDF-jaarnota.' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    logAnnualBill('upload.validated', traceId, { bytes: buffer.byteLength });

    const result = await extractAnnualBillFromPdf(buffer, traceId);
    logAnnualBill('upload.completed', traceId, {
      durationMs: Math.round(performance.now() - startedAt),
      textLength: result.diagnostics.textLength,
      recognizedFields: result.diagnostics.recognizedFields,
      issueCount: result.diagnostics.issueCount,
      aiEnabled: result.diagnostics.aiEnabled,
      aiUsed: result.diagnostics.aiUsed,
      aiWarningCount: result.diagnostics.aiWarnings?.length ?? 0
    });

    return NextResponse.json(result);
  } catch (error) {
    const serialized = serializeError(error);
    logAnnualBill('upload.failed', traceId, { ...annualBillErrorDetails(error), durationMs: Math.round(performance.now() - startedAt) }, 'error');
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

