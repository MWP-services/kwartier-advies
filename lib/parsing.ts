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
  let bestRows: Record<string, unknown>[] = [];
  let bestHeaders: string[] = [];
  let bestScore = -1;

  workbook.SheetNames.forEach((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null });
    const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
    const score = headers.length * 1000 + rows.length;

    if (score > bestScore) {
      bestRows = rows;
      bestHeaders = headers;
      bestScore = score;
    }
  });

  return { rows: bestRows, headers: bestHeaders };
}

function normalizeHeader(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

const TIMESTAMP_HEADER_CANDIDATES = [
  'timestamp',
  'datetime',
  'date',
  'date time',
  'date/time',
  'tijdstip',
  'tijd',
  'datum',
  'datum tijd',
  'datum tijd tot',
  'datumtijdtot',
  'van',
  'tot',
  'date_time',
  'meter_datetime'
];

const CONSUMPTION_HEADER_CANDIDATES = [
  'consumption_kwh',
  'verbruik_kwh',
  'afname_kwh',
  'load_kwh',
  'consumption',
  'verbruik',
  'verbruik (kwh)',
  'import_kwh',
  'afname',
  'load'
];

const EXPORT_HEADER_CANDIDATES = [
  'export_kwh',
  'teruglevering_kwh',
  'injectie_kwh',
  'export',
  'teruglever_kwh',
  'teruglevering',
  'teruglevering (kwh)',
  'injectie'
];

const PV_HEADER_CANDIDATES = [
  'pv_kwh',
  'opwek_kwh',
  'productie_kwh',
  'solar_kwh',
  'pv',
  'generation_kwh',
  'opbrengst_kwh',
  'opwek',
  'productie'
];

function matchesAnyHeaderCandidate(header: string, candidates: string[]): boolean {
  const normalized = normalizeHeader(header);
  return candidates.some((candidate) => normalizeHeader(candidate) === normalized);
}

export function isLikelyPvHeader(header: string): boolean {
  return matchesAnyHeaderCandidate(header, PV_HEADER_CANDIDATES);
}

export function hasLikelyPvHeader(headers: string[]): boolean {
  return headers.some((header) => isLikelyPvHeader(header));
}

export function autoDetectColumns(headers: string[]): ColumnMapping | null {
  const lookup = new Map(headers.map((header) => [normalizeHeader(header), header]));
  const findHeader = (candidates: string[]): string | undefined =>
    candidates.map((candidate) => lookup.get(normalizeHeader(candidate))).find((value) => value != null);

  const timestamp = findHeader(TIMESTAMP_HEADER_CANDIDATES);
  const consumptionKwh = findHeader(CONSUMPTION_HEADER_CANDIDATES);

  if (!timestamp || !consumptionKwh) {
    return null;
  }

  return {
    timestamp,
    consumptionKwh,
    exportKwh: findHeader(EXPORT_HEADER_CANDIDATES),
    pvKwh: findHeader(PV_HEADER_CANDIDATES)
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
