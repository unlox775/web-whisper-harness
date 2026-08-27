import type { AppSettings } from './types';

const KEYS = {
  groqApiKey: 'groq_api_key',
  storageCapMb: 'storage_cap_mb',
  developerModeEnabled: 'developer_mode_enabled',
  onboardingDismissed: 'onboarding_dismissed',
} as const;

function readRaw(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeRaw(key: string, value: string) {
  localStorage.setItem(key, value);
}

export function loadSettings(): AppSettings {
  const groqApiKey = readRaw(KEYS.groqApiKey) ?? '';
  const capRaw = readRaw(KEYS.storageCapMb);
  const storageCapMb = capRaw ? Number(capRaw) || 200 : 200;
  const developerModeEnabled = readRaw(KEYS.developerModeEnabled) === 'true';
  const onboardingDismissed = readRaw(KEYS.onboardingDismissed) === 'true';
  return {
    groqApiKey,
    storageCapMb,
    developerModeEnabled,
    onboardingDismissed,
    keyValid: groqApiKey ? null : false,
    keyStatus: groqApiKey ? 'Checking' : 'Missing',
  };
}

export function saveSetting(key: keyof typeof KEYS, value: string | number | boolean) {
  writeRaw(KEYS[key], String(value));
}

export function capBytesFromMb(mb: number): number {
  return Math.max(1, mb) * 1024 * 1024;
}
