export type RecordScreenshotMode = 'record' | 'record-hud' | 'record-dev';
export type IsolationScreenshotMode = 'isolation-settings';

const RECORD_MODES = new Set<string>(['record', 'record-hud', 'record-dev']);

const TALL_LIVE_TRANSCRIPT = [
  'Okay so the first thing I wanted to talk through is the grocery list because if we wait until tonight the store will be packed.',
  'We need milk, eggs, sourdough, the good butter not the cheap one, and those frozen blueberries she actually eats.',
  'Also pick up dish soap. The lemon kind. Last time I grabbed unscented and nobody was happy about it.',
  'Then after that I have to call the dentist and move Thursday because the recital is at four and parking downtown is a mess.',
  'Remind me about the permission slip. It is in the backpack zipper pocket next to the cracked water bottle.',
  'The meeting notes from this morning: ship the overlay fix first, do not touch session detail, do not change the snip algorithm.',
  'Live transcription should stay readable but it cannot steal the stop control. That button is the only way out of a long take.',
  'If the overlay keeps growing people will record twenty minutes and then be trapped, which is worse than losing a few lines of preview.',
  'Duration is the number that matters. Seconds on the big timer. Sample counts are noise. Snip counts belong in developer mode only.',
  'We should also check the safe area on iPhone so the red stop pill sits above the home indicator and stays fully tappable.',
  'I keep repeating this because it is the whole job: reserve a slot for Stop, put the transcript above it, scroll inside the card.',
  'Pending state can stay italic. Once words arrive, the box fills, then it scrolls. The button never moves, never hides, never loses hits.',
  'If we need a screenshot, this fake transcript is intentionally long enough that the old overlay would have covered the stop button.',
  'Keep going, keep going, more lines so the internal scroll is obvious on a tall iPhone viewport and the HUD still shows Recording plus time.',
  'One more paragraph about nothing in particular except filling height: weather, traffic, what we are having for dinner, who is picking up whom.',
  'And a last beat so the scroller has somewhere to go: Stop Recording stays in its own bottom slot, z-index on top, always visible.',
].join(' ');

export function readScreenshotMode(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return new URLSearchParams(window.location.search).get('screenshot');
  } catch {
    return null;
  }
}

export function isRecordScreenshot(mode: string | null): mode is RecordScreenshotMode {
  return !!mode && RECORD_MODES.has(mode);
}

export function isIsolationSettingsScreenshot(mode: string | null): boolean {
  return mode === 'isolation-settings';
}

export function isSessionDetailScreenshot(mode: string | null): boolean {
  return mode === 'session-detail';
}

export function recordScreenshotPreview(mode: RecordScreenshotMode): {
  seconds: number;
  transcript: string;
  pending: boolean;
  showDeveloperHud: boolean;
  snipsGathered: number;
} {
  if (mode === 'record-hud') {
    return {
      seconds: 42,
      transcript: '',
      pending: true,
      showDeveloperHud: false,
      snipsGathered: 0,
    };
  }
  if (mode === 'record-dev') {
    return {
      seconds: 155,
      transcript: TALL_LIVE_TRANSCRIPT,
      pending: false,
      showDeveloperHud: true,
      snipsGathered: 16,
    };
  }
  return {
    seconds: 155,
    transcript: TALL_LIVE_TRANSCRIPT,
    pending: false,
    showDeveloperHud: false,
    snipsGathered: 16,
  };
}
