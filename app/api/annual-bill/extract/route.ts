import { NextResponse } from 'next/server';
import { extractAnnualBillFromPdf } from '@/src/lib/annual-bill';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Geen PDF ontvangen.' }, { status: 400 });
    }

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json({ error: 'Upload een PDF-jaarnota.' }, { status: 400 });
    }

    const result = await extractAnnualBillFromPdf(Buffer.from(await file.arrayBuffer()));
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Jaarnota kon niet worden uitgelezen.' },
      { status: 500 }
    );
  }
}

