/**
 * Isolation Demo helpers for comparing/applying PWA snip tuner defaults.
 * Does not change DEFAULT_SNIP_OPTIONS or proposeSnipsFromProfile.
 */

import { DEFAULT_SNIP_OPTIONS } from './volumeAnalyzer';
import type { TunerSettings } from './demoStore';

export type TunerDefaultFields = Pick<
  TunerSettings,
  'autoNoiseFloor' | 'minSnipDuration' | 'maxSnipDuration' | 'minSilenceGapDuration'
> & {
  quietThresholdDb?: number;
};

export function tunerMatchesAppDefaults(settings: TunerDefaultFields): boolean {
  return (
    settings.autoNoiseFloor === true &&
    settings.minSnipDuration === DEFAULT_SNIP_OPTIONS.minSnipDuration &&
    settings.maxSnipDuration === DEFAULT_SNIP_OPTIONS.maxSnipDuration &&
    settings.minSilenceGapDuration === DEFAULT_SNIP_OPTIONS.minSilenceGapDuration
  );
}

export function appDefaultTunerSettings(quietThresholdDb: number): TunerSettings {
  return {
    quietThresholdDb,
    autoNoiseFloor: true,
    minSnipDuration: DEFAULT_SNIP_OPTIONS.minSnipDuration,
    maxSnipDuration: DEFAULT_SNIP_OPTIONS.maxSnipDuration,
    minSilenceGapDuration: DEFAULT_SNIP_OPTIONS.minSilenceGapDuration,
  };
}
