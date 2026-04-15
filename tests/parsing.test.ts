import { describe, expect, it } from 'vitest';
import { autoDetectColumns } from '@/lib/parsing';

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
});
