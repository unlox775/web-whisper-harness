export interface Settings {
  groqApiKey: string
  storageCapMB: number
  developerModeEnabled: boolean
  onboardingDismissed: boolean
}

const DEFAULTS: Settings = {
  groqApiKey: '',
  storageCapMB: 200,
  developerModeEnabled: false,
  onboardingDismissed: false,
}

const STORAGE_KEY_PREFIX = 'webwhisper_'

export function getSettings(): Settings {
  const settings: Settings = { ...DEFAULTS }
  
  try {
    settings.groqApiKey = localStorage.getItem(STORAGE_KEY_PREFIX + 'groq_api_key') || ''
    settings.storageCapMB = parseInt(localStorage.getItem(STORAGE_KEY_PREFIX + 'storage_cap_mb') || '200', 10)
    settings.developerModeEnabled = localStorage.getItem(STORAGE_KEY_PREFIX + 'developer_mode_enabled') === 'true'
    settings.onboardingDismissed = localStorage.getItem(STORAGE_KEY_PREFIX + 'onboarding_dismissed') === 'true'
  } catch (error) {
    console.error('Failed to load settings from localStorage:', error)
  }
  
  return settings
}

export function setSetting<K extends keyof Settings>(key: K, value: Settings[K]): void {
  try {
    const storageKey = STORAGE_KEY_PREFIX + key.replace(/([A-Z])/g, '_$1').toLowerCase()
    localStorage.setItem(storageKey, String(value))
  } catch (error) {
    console.error('Failed to save setting to localStorage:', error)
    throw error
  }
}

export function getSetting<K extends keyof Settings>(key: K): Settings[K] {
  const settings = getSettings()
  return settings[key]
}
