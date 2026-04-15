import { describe, expect, it } from 'vitest';
import { parseTimestamp } from '@/lib/datetime';
import { autoDetectColumns, hasLikelyPvHeader, isLikelyPvHeader, mapRows } from '@/lib/parsing';

describe('parsing', () => {
  it('auto-detects common Dutch and English PV/export column variants', () => {
    const mapping = autoDetectColumns([
      'Tijdstip',
      'Verbruik_kWh',
      'Opwek_kWh',
      'Teruglevering_kWh'
    ]);

    expect(mapping).toEqual({
      timestamp: 'Tijdstip',
      consumptionKwh: 'Verbruik_kWh',
      pvKwh: 'Opwek_kWh',
      exportKwh: 'Teruglevering_kWh'
    });
  });

  it('auto-detects supplier export overview headers', () => {
    const mapping = autoDetectColumns([
      'Van',
      'datum tijd tot',
      'Tot',
      'Verbruik (kWh)',
      'Teruglevering (kWh)'
    ]);

    expect(mapping).toEqual({
      timestamp: 'datum tijd tot',
      consumptionKwh: 'Verbruik (kWh)',
      exportKwh: 'Teruglevering (kWh)',
      pvKwh: undefined
    });
  });

  it('parses yyyy-mm-dd hh:mm local timestamps from supplier exports', () => {
    const parsed = parseTimestamp('2025-01-01 00:15');

    expect(Number.isNaN(parsed.getTime())).toBe(false);
    expect(parsed.toISOString()).toBe('2024-12-31T23:15:00.000Z');
  });

  it('maps supplier export overview rows into interval records', () => {
    const mapped = mapRows(
      [
        {
          'datum tijd tot': '2025-01-01 00:15',
          'Verbruik (kWh)': 0.428,
          'Teruglevering (kWh)': 0.125
        }
      ],
      {
        timestamp: 'datum tijd tot',
        consumptionKwh: 'Verbruik (kWh)',
        exportKwh: 'Teruglevering (kWh)'
      }
    );

    expect(mapped).toEqual([
      {
        timestamp: '2024-12-31T23:15:00.000Z',
        consumptionKwh: 0.428,
        exportKwh: 0.125,
        pvKwh: undefined
      }
    ]);
  });

  it('does not classify supplier export headers as PV generation headers', () => {
    expect(hasLikelyPvHeader(['datum tijd tot', 'Verbruik (kWh)', 'Teruglevering (kWh)'])).toBe(false);
    expect(isLikelyPvHeader('Teruglevering (kWh)')).toBe(false);
  });
});
