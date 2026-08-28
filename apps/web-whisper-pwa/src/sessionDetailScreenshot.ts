import * as sessionStore from '@web-whisper/session-store';

const STORAGE_KEY = 'ww-screenshot-session-detail-id';

const SNIP_TEXTS = [
  {
    startTime: 0,
    endTime: 12,
    duration: 12,
    text: 'Okay so the first thing I wanted to talk through is the grocery list because if we wait until tonight the store will be packed.',
  },
  {
    startTime: 12,
    endTime: 28,
    duration: 16,
    text: 'We need milk, eggs, sourdough, the good butter not the cheap one, and those frozen blueberries she actually eats.',
  },
  {
    startTime: 28,
    endTime: 45,
    duration: 17,
    text: 'Then after that I have to call the dentist and move Thursday because the recital is at four and parking downtown is a mess.',
  },
];

function dummyMp3(durationSeconds: number): Blob {
  const header = new Uint8Array([0xff, 0xfb, 0x90, 0x00]);
  const data = new Uint8Array(Math.max(64, Math.floor(durationSeconds * 400)));
  return new Blob([header, data], { type: 'audio/mpeg' });
}

export async function ensureSessionDetailScreenshotSession(): Promise<string | null> {
  try {
    const existingId = window.localStorage.getItem(STORAGE_KEY);
    if (existingId) {
      const session = await sessionStore.getSession(existingId);
      if (session) return existingId;
    }

    const created = await sessionStore.createSession();
    if (created.error || !created.id) return null;
    const sessionId = created.id;

    const blob = dummyMp3(45);
    const chunk = await sessionStore.writeChunk(sessionId, {
      seq: 0,
      startTime: 0,
      endTime: 45,
      duration: 45,
      blob,
      sizeBytes: blob.size,
    });
    if (chunk.error || !chunk.chunkId) return null;

    for (const piece of SNIP_TEXTS) {
      const snip = await sessionStore.writeSnip(sessionId, {
        startChunkIndex: 0,
        endChunkIndex: 0,
        startTime: piece.startTime,
        endTime: piece.endTime,
        duration: piece.duration,
        chunkIds: [chunk.chunkId],
        confidence: 0.9,
      });
      if (snip.error || !snip.snipId) return null;
      await sessionStore.writeTranscript(snip.snipId, piece.text);
    }

    await sessionStore.finalizeSession(sessionId);
    window.localStorage.setItem(STORAGE_KEY, sessionId);
    return sessionId;
  } catch {
    return null;
  }
}
