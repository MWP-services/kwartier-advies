import { describe, expect, it } from 'vitest';
import { defaultAnalysisSettings } from '@/lib/analysis';
import { settingsReducer, type SettingsState } from '@/lib/analysisState';

describe('settingsReducer', () => {
  it('UPDATE_DRAFT changes draft only', () => {
    const initial: SettingsState = {
      draftSettings: defaultAnalysisSettings,
      appliedSettings: defaultAnalysisSettings
    };

    const next = settingsReducer(initial, {
      type: 'UPDATE_DRAFT',
      payload: { compliance: 0.8 }
    });

    expect(next.draftSettings.compliance).toBe(0.8);
    expect(next.appliedSettings?.compliance).toBe(0.95);
  });

  it('APPLY_DRAFT copies draft into applied', () => {
    const initial: SettingsState = {
      draftSettings: { ...defaultAnalysisSettings, compliance: 0.85 },
      appliedSettings: null
    };

    const next = settingsReducer(initial, { type: 'APPLY_DRAFT' });

    expect(next.appliedSettings).toEqual(next.draftSettings);
  });

  it('RESET_DRAFT restores applied settings', () => {
    const initial: SettingsState = {
      draftSettings: { ...defaultAnalysisSettings, compliance: 0.8 },
      appliedSettings: { ...defaultAnalysisSettings, compliance: 0.92 }
    };

    const next = settingsReducer(initial, { type: 'RESET_DRAFT' });

    expect(next.draftSettings.compliance).toBe(0.92);
    expect(next.appliedSettings?.compliance).toBe(0.92);
  });
});
