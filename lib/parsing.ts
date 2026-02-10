import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import type { IntervalRecord } from './calculations';

export interface ColumnMapping {
  timestamp: string;
  consumptionKwh: string;
  exportKwh?: string;
  pvKwh?: string;
}

export interface ParseResult {
  rows: Record<string, unknown>[];
  headers: string[];
}

export function parseCsv(content: string): ParseResult {
  const parsed = Papa.parse<Record<string, unknown>>(content, {
    header: true,
    skipEmptyLines: true
  });

  if (parsed.errors.length > 0) {
    throw new Error(`CSV parsing failed: ${parsed.errors[0].message}`);
  }

  const headers = parsed.meta.fields ?? [];
  return { rows: parsed.data, headers };
}

export function parseXlsx(arrayBuffer: ArrayBuffer): ParseResult {
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null });
  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
  return { rows, headers };
}

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase();
}

export function autoDetectColumns(headers: string[]): ColumnMapping | null {
  const lookup = new Map(headers.map((header) => [normalizeHeader(header), header]));
  const timestamp = lookup.get('timestamp') ?? lookup.get('date') ?? lookup.get('datetime');
  const consumptionKwh =
    lookup.get('consumption_kwh') ?? lookup.get('consumption') ?? lookup.get('load_kwh');

  if (!timestamp || !consumptionKwh) {
    return null;
  }

  return {
    timestamp,
    consumptionKwh,
    exportKwh: lookup.get('export_kwh'),
    pvKwh: lookup.get('pv_kwh')
  };
}

export function mapRows(rows: Record<string, unknown>[], mapping: ColumnMapping): IntervalRecord[] {
  return rows
    .map((row) => {
      const timestampRaw = row[mapping.timestamp];
      const consumptionRaw = row[mapping.consumptionKwh];
      const exportRaw = mapping.exportKwh ? row[mapping.exportKwh] : undefined;
      const pvRaw = mapping.pvKwh ? row[mapping.pvKwh] : undefined;

      const timestamp = new Date(String(timestampRaw));
      const consumptionKwh = Number(consumptionRaw);

      if (Number.isNaN(timestamp.getTime()) || Number.isNaN(consumptionKwh)) {
        return null;
      }

      return {
        timestamp: timestamp.toISOString(),
        consumptionKwh,
        exportKwh: exportRaw == null ? undefined : Number(exportRaw),
        pvKwh: pvRaw == null ? undefined : Number(pvRaw)
      } satisfies IntervalRecord;
    })
    .filter((row): row is IntervalRecord => row !== null)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}
