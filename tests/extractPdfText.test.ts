// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => { vi.resetModules(); vi.doUnmock('pdf-parse'); vi.restoreAllMocks(); });

describe('PDF extraction error boundary', () => {
  it('defers import errors until extraction is called', async () => {
    vi.doMock('pdf-parse', () => { throw new ReferenceError('DOMMatrix is not defined'); });
    const { extractPdfText } = await import('../src/lib/annual-bill/extractPdfText');
    await expect(extractPdfText(Buffer.from('pdf'))).rejects.toThrow();
  });

  it.each([false, true])('preserves normalized text when cleanup fails: %s', async (cleanupFails) => {
    const destroy = vi.fn(async () => { if (cleanupFails) throw new Error('cleanup'); });
    vi.doMock('pdf-parse', () => ({ PDFParse: class {
      getText = async () => ({ text: '  Jaar\u00a0 nota\t test\n 123  ' });
      destroy = destroy;
    } }));
    const { extractPdfText } = await import('../src/lib/annual-bill/extractPdfText');
    await expect(extractPdfText(Buffer.from('pdf'))).resolves.toBe('Jaar nota test\n 123');
    expect(destroy).toHaveBeenCalledOnce();
  });

  it('preserves the extraction error if cleanup also fails', async () => {
    const original = new Error('extraction');
    const destroy = vi.fn(async () => { throw new Error('cleanup'); });
    vi.doMock('pdf-parse', () => ({ PDFParse: class {
      getText = async () => { throw original; };
      destroy = destroy;
    } }));
    const { extractPdfText } = await import('../src/lib/annual-bill/extractPdfText');
    await expect(extractPdfText(Buffer.from('pdf'))).rejects.toBe(original);
    expect(destroy).toHaveBeenCalledOnce();
  });
});
