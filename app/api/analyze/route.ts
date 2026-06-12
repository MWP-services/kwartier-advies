import { NextResponse } from 'next/server';
import type { AnalysisSettings } from '@/lib/analysis';
import type { ColumnMapping } from '@/lib/parsing';
import { runAnalysis } from '@/lib/clientAnalysis';
import { mapRows } from '@/lib/parsing';
import { getUploadedDataset, storeAnalysisResult } from '@/lib/serverDataStore';

export const runtime = 'nodejs';

interface AnalyzeRequestBody {
  uploadId?: string;
  rows?: Record<string, unknown>[];
  mapping?: ColumnMapping;
  settings?: AnalysisSettings;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as AnalyzeRequestBody;

    if ((!Array.isArray(body.rows) && !body.uploadId) || !body.mapping || !body.settings) {
      return NextResponse.json({ error: 'Ongeldige analyse-aanvraag.' }, { status: 400 });
    }

    const rows = body.uploadId ? getUploadedDataset(body.uploadId)?.rows : body.rows;
    if (!rows) {
      return NextResponse.json({ error: 'Upload niet gevonden. Upload het bestand opnieuw.' }, { status: 404 });
    }

    const mappedRows = mapRows(rows, body.mapping);
    const result = runAnalysis(mappedRows, body.settings);

    if (!result) {
      return NextResponse.json({ error: 'Geen bruikbare rijen na normalisatie of filtering.' }, { status: 422 });
    }

    const analysisId = storeAnalysisResult(result);
    return NextResponse.json({ ...result, analysisId });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Analyse op de server is mislukt.' },
      { status: 500 }
    );
  }
}
