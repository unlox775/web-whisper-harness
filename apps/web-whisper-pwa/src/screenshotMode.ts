import type { SessionRecord, SnipRecord, TranscriptRecord } from './types';

export type RecordScreenshotMode =
  | 'record'
  | 'record-hud'
  | 'record-dev'
  | 'record-durable'
  | 'record-no-audio'
  | 'record-start-pcm';
export type IsolationScreenshotMode = 'isolation-settings';

const RECORD_MODES = new Set<string>([
  'record',
  'record-hud',
  'record-dev',
  'record-durable',
  'record-no-audio',
  'record-start-pcm',
]);

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

const DURABLE_SNIP_TRANSCRIPT = [
  'Okay so the first thing I wanted to talk through is the grocery list because if we wait until tonight the store will be packed.',
  'We need milk, eggs, sourdough, the good butter not the cheap one, and those frozen blueberries she actually eats.',
].join(' ');

const HOME_SNIPPET =
  'Okay so the first thing I wanted to talk through is the grocery list because if we wait until tonight the store will be packed. We need milk, eggs, sourdough...';

const LONG_SNIP_TRANSCRIPT =
  'Okay so the first thing I wanted to talk through is the grocery list because if we wait until tonight the store will be packed. We need milk, eggs, sourdough, the good butter not the cheap one, and those frozen blueberries she actually eats. Also pick up dish soap. The lemon kind. Last time I grabbed unscented and nobody was happy about it. Then after that I have to call the dentist and move Thursday because the recital is at four and parking downtown is a mess. Remind me about the permission slip. It is in the backpack zipper pocket next to the cracked water bottle. END OF FULL SNIP TRANSCRIPT.';

const SESSION_TRANSCRIPT = [
  LONG_SNIP_TRANSCRIPT,
  'We need milk, eggs, sourdough, the good butter not the cheap one, and those frozen blueberries she actually eats.',
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

export function isHomeAfterStopScreenshot(mode: string | null): boolean {
  return mode === 'home-after-stop';
}

export function isHomePartialCoverageScreenshot(mode: string | null): boolean {
  return mode === 'home-partial-coverage';
}

export function isSessionPartialCoverageScreenshot(mode: string | null): boolean {
  return mode === 'session-partial-coverage';
}

export function isHomeAfterStopStaleScreenshot(mode: string | null): boolean {
  return mode === 'home-after-stop-stale';
}

export function isHomeTileLiveScreenshot(mode: string | null): boolean {
  return mode === 'home-tile-live';
}

export function isHomeTileScreenshot(mode: string | null): boolean {
  return (
    isHomeAfterStopScreenshot(mode) ||
    isHomeAfterStopStaleScreenshot(mode) ||
    isHomeTileLiveScreenshot(mode) ||
    isHomePartialCoverageScreenshot(mode)
  );
}

export function isSessionTranscribedScreenshot(mode: string | null): boolean {
  return mode === 'session-transcribed';
}

export function isSessionSnipsScreenshot(mode: string | null): boolean {
  return mode === 'session-snips';
}

export function recordScreenshotPreview(mode: RecordScreenshotMode): {
  seconds: number;
  transcript: string;
  pending: boolean;
  showDeveloperHud: boolean;
  snipsGathered: number;
  noAudioAlert: boolean;
} {
  if (mode === 'record-no-audio') {
    return {
      seconds: 8,
      transcript: '',
      pending: true,
      showDeveloperHud: false,
      snipsGathered: 0,
      noAudioAlert: true,
    };
  }
  if (mode === 'record-start-pcm') {
    return {
      seconds: 1,
      transcript: '',
      pending: true,
      showDeveloperHud: false,
      snipsGathered: 0,
      noAudioAlert: false,
    };
  }
  if (mode === 'record-hud') {
    return {
      seconds: 42,
      transcript: '',
      pending: true,
      showDeveloperHud: false,
      snipsGathered: 0,
      noAudioAlert: false,
    };
  }
  if (mode === 'record-durable') {
    return {
      seconds: 47,
      transcript: DURABLE_SNIP_TRANSCRIPT,
      pending: false,
      showDeveloperHud: true,
      snipsGathered: 2,
      noAudioAlert: false,
    };
  }
  if (mode === 'record-dev') {
    return {
      seconds: 155,
      transcript: TALL_LIVE_TRANSCRIPT,
      pending: false,
      showDeveloperHud: true,
      snipsGathered: 16,
      noAudioAlert: false,
    };
  }
  return {
    seconds: 155,
    transcript: TALL_LIVE_TRANSCRIPT,
    pending: false,
    showDeveloperHud: false,
    snipsGathered: 16,
    noAudioAlert: false,
  };
}

function fixtureSnip(
  sessionId: string,
  id: string,
  startTime: number,
  endTime: number,
  createdAt: string
): SnipRecord {
  return {
    id,
    sessionId,
    startChunkIndex: 0,
    endChunkIndex: 0,
    startTime,
    endTime,
    duration: endTime - startTime,
    chunkIds: ['chk-0'],
    confidence: 0.9,
    createdAt,
  };
}

function fixtureTx(
  sessionId: string,
  snipId: string,
  text: string,
  createdAt: string
): TranscriptRecord {
  return { snipId, sessionId, text, createdAt, updatedAt: createdAt };
}

export function homeAfterStopPreview(): {
  session: SessionRecord;
  snips: SnipRecord[];
  transcripts: TranscriptRecord[];
  snipCount: number;
  transcriptCount: number;
  snippet: string;
} {
  const createdAt = new Date();
  createdAt.setMinutes(createdAt.getMinutes() - 1);
  const iso = createdAt.toISOString();
  const sessionId = 'ses-screenshot-after-stop';
  const snips = [
    fixtureSnip(sessionId, 'snip-a', 0, 20, iso),
    fixtureSnip(sessionId, 'snip-b', 20, 46.5, iso),
  ];
  const transcripts = [
    fixtureTx(sessionId, 'snip-a', HOME_SNIPPET, iso),
    fixtureTx(sessionId, 'snip-b', 'We need milk, eggs, and sourdough.', iso),
  ];
  return {
    session: {
      id: sessionId,
      createdAt: iso,
      updatedAt: iso,
      duration: 47,
      chunkCount: 12,
      sizeBytes: 188416,
      hasVolumeProfile: true,
      hasSnips: true,
      hasTranscript: true,
      status: 'ready',
    },
    snips,
    transcripts,
    snipCount: 2,
    transcriptCount: 2,
    snippet: HOME_SNIPPET,
  };
}

const HOME_STALE_SNIPPET =
  'Okay so the first thing I wanted to talk through is the grocery list because if we wait until tonight...';

export function homeAfterStopStalePreview(): {
  session: SessionRecord;
  snips: SnipRecord[];
  transcripts: TranscriptRecord[];
  snipCount: number;
  transcriptCount: number;
  snippet: string;
} {
  const createdAt = new Date();
  createdAt.setMinutes(createdAt.getMinutes() - 1);
  const iso = createdAt.toISOString();
  const sessionId = 'ses-screenshot-after-stop';
  const snips = [
    fixtureSnip(sessionId, 'snip-a', 0, 20, iso),
    fixtureSnip(sessionId, 'snip-b', 20, 46.5, iso),
  ];
  const transcripts = [fixtureTx(sessionId, 'snip-a', HOME_STALE_SNIPPET, iso)];
  return {
    session: {
      id: sessionId,
      createdAt: iso,
      updatedAt: iso,
      duration: 47,
      chunkCount: 12,
      sizeBytes: 188416,
      hasVolumeProfile: true,
      hasSnips: true,
      hasTranscript: true,
      status: 'ready',
    },
    snips,
    transcripts,
    snipCount: 2,
    transcriptCount: 1,
    snippet: HOME_STALE_SNIPPET,
  };
}

export function homePartialCoveragePreview(): {
  session: SessionRecord;
  snips: SnipRecord[];
  transcripts: TranscriptRecord[];
  snipCount: number;
  transcriptCount: number;
  snippet: string;
} {
  const createdAt = new Date();
  createdAt.setMinutes(createdAt.getMinutes() - 1);
  const iso = createdAt.toISOString();
  const sessionId = 'ses-screenshot-partial-coverage';
  const snips = [
    fixtureSnip(sessionId, 'snip-a', 0, 20, iso),
    fixtureSnip(sessionId, 'snip-b', 20, 45, iso),
  ];
  const transcripts = [
    fixtureTx(sessionId, 'snip-a', HOME_SNIPPET, iso),
    fixtureTx(sessionId, 'snip-b', 'We need milk, eggs, and sourdough.', iso),
  ];
  return {
    session: {
      id: sessionId,
      createdAt: iso,
      updatedAt: iso,
      duration: 180,
      chunkCount: 45,
      sizeBytes: 720896,
      hasVolumeProfile: true,
      hasSnips: true,
      hasTranscript: true,
      status: 'ready',
    },
    snips,
    transcripts,
    snipCount: 2,
    transcriptCount: 2,
    snippet: HOME_SNIPPET,
  };
}

export function sessionTranscribedPreview(): {
  session: SessionRecord;
  snips: SnipRecord[];
  transcripts: TranscriptRecord[];
  transcriptText: string;
} {
  const createdAt = new Date();
  createdAt.setMinutes(createdAt.getMinutes() - 2);
  const iso = createdAt.toISOString();
  const sessionId = 'ses-screenshot-transcribed';
  const snips: SnipRecord[] = [
    {
      id: 'snip-screenshot-0',
      sessionId,
      startChunkIndex: 0,
      endChunkIndex: 2,
      startTime: 0,
      endTime: 12.4,
      duration: 12.4,
      chunkIds: ['chk-0', 'chk-1', 'chk-2'],
      confidence: 0.9,
      createdAt: iso,
    },
    {
      id: 'snip-screenshot-1',
      sessionId,
      startChunkIndex: 3,
      endChunkIndex: 6,
      startTime: 12.4,
      endTime: 46.5,
      duration: 34.1,
      chunkIds: ['chk-3', 'chk-4', 'chk-5', 'chk-6'],
      confidence: 0.88,
      createdAt: iso,
    },
  ];
  const transcripts: TranscriptRecord[] = [
    {
      snipId: 'snip-screenshot-0',
      sessionId,
      text: LONG_SNIP_TRANSCRIPT,
      createdAt: iso,
      updatedAt: iso,
    },
    {
      snipId: 'snip-screenshot-1',
      sessionId,
      text: 'We need milk, eggs, sourdough, the good butter not the cheap one, and those frozen blueberries she actually eats.',
      createdAt: iso,
      updatedAt: iso,
    },
  ];
  return {
    session: {
      id: sessionId,
      createdAt: iso,
      updatedAt: iso,
      duration: 47,
      chunkCount: 12,
      sizeBytes: 188416,
      hasVolumeProfile: true,
      hasSnips: true,
      hasTranscript: true,
      status: 'ready',
    },
    snips,
    transcripts,
    transcriptText: SESSION_TRANSCRIPT,
  };
}

export function sessionPartialCoveragePreview(): {
  session: SessionRecord;
  snips: SnipRecord[];
  transcripts: TranscriptRecord[];
  transcriptText: string;
} {
  const createdAt = new Date();
  createdAt.setMinutes(createdAt.getMinutes() - 2);
  const iso = createdAt.toISOString();
  const sessionId = 'ses-screenshot-partial-coverage';
  const snips: SnipRecord[] = [
    {
      id: 'snip-coverage-0',
      sessionId,
      startChunkIndex: 0,
      endChunkIndex: 2,
      startTime: 0,
      endTime: 20,
      duration: 20,
      chunkIds: ['chk-0', 'chk-1', 'chk-2'],
      confidence: 0.9,
      createdAt: iso,
    },
    {
      id: 'snip-coverage-1',
      sessionId,
      startChunkIndex: 3,
      endChunkIndex: 6,
      startTime: 20,
      endTime: 45,
      duration: 25,
      chunkIds: ['chk-3', 'chk-4', 'chk-5', 'chk-6'],
      confidence: 0.88,
      createdAt: iso,
    },
  ];
  const transcripts: TranscriptRecord[] = [
    {
      snipId: 'snip-coverage-0',
      sessionId,
      text: LONG_SNIP_TRANSCRIPT,
      createdAt: iso,
      updatedAt: iso,
    },
    {
      snipId: 'snip-coverage-1',
      sessionId,
      text: 'We need milk, eggs, sourdough, the good butter not the cheap one, and those frozen blueberries she actually eats.',
      createdAt: iso,
      updatedAt: iso,
    },
  ];
  return {
    session: {
      id: sessionId,
      createdAt: iso,
      updatedAt: iso,
      duration: 180,
      chunkCount: 45,
      sizeBytes: 720896,
      hasVolumeProfile: true,
      hasSnips: true,
      hasTranscript: true,
      status: 'ready',
    },
    snips,
    transcripts,
    transcriptText: SESSION_TRANSCRIPT,
  };
}
