const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);
const DAY_MS = 24 * 60 * 60 * 1000;

export function parseTimestamp(input: unknown): Date {
  if (input instanceof Date) {
    return input;
  }

  if (typeof input === 'number' && Number.isFinite(input)) {
    return new Date(EXCEL_EPOCH_MS + input * DAY_MS);
  }

  const asString = String(input ?? '').trim();
  if (!asString) {
    return new Date(Number.NaN);
  }

  const numeric = Number(asString);
  if (Number.isFinite(numeric) && /^\d+(\.\d+)?$/.test(asString)) {
    return new Date(EXCEL_EPOCH_MS + numeric * DAY_MS);
  }

  return new Date(asString);
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
