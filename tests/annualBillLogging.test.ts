import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { extractAnnualBillFromPdf } from '../src/lib/annual-bill';
import { annualBillLogFields, annualBillLogValues } from '../src/lib/annual-bill/logging';

vi.mock('../src/lib/annual-bill/extractPdfText', () => ({
  extractPdfText: vi.fn(async () => 'Totaal verbruik 4200 kWh. Teruglevering 1800 kWh. PRIVATENAAM 123456789012345678')
}));

let lines: string[];
function events() { return lines.map((line) => JSON.parse(line.replace('[annual-bill] ', ''))); }

beforeEach(() => {
  lines = [];
  for (const method of ['info', 'warn', 'error'] as const) vi.spyOn(console, method).mockImplementation((...args: unknown[]) => { lines.push(String(args[0])); });
  vi.stubEnv('OPENAI_API_KEY', 'test-secret-never-log');
  vi.stubEnv('OPENAI_ANNUAL_BILL_MODEL', 'test-model');
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('annual bill workflow logging', () => {
  it('traces a successful AI response and merge without logging secrets or document content', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({
      status: 'completed', usage: { input_tokens: 100, output_tokens: 50, total_tokens: 150 },
      output: [{ content: [{ type: 'output_text', text: JSON.stringify({
        summary: 'PRIVATENAAM', warnings: [], assumptions: [], fields: [
          { field: 'totalUsageKwh', value: 4300, confidence: 0.9, evidenceSnippet: 'Totaal verbruik 4200 kWh', reasoning: 'PRIVATENAAM', requiresReview: false },
          { field: 'supplierName', value: 'PRIVATENAAM', confidence: 0.8, evidenceSnippet: 'PRIVATENAAM', reasoning: '', requiresReview: false }
        ]
      }) }] }]
    }), { status: 200, headers: { 'x-request-id': 'request-test' } }));
    const result = await extractAnnualBillFromPdf(Buffer.from('fake pdf'), 'trace-test');
    expect(result.input.traceId).toBe('trace-test');
    expect(result.diagnostics.aiUsed).toBe(true);
    expect(events().every((event) => event.traceId === 'trace-test')).toBe(true);
    expect(events()).toEqual(expect.arrayContaining([
      expect.objectContaining({ event: 'ai.response.received', httpStatus: 200, requestId: 'request-test' }),
      expect.objectContaining({ event: 'ai.extraction.completed', usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 } }),
      expect.objectContaining({ event: 'merge.completed', conflictingFields: expect.arrayContaining(['totalUsageKwh']) }),
      expect.objectContaining({ event: 'extraction.completed', aiUsed: true })
    ]));
    expect(lines.join('\n')).not.toMatch(/test-secret-never-log|PRIVATENAAM|123456789012345678|Totaal verbruik 4200/);
  });

  it('logs a missing-key skip without calling OpenAI', async () => {
    vi.stubEnv('OPENAI_API_KEY', '');
    const result = await extractAnnualBillFromPdf(Buffer.from('fake pdf'), 'trace-skipped');
    expect(fetch).not.toHaveBeenCalled();
    expect(result.diagnostics.aiUsed).toBe(false);
    expect(events()).toContainEqual(expect.objectContaining({ event: 'ai.skipped', reason: 'OPENAI_API_KEY_missing' }));
  });

  it('logs HTTP failure and rule fallback without leaking the upstream error body', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ error: { code: 'invalid_api_key', message: 'sensitive-upstream-body' } }), { status: 401 }));
    const result = await extractAnnualBillFromPdf(Buffer.from('fake pdf'), 'trace-failed');
    expect(result.diagnostics.aiUsed).toBe(false);
    expect(events()).toContainEqual(expect.objectContaining({ event: 'ai.response.received', httpStatus: 401 }));
    expect(events()).toContainEqual(expect.objectContaining({ event: 'ai.http_error', errorCode: 'invalid_api_key' }));
    expect(events()).toContainEqual(expect.objectContaining({ event: 'ai.fallback_to_rules', aiUsed: false }));
    expect(lines.join('\n')).not.toContain('sensitive-upstream-body');
  });

  it('identifies the failing structured-output stage', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ output: [{ content: [{ type: 'output_text', text: 'not valid JSON' }] }] }), { status: 200 }));
    await extractAnnualBillFromPdf(Buffer.from('fake pdf'), 'trace-json');
    expect(events()).toContainEqual(expect.objectContaining({ event: 'ai.request.failed', stage: 'structured_output' }));
  });

  it('only logs allowed numeric input values and safe field metadata', () => {
    expect(annualBillLogValues({ supplierName: 'private', eanElectricity: '123', totalUsageKwh: 4200, totalFeedInKwh: NaN })).toEqual({ totalUsageKwh: 4200 });
    const fields = annualBillLogFields({ supplierName: { value: 'private', confidence: 0.8, evidenceSnippet: 'private text' } });
    expect(JSON.stringify(fields)).not.toContain('private');
    expect(fields[0].hasEvidence).toBe(true);
  });
});
