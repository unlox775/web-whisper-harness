export type TranscriptionEventType = 'snip-complete' | 'transcription-finished';

export type TranscriptionEvent = {
  type: TranscriptionEventType;
  sessionId: string;
  snipId?: string;
};

type Listener = (event: TranscriptionEvent) => void;

const listeners = new Set<Listener>();

export function onTranscriptionEvent(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function emitTranscriptionEvent(event: TranscriptionEvent): void {
  for (const listener of listeners) {
    listener(event);
  }
}

export function subscribeSessionTranscription(
  sessionId: string,
  onEvent: (event: TranscriptionEvent) => void
): () => void {
  return onTranscriptionEvent((event) => {
    if (event.sessionId === sessionId) onEvent(event);
  });
}
