import type { AnnualBillField, AnnualBillAiReport, AnnualBillRawExtract } from './schema';

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const DEFAULT_MODEL = 'gpt-4.1-mini';
const MAX_TEXT_CHARS = 60000;

const AI_FIELDS = [
  'supplierName',
  'invoiceDate',
  'periodStart',
  'periodEnd',
  'eanElectricity',
  'usageNormalKwh',
  'usageOffPeakKwh',
  'feedInNormalKwh',
  'feedInOffPeakKwh',
  'totalUsageKwh',
  'totalFeedInKwh',
  'annualPvProductionKwh',
  'normalTariffEurPerKwh',
  'offPeakTariffEurPerKwh',
  'feedInTariffEurPerKwh',
  'totalElectricityCostEur',
  'energyTaxElectricityEur',
  'gridCostElectricityEur',
  'solarPanelCount',
  'solarPanelWp',
  'roofOrientation'
] as const satisfies readonly AnnualBillField[];

const NUMERIC_AI_FIELDS = new Set<AnnualBillField>([
  'usageNormalKwh',
  'usageOffPeakKwh',
  'feedInNormalKwh',
  'feedInOffPeakKwh',
  'totalUsageKwh',
  'totalFeedInKwh',
  'annualPvProductionKwh',
  'normalTariffEurPerKwh',
  'offPeakTariffEurPerKwh',
  'feedInTariffEurPerKwh',
  'totalElectricityCostEur',
  'energyTaxElectricityEur',
  'gridCostElectricityEur',
  'solarPanelCount',
  'solarPanelWp'
]);

type AiFieldExtract = {
  field: AnnualBillField;
  value: string | number | null;
  confidence: number;
  evidenceSnippet: string;
  reasoning: string;
  requiresReview: boolean;
};

type AiAnnualBillResponse = {
  summary: string;
  fields: AiFieldExtract[];
  assumptions: Array<{
    field: AnnualBillField | 'general';
    label: string;
    value: string | number | null;
    source: 'pdf' | 'calculation' | 'fallback';
    confidence: number;
    evidenceSnippet: string;
    reasoning: string;
    requiresReview: boolean;
  }>;
  warnings: string[];
};

export type AnnualBillAiExtraction = {
  raw: AnnualBillRawExtract;
  report: AnnualBillAiReport;
  model: string;
  warnings: string[];
};

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function normalizeSnippet(snippet: string): string {
  return snippet.replace(/\s+/g, ' ').trim();
}

function hasEvidenceInText(text: string, snippet: string): boolean {
  const normalizedText = normalizeSnippet(text).toLowerCase();
  const normalizedSnippet = normalizeSnippet(snippet).toLowerCase();
  if (normalizedSnippet.length < 8) return false;
  return normalizedText.includes(normalizedSnippet.slice(0, Math.min(120, normalizedSnippet.length)));
}

function coerceField(field: string): AnnualBillField | null {
  return (AI_FIELDS as readonly string[]).includes(field) ? field as AnnualBillField : null;
}

function parseNumber(value: string | number): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const parsed = Number(value.replace(/\s/g, '').replace(/[€]/g, '').replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function coerceValue(field: AnnualBillField, value: string | number): string | number | null {
  if (!NUMERIC_AI_FIELDS.has(field)) return typeof value === 'string' ? value.trim() : value;
  return parseNumber(value);
}

function extractOutputText(response: unknown): string {
  const output = (response as { output?: Array<{ content?: Array<{ type?: string; text?: string }> }> }).output ?? [];
  const text = output
    .flatMap((item) => item.content ?? [])
    .filter((content) => content.type === 'output_text' && typeof content.text === 'string')
    .map((content) => content.text)
    .join('\n')
    .trim();
  if (!text) throw new Error('OpenAI gaf geen tekstoutput terug.');
  return text;
}

function parseAiJson(text: string): AiAnnualBillResponse {
  const parsed = JSON.parse(text) as Partial<AiAnnualBillResponse>;
  return {
    summary: typeof parsed.summary === 'string' ? parsed.summary : 'AI-analyse van de jaarnota.',
    fields: Array.isArray(parsed.fields) ? parsed.fields as AiFieldExtract[] : [],
    assumptions: Array.isArray(parsed.assumptions) ? parsed.assumptions as AiAnnualBillResponse['assumptions'] : [],
    warnings: Array.isArray(parsed.warnings) ? parsed.warnings.filter((warning): warning is string => typeof warning === 'string') : []
  };
}

function toRawExtract(ai: AiAnnualBillResponse, text: string): { raw: AnnualBillRawExtract; warnings: string[] } {
  const raw: AnnualBillRawExtract = {};
  const warnings: string[] = [];

  ai.fields.forEach((entry) => {
    const field = coerceField(String(entry.field));
    if (!field || entry.value == null || entry.value === '') return;
    const value = coerceValue(field, entry.value);
    if (value == null || value === '') return;
    const evidenceSnippet = typeof entry.evidenceSnippet === 'string' ? entry.evidenceSnippet.trim() : '';
    const evidenceMatches = hasEvidenceInText(text, evidenceSnippet);
    const requiresReview = Boolean(entry.requiresReview) || !evidenceMatches;
    if (!evidenceMatches) warnings.push(`AI-bronfragment voor ${field} is niet letterlijk teruggevonden in de PDF-tekst.`);

    raw[field] = {
      value,
      confidence: requiresReview ? Math.min(0.55, clampConfidence(entry.confidence)) : clampConfidence(entry.confidence),
      evidence: evidenceSnippet,
      evidenceSnippet,
      reasoning: typeof entry.reasoning === 'string' ? entry.reasoning : '',
      requiresReview,
      source: 'ai'
    };
  });

  return { raw, warnings };
}

function buildReport(ai: AiAnnualBillResponse, text: string): AnnualBillAiReport {
  return {
    summary: ai.summary,
    warnings: ai.warnings,
    assumptions: ai.assumptions.map((assumption) => {
      const snippet = typeof assumption.evidenceSnippet === 'string' ? assumption.evidenceSnippet.trim() : '';
      const requiresReview = Boolean(assumption.requiresReview) || (assumption.source === 'pdf' && !hasEvidenceInText(text, snippet));
      return {
        field: coerceField(String(assumption.field)) ?? 'general',
        label: typeof assumption.label === 'string' ? assumption.label : String(assumption.field ?? 'Aanname'),
        value: assumption.value == null ? undefined : assumption.value,
        source: assumption.source === 'calculation' || assumption.source === 'fallback' ? assumption.source : 'pdf',
        confidence: requiresReview ? Math.min(0.55, clampConfidence(assumption.confidence)) : clampConfidence(assumption.confidence),
        evidenceSnippet: snippet || undefined,
        reasoning: typeof assumption.reasoning === 'string' ? assumption.reasoning : '',
        requiresReview
      };
    })
  };
}

export function isAnnualBillAiConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

export async function extractAnnualBillWithAi(text: string): Promise<AnnualBillAiExtraction> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY ontbreekt.');

  const model = process.env.OPENAI_ANNUAL_BILL_MODEL ?? DEFAULT_MODEL;
  const documentText = text.slice(0, MAX_TEXT_CHARS);
  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: 'system',
          content:
            'Je analyseert Nederlandse energie-jaarnotas. Extraheer alleen waarden die in de tekst staan of duidelijk berekend kunnen worden. Geef per bewering een kort letterlijk bronfragment. Verzin geen ontbrekende waarden.'
        },
        {
          role: 'user',
          content:
            `Analyseer deze volledige jaarnota voor een batterijadvies. Let op verschillende leveranciersformats, normaal/dal, teruglevering, tarieven, periode, EAN en zonnepanelen/opwek.\n\nPDF-tekst:\n${documentText}`
        }
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'annual_bill_ai_extract',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            required: ['summary', 'fields', 'assumptions', 'warnings'],
            properties: {
              summary: { type: 'string' },
              warnings: { type: 'array', items: { type: 'string' } },
              fields: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['field', 'value', 'confidence', 'evidenceSnippet', 'reasoning', 'requiresReview'],
                  properties: {
                    field: { type: 'string', enum: AI_FIELDS },
                    value: { anyOf: [{ type: 'string' }, { type: 'number' }, { type: 'null' }] },
                    confidence: { type: 'number' },
                    evidenceSnippet: { type: 'string' },
                    reasoning: { type: 'string' },
                    requiresReview: { type: 'boolean' }
                  }
                }
              },
              assumptions: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['field', 'label', 'value', 'source', 'confidence', 'evidenceSnippet', 'reasoning', 'requiresReview'],
                  properties: {
                    field: { type: 'string' },
                    label: { type: 'string' },
                    value: { anyOf: [{ type: 'string' }, { type: 'number' }, { type: 'null' }] },
                    source: { type: 'string', enum: ['pdf', 'calculation', 'fallback'] },
                    confidence: { type: 'number' },
                    evidenceSnippet: { type: 'string' },
                    reasoning: { type: 'string' },
                    requiresReview: { type: 'boolean' }
                  }
                }
              }
            }
          }
        }
      }
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI analyse mislukte (${response.status}): ${body.slice(0, 500)}`);
  }

  const json = await response.json();
  const ai = parseAiJson(extractOutputText(json));
  const extracted = toRawExtract(ai, documentText);
  return {
    raw: extracted.raw,
    report: buildReport(ai, documentText),
    model,
    warnings: [...ai.warnings, ...extracted.warnings]
  };
}
