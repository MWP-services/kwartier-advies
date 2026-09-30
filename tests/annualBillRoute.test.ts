// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => { vi.resetModules(); vi.doUnmock('@/src/lib/annual-bill'); });

it('returns JSON even when loading the extraction pipeline fails', async () => {
  vi.doMock('@/src/lib/annual-bill', () => { throw new ReferenceError('DOMMatrix is not defined'); });
  const { POST } = await import('../app/api/annual-bill/extract/route');
  const form = new FormData();
  form.set('file', new File(['%PDF-1.7'], 'bill.pdf', { type: 'application/pdf' }));
  const response = await POST(new Request('http://localhost/api/annual-bill/extract', { method: 'POST', body: form }));
  expect(response.status).toBe(500);
  expect(response.headers.get('content-type')).toContain('application/json');
  expect(await response.json()).toHaveProperty('error');
});

it('returns JSON for malformed multipart data', async () => {
  const { POST } = await import('../app/api/annual-bill/extract/route');
  const response = await POST(new Request('http://localhost/api/annual-bill/extract', { method: 'POST', body: 'invalid' }));
  expect(response.status).toBe(500);
  expect(response.headers.get('content-type')).toContain('application/json');
});
