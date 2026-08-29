import * as sessionStore from '@web-whisper/session-store';
import { transcribeAudio } from '@web-whisper/transcription-client';
import {
  analyzeVolumeForSession,
  proposeSnipsForSession,
} from '@web-whisper/volume-analyzer';
import type { SnipRecord, TranscriptRecord } from './types';

export { buildTranscriptText } from './transcriptText';

export type TranscribeProgress = {
  phase: 'analyzing' | 'transcribing';
  completed: number;
  total: number;
};

export type TranscribeOutcome = {
  total: number;
  completed: number;
  failed: number;
  empty?: boolean;
  stopReason?: string;
  failures: Array<{ snipId: string; error: string }>;
};

export type LiveIngestResult = {
  snips: SnipRecord[];
  transcripts: TranscriptRecord[];
  failures: Array<{ snipId: string; error: string }>;
};

const ingestChains = new Map<string, Promise<unknown>>();
const transcribingSnips = new Set<string>();

function withSessionLock<T>(sessionId: string, fn: () => Promise<T>): Promise<T> {
  const previous = ingestChains.get(sessionId) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(fn);
  ingestChains.set(sessionId, next);
  return next;
}

async function assembleSnipBlob(snip: SnipRecord): Promise<Blob> {
  const blobs: Blob[] = [];
  for (const chunkId of snip.chunkIds || []) {
    const chunk = await sessionStore.getChunk(chunkId);
    if (chunk?.blob && chunk.blob.size > 0) blobs.push(chunk.blob);
  }
  return new Blob(blobs, { type: 'audio/mpeg' });
}

async function loadDurableState(sessionId: string): Promise<{
  snips: SnipRecord[];
  transcripts: TranscriptRecord[];
}> {
  const snipsResult = await sessionStore.getSnipsForSession(sessionId);
  const transcriptsResult = await sessionStore.getTranscriptsForSession(sessionId);
  return {
    snips: (snipsResult.snips || []) as SnipRecord[],
    transcripts: (transcriptsResult.transcripts || []) as TranscriptRecord[],
  };
}

/**
 * Concatenate durable snip transcripts for the live overlay (no timestamps).
 */
export function overlayTranscriptText(
  snips: SnipRecord[],
  transcripts: TranscriptRecord[]
): string {
  const bySnip = new Map(transcripts.map((item) => [item.snipId, item.text]));
  return snips
    .map((snip) => (bySnip.get(snip.id) || '').trim())
    .filter((text) => text.length > 0)
    .join(' ')
    .trim();
}

export async function ensureSnips(sessionId: string): Promise<SnipRecord[]> {
  const analysis = await analyzeVolumeForSession(sessionId);
  if (!analysis.success) {
    const existing = await sessionStore.getSnipsForSession(sessionId);
    if (existing.snips?.length) return existing.snips as SnipRecord[];
    throw new Error(analysis.error || 'Volume analysis failed');
  }
  const proposed = await proposeSnipsForSession(sessionId, { includeTrailing: true });
  if (!proposed.success) {
    const existing = await sessionStore.getSnipsForSession(sessionId);
    if (existing.snips?.length) return existing.snips as SnipRecord[];
    throw new Error(proposed.error || 'Snip proposal failed');
  }
  const next = await sessionStore.getSnipsForSession(sessionId);
  return (next.snips || []) as SnipRecord[];
}

async function transcribePendingSnips(
  snips: SnipRecord[],
  apiKey: string,
  already: TranscriptRecord[],
  onProgress?: (progress: TranscribeProgress) => void,
  onTranscriptWritten?: () => Promise<void> | void
): Promise<{
  completed: number;
  failed: number;
  stopReason?: string;
  failures: Array<{ snipId: string; error: string }>;
}> {
  const done = new Set(
    already.filter((item) => item.text?.trim()).map((item) => item.snipId)
  );

  const targets = snips.filter((snip) => !done.has(snip.id) && !transcribingSnips.has(snip.id));
  let completed = snips.length - targets.length;
  let failed = 0;
  const failures: Array<{ snipId: string; error: string }> = [];

  for (const snip of targets) {
    onProgress?.({
      phase: 'transcribing',
      completed,
      total: snips.length,
    });
    transcribingSnips.add(snip.id);
    try {
      const blob = await assembleSnipBlob(snip);
      if (blob.size === 0) {
        failed += 1;
        failures.push({ snipId: snip.id, error: 'No audio for snip' });
        continue;
      }
      const result = await transcribeAudio(blob, { apiKey, mode: 'live' });
      if ('error' in result && result.error) {
        failed += 1;
        failures.push({ snipId: snip.id, error: result.error });
        if (result.error === 'Invalid API key' || result.error === 'Rate limit exceeded') {
          return {
            completed,
            failed,
            stopReason: result.error,
            failures,
          };
        }
        continue;
      }
      await sessionStore.writeTranscript(snip.id, result.text || '');
      completed += 1;
      if (onTranscriptWritten) {
        await onTranscriptWritten();
      }
    } finally {
      transcribingSnips.delete(snip.id);
    }
  }

  return { completed, failed, failures };
}

/**
 * Original web-whisper live path: volume/snip on the growing session, persist
 * closed snips, transcribe each through transcription-client, write transcripts
 * to session-store. Overlay reads that durable state.
 *
 * While recording pass `{ includeTrailing: false }` so the in-progress tail is
 * not committed. After Stop pass `{ includeTrailing: true }` to seal the last snip.
 */
export function ingestGrowingSession(
  sessionId: string,
  options: {
    apiKey?: string | null;
    includeTrailing?: boolean;
    transcribe?: boolean;
    onTranscriptWritten?: () => Promise<void> | void;
  } = {}
): Promise<LiveIngestResult> {
  return withSessionLock(sessionId, async () => {
    const includeTrailing = options.includeTrailing === true;
    const analysis = await analyzeVolumeForSession(sessionId);
    if (analysis.success) {
      await proposeSnipsForSession(sessionId, { includeTrailing });
    }

    let { snips, transcripts } = await loadDurableState(sessionId);
    const failures: Array<{ snipId: string; error: string }> = [];

    if (options.transcribe && options.apiKey) {
      const outcome = await transcribePendingSnips(
        snips,
        options.apiKey,
        transcripts,
        undefined,
        options.onTranscriptWritten
      );
      failures.push(...outcome.failures);
      ({ snips, transcripts } = await loadDurableState(sessionId));
    }

    return { snips, transcripts, failures };
  });
}

export async function transcribeSession(
  sessionId: string,
  apiKey: string,
  onProgress: (progress: TranscribeProgress) => void,
  options?: { retryFailedOnly?: boolean; onTranscriptWritten?: () => Promise<void> | void }
): Promise<TranscribeOutcome> {
  onProgress({ phase: 'analyzing', completed: 0, total: 0 });
  const snips = await ensureSnips(sessionId);
  if (snips.length === 0) {
    return { total: 0, completed: 0, failed: 0, empty: true, failures: [] };
  }

  const transcriptsResult = await sessionStore.getTranscriptsForSession(sessionId);
  const transcripts: TranscriptRecord[] = transcriptsResult.transcripts || [];

  // RETRY TX / re-transcribe never throws away audio or existing transcripts.
  // Always skip snips that already have text; only missed/failed snips run.
  void options?.retryFailedOnly;
  const outcome = await transcribePendingSnips(
    snips,
    apiKey,
    transcripts,
    onProgress,
    options?.onTranscriptWritten
  );
  return {
    total: snips.length,
    completed: outcome.completed,
    failed: outcome.failed,
    stopReason: outcome.stopReason,
    failures: outcome.failures,
  };
}
