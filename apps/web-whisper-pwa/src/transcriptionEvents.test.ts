import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  emitTranscriptionEvent,
  onTranscriptionEvent,
  subscribeSessionTranscription,
} from './transcriptionEvents.ts';

describe('transcriptionEvents', () => {
  it('delivers snip-complete and transcription-finished to subscribers', () => {
    const seen: string[] = [];
    const stop = onTranscriptionEvent((event) => {
      seen.push(`${event.type}:${event.sessionId}:${event.snipId ?? ''}`);
    });
    emitTranscriptionEvent({ type: 'snip-complete', sessionId: 'ses-1', snipId: 'snip-a' });
    emitTranscriptionEvent({ type: 'transcription-finished', sessionId: 'ses-1' });
    stop();
    emitTranscriptionEvent({ type: 'transcription-finished', sessionId: 'ses-1' });
    assert.deepEqual(seen, [
      'snip-complete:ses-1:snip-a',
      'transcription-finished:ses-1:',
    ]);
  });

  it('subscribeSessionTranscription ignores other session ids', () => {
    const hits: string[] = [];
    const stop = subscribeSessionTranscription('ses-keep', (event) => {
      hits.push(event.type);
    });
    emitTranscriptionEvent({ type: 'snip-complete', sessionId: 'ses-other', snipId: 'x' });
    emitTranscriptionEvent({ type: 'transcription-finished', sessionId: 'ses-keep' });
    stop();
    assert.deepEqual(hits, ['transcription-finished']);
  });
});
