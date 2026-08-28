import * as sessionStore from '@web-whisper/session-store';
import { transcribeAudio } from '@web-whisper/transcription-client';
import {
  analyzeVolumeForSession,
  proposeSnipsForSession,
} from '@web-whisper/volume-analyzer';
import type { SnipRecord, TranscriptRecord } from './types';

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

async function assembleSnipBlob(snip: SnipRecord): Promise<Blob> {
  const blobs: Blob[] = [];
  for (const chunkId of snip.chunkIds || []) {
    const chunk = await sessionStore.getChunk(chunkId);
    if (chunk?.blob) blobs.push(chunk.blob);
  }
  return new Blob(blobs, { type: 'audio/mpeg' });
}

export async function ensureSnips(sessionId: string): Promise<SnipRecord[]> {
  const existing = await sessionStore.getSnipsForSession(sessionId);
  if (existing.snips?.length) return existing.snips as SnipRecord[];

  const analysis = await analyzeVolumeForSession(sessionId);
  if (!analysis.success) {
    throw new Error(analysis.error || 'Volume analysis failed');
  }
  const proposed = await proposeSnipsForSession(sessionId);
  if (!proposed.success) {
    throw new Error(proposed.error || 'Snip proposal failed');
  }
  const next = await sessionStore.getSnipsForSession(sessionId);
  return (next.snips || []) as SnipRecord[];
}

export async function transcribeSession(
  sessionId: string,
  apiKey: string,
  onProgress: (progress: TranscribeProgress) => void,
  options?: { retryFailedOnly?: boolean }
): Promise<TranscribeOutcome> {
  onProgress({ phase: 'analyzing', completed: 0, total: 0 });
  const snips = await ensureSnips(sessionId);
  if (snips.length === 0) {
    return { total: 0, completed: 0, failed: 0, empty: true, failures: [] };
  }

  const transcriptsResult = await sessionStore.getTranscriptsForSession(sessionId);
  const transcripts: TranscriptRecord[] = transcriptsResult.transcripts || [];
  const done = new Set(transcripts.map((item) => item.snipId));

  // RETRY TX / re-transcribe never throws away audio or existing transcripts.
  // Always skip snips that already have text; only missed/failed snips run.
  const targets = snips.filter((snip) => !done.has(snip.id));

  let completed = snips.length - targets.length;
  let failed = 0;
  const failures: Array<{ snipId: string; error: string }> = [];

  for (const snip of targets) {
    onProgress({
      phase: 'transcribing',
      completed,
      total: snips.length,
    });
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
          total: snips.length,
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
  }

  return { total: snips.length, completed, failed, failures };
}

export function buildTranscriptText(
  snips: SnipRecord[],
  transcripts: TranscriptRecord[],
  failures: Array<{ snipId: string; error: string }> = []
): string {
  const bySnip = new Map(transcripts.map((item) => [item.snipId, item.text]));
  const failed = new Set(failures.map((item) => item.snipId));
  return snips
    .map((snip, index) => {
      const stamp = formatStamp(snip.startTime);
      if (failed.has(snip.id) && !bySnip.get(snip.id)) {
        return `[${stamp}] [Snip ${index + 1} failed to transcribe]`;
      }
      const text = bySnip.get(snip.id);
      if (!text) return `[${stamp}]`;
      return `[${stamp}] ${text}`;
    })
    .join('\n\n')
    .trim();
}

function formatStamp(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const m = Math.floor(whole / 60);
  const s = whole % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
