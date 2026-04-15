import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import type { IntervalRecord } from './calculations';
import { parseTimestamp } from './datetime';

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
  return header
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

export function autoDetectColumns(headers: string[]): ColumnMapping | null {
  const lookup = new Map(headers.map((header) => [normalizeHeader(header), header]));
  const findHeader = (candidates: string[]): string | undefined =>
    candidates.map((candidate) => lookup.get(normalizeHeader(candidate))).find((value) => value != null);

  const timestamp = findHeader([
    'timestamp',
    'datetime',
    'date',
    'tijdstip',
    'tijd',
    'datum',
    'date_time',
    'meter_datetime'
  ]);
  const consumptionKwh = findHeader([
    'consumption_kwh',
    'verbruik_kwh',
    'afname_kwh',
    'load_kwh',
    'consumption',
    'verbruik',
    'import_kwh',
    'afname',
    'load'
  ]);

  if (!timestamp || !consumptionKwh) {
    return null;
  }

  return {
    timestamp,
    consumptionKwh,
    exportKwh: findHeader([
      'export_kwh',
      'teruglevering_kwh',
      'injectie_kwh',
      'export',
      'teruglever_kwh',
      'teruglevering',
      'injectie'
    ]),
    pvKwh: findHeader([
      'pv_kwh',
      'opwek_kwh',
      'productie_kwh',
      'solar_kwh',
      'pv',
      'generation_kwh',
      'opbrengst_kwh',
      'opwek',
      'productie'
    ])
  };
}

function parseNumericCell(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return Number(value);

  const trimmed = value.trim();
  if (!trimmed) return Number.NaN;

  const normalized = trimmed
    .replace(/\s/g, '')
    .replace(/\.(?=\d{3}(?:\D|$))/g, '')
    .replace(/,(?=\d{3}(?:\D|$))/g, '')
    .replace(',', '.');

  return Number(normalized);
}

export function mapRows(rows: Record<string, unknown>[], mapping: ColumnMapping): IntervalRecord[] {
  const mapped: IntervalRecord[] = [];

  rows.forEach((row) => {
    const timestampRaw = row[mapping.timestamp];
    const consumptionRaw = row[mapping.consumptionKwh];
    const exportRaw = mapping.exportKwh ? row[mapping.exportKwh] : undefined;
    const pvRaw = mapping.pvKwh ? row[mapping.pvKwh] : undefined;

    const timestamp = parseTimestamp(timestampRaw);
    const consumptionKwh = parseNumericCell(consumptionRaw);

    if (Number.isNaN(timestamp.getTime()) || Number.isNaN(consumptionKwh)) {
      return;
    }

    const parsedExport = exportRaw == null ? undefined : parseNumericCell(exportRaw);
    const parsedPv = pvRaw == null ? undefined : parseNumericCell(pvRaw);

    mapped.push({
      timestamp: timestamp.toISOString(),
      consumptionKwh,
      exportKwh: Number.isNaN(parsedExport) ? undefined : parsedExport,
      pvKwh: Number.isNaN(parsedPv) ? undefined : parsedPv
    });
  });

  return mapped.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}
