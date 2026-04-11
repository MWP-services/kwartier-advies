import type { AnalysisSettings } from './analysis';

export interface SettingsState {
  draftSettings: AnalysisSettings;
  appliedSettings: AnalysisSettings | null;
}

export type SettingsAction =
  | { type: 'UPDATE_DRAFT'; payload: Partial<AnalysisSettings> }
  | { type: 'APPLY_DRAFT' }
  | { type: 'RESET_DRAFT' };

export function settingsReducer(state: SettingsState, action: SettingsAction): SettingsState {
  if (action.type === 'UPDATE_DRAFT') {
    return {
      ...state,
      draftSettings: {
        ...state.draftSettings,
        ...action.payload
      }
    };
  }

  if (action.type === 'APPLY_DRAFT') {
    return {
      ...state,
      appliedSettings: { ...state.draftSettings }
    };
  }

  if (action.type === 'RESET_DRAFT') {
    if (!state.appliedSettings) return state;
    return {
      ...state,
      draftSettings: { ...state.appliedSettings }
    };
  }

  return state;
}
