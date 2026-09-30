import type { AnnualBillRawExtract } from './schema';

// Require an explicit contract/tariff statement, never infer from supplier name.
export function extractContractType(text: string): AnnualBillRawExtract['contractType'] {
  const found = new Map<string, string>();
  let gasSection = false;
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*(?:gas|aardgas)\s*:?\s*$/i.test(line)) gasSection = true;
    if (/elektriciteit|stroom/i.test(line)) gasSection = false;
    if (gasSection) continue;
    if (/\bgas\b/i.test(line) && !/elektriciteit|stroom/i.test(line)) continue;
    if (/\b(?:geen|niet|overstappen|kies|aanbod|bekijk)\b/i.test(line)) continue;
    const patterns = {
      dynamic: /\bdynamisch(?:e)?\s+(?:energie\s*)?(?:contract|tarief|prijzen|prijs)|\b(?:contract(?:type)?|tariefsoort)\s*[:\-]?\s*dynamisch|\b(?:uurprijzen|kwartierprijzen|uurtarieven)\b/i,
      fixed: /\bvast(?:e)?\s+(?:energie\s*)?(?:contract|tarief|prijs)|\bcontract(?:type)?\s*[:\-]?\s*vast\b/i,
      variable: /\bvariabel(?:e)?\s+(?:energie\s*)?(?:contract|tarief|prijs)|\bcontract(?:type)?\s*[:\-]?\s*variabel\b/i
    };
    for (const [type, pattern] of Object.entries(patterns)) if (pattern.test(line)) found.set(type, line.trim());
  }
  if (!found.size) return undefined;
  return {
    value: found.size === 1 ? [...found.keys()][0] : 'unknown',
    confidence: found.size === 1 ? 0.85 : 0.3,
    evidenceSnippet: [...found.values()].join(' | ').slice(0, 500),
    requiresReview: found.size !== 1,
    source: 'rules'
  };
}
