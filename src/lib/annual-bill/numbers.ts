export const BILL_NUMBER_PATTERN = String.raw`[-+]?(?:\d{1,3}(?:[.\u00a0 ]\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?)`;
export function parseBillNumber(value: string, decimalDot = false): number | null {
  let normalized = value.replace(/\s/g, '');
  if (normalized.includes(',')) normalized = normalized.replace(/\./g, '').replace(',', '.');
  else if (!decimalDot && !/^[-+]?0\./.test(normalized)) normalized = normalized.replace(/\.(?=\d{3}(?:\D|$))/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}
