import { NextResponse } from 'next/server';
import { autoDetectColumns, parseCsv, parseXlsx } from '@/lib/parsing';
import { storeUploadedDataset } from '@/lib/serverDataStore';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Geen bestand ontvangen.' }, { status: 400 });
    }

    const lowerName = file.name.toLowerCase();
    const parsed = lowerName.endsWith('.csv')
      ? parseCsv(await file.text())
      : parseXlsx(await file.arrayBuffer());

    if (parsed.rows.length === 0 || parsed.headers.length === 0) {
      return NextResponse.json({ error: 'Geen bruikbare rijen of kolommen gevonden.' }, { status: 422 });
    }

    const uploadId = storeUploadedDataset({
      rows: parsed.rows,
      headers: parsed.headers,
      fileName: file.name
    });

    return NextResponse.json({
      uploadId,
      headers: parsed.headers,
      rowCount: parsed.rows.length,
      detectedMapping: autoDetectColumns(parsed.headers)
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Bestand kon niet server-side worden ingelezen.' },
      { status: 500 }
    );
  }
}

