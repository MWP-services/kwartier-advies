const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);
const DAY_MS = 24 * 60 * 60 * 1000;

function parseNlDateTime(s: string): Date | null {
  // Support: "dd-mm-yyyy hh:mm", "dd-mm-yyyy hh:mm:ss"
  // Also support old style: "dd-mm-yyyy hh:mm tot hh:mm" -> take start
  const start = s.includes(' tot ') ? s.split(' tot ')[0].trim() : s;

  const m = start.match(
    /^(\d{2})-(\d{2})-(\d{4})(?:\s+|T)(\d{2}):(\d{2})(?::(\d{2}))?$/
  );
  if (!m) return null;

  const [, dd, mm, yyyy, HH, MM, SS] = m;
  const d = new Date(
    Number(yyyy),
    Number(mm) - 1,
    Number(dd),
    Number(HH),
    Number(MM),
    SS ? Number(SS) : 0
  );
  return Number.isNaN(d.getTime()) ? null : d;
}

export function parseTimestamp(input: unknown): Date {
  if (input instanceof Date) return input;

  // Excel serial date
  if (typeof input === 'number' && Number.isFinite(input)) {
    return new Date(EXCEL_EPOCH_MS + input * DAY_MS);
  }

  const asString = String(input ?? '').trim();
  if (!asString) return new Date(Number.NaN);

  // Numeric string that looks like Excel serial date
  const numeric = Number(asString);
  if (Number.isFinite(numeric) && /^\d+(\.\d+)?$/.test(asString)) {
    return new Date(EXCEL_EPOCH_MS + numeric * DAY_MS);
  }

  // NL date-time parsing (fix for "19-11-2024 12:45")
  const nl = parseNlDateTime(asString);
  if (nl) return nl;

  // ISO / other parseable formats
  return new Date(asString);
}

export function getLocalDayIso(
  dateInput: Date | string,
  timeZone = 'Europe/Amsterdam'
): string {
  const date = typeof dateInput === 'string' ? parseTimestamp(dateInput) : dateInput;
  if (Number.isNaN(date.getTime())) return '';

  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return `${values.year}-${values.month}-${values.day}`;
}

export function formatTimestamp(dateInput: Date | string): string {
  const date = typeof dateInput === 'string' ? parseTimestamp(dateInput) : dateInput;
  if (Number.isNaN(date.getTime())) return '-';

  const parts = new Intl.DateTimeFormat('nl-NL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Europe/Amsterdam'
  }).formatToParts(date);

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.day}-${values.month}-${values.year} ${values.hour}:${values.minute}`;
}
