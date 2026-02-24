const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);
const DAY_MS = 24 * 60 * 60 * 1000;
const QUARTER_MS = 15 * 60 * 1000;
const SOURCE_TIME_ZONE = 'Europe/Amsterdam';

interface DateParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function partsToUtcMs(parts: DateParts): number {
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second, 0);
}

function getZonedParts(date: Date, timeZone: string): DateParts {
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    hourCycle: 'h23',
    timeZone
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second)
  };
}

function makeDateInTimeZone(parts: DateParts, timeZone: string): Date {
  // Parse Excel local timestamps as local time; fix DST/UTC shift.
  let utcMs = partsToUtcMs(parts);

  // Iteratively align the formatted wall time in the target timezone to the requested local parts.
  for (let i = 0; i < 3; i += 1) {
    const actual = getZonedParts(new Date(utcMs), timeZone);
    const diffMs = partsToUtcMs(parts) - partsToUtcMs(actual);
    if (diffMs === 0) break;
    utcMs += diffMs;
  }

  return new Date(utcMs);
}

function parseExcelSerialDate(serial: number): Date {
  // Excel floating point drift fix: snap to the nearest quarter hour for kwartierdata.
  const naiveMs = EXCEL_EPOCH_MS + serial * DAY_MS;
  const snappedNaiveMs = Math.round(naiveMs / QUARTER_MS) * QUARTER_MS;
  const naiveUtc = new Date(snappedNaiveMs);

  return makeDateInTimeZone(
    {
      year: naiveUtc.getUTCFullYear(),
      month: naiveUtc.getUTCMonth() + 1,
      day: naiveUtc.getUTCDate(),
      hour: naiveUtc.getUTCHours(),
      minute: naiveUtc.getUTCMinutes(),
      second: naiveUtc.getUTCSeconds()
    },
    SOURCE_TIME_ZONE
  );
}

function parseNlDateTime(s: string): Date | null {
  // Support: "dd-mm-yyyy hh:mm", "dd-mm-yyyy hh:mm:ss"
  // Also support old style: "dd-mm-yyyy hh:mm tot hh:mm" -> take start
  const start = s.includes(' tot ') ? s.split(' tot ')[0].trim() : s;

  const m = start.match(
    /^(\d{2})-(\d{2})-(\d{4})(?:\s+|T)(\d{2}):(\d{2})(?::(\d{2}))?$/
  );
  if (!m) return null;

  const [, dd, mm, yyyy, HH, MM, SS] = m;
  const d = makeDateInTimeZone(
    {
      year: Number(yyyy),
      month: Number(mm),
      day: Number(dd),
      hour: Number(HH),
      minute: Number(MM),
      second: SS ? Number(SS) : 0
    },
    SOURCE_TIME_ZONE
  );
  return Number.isNaN(d.getTime()) ? null : d;
}

export function parseTimestamp(input: unknown): Date {
  if (input instanceof Date) return input;

  // Excel serial date
  if (typeof input === 'number' && Number.isFinite(input)) {
    return parseExcelSerialDate(input);
  }

  const asString = String(input ?? '').trim();
  if (!asString) return new Date(Number.NaN);

  // Numeric string that looks like Excel serial date
  const numeric = Number(asString);
  if (Number.isFinite(numeric) && /^\d+(\.\d+)?$/.test(asString)) {
    return parseExcelSerialDate(numeric);
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

export function getLocalHourMinute(
  dateInput: Date | string,
  timeZone = 'Europe/Amsterdam'
): { hour: number; minute: number } {
  const date = typeof dateInput === 'string' ? parseTimestamp(dateInput) : dateInput;
  if (Number.isNaN(date.getTime())) return { hour: Number.NaN, minute: Number.NaN };

  const parts = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return {
    hour: Number(values.hour),
    minute: Number(values.minute)
  };
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
