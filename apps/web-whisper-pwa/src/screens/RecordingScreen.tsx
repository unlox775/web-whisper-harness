import { useEffect, useRef, useState } from 'react';
import * as sessionStore from '@web-whisper/session-store';
import { transcribeAudio } from '@web-whisper/transcription-client';
import { formatDuration } from '../format';
import { useApp } from '../context';

export function RecordingScreen() {
  const app = useApp();
  const [seconds, setSeconds] = useState(0);
  const [bufferSamples, setBufferSamples] = useState(0);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [showPending, setShowPending] = useState(true);
  const [failedChunks, setFailedChunks] = useState<string[]>([]);
  const [retrying, setRetrying] = useState(false);
  const transcriptBoxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const status = app.captureHandle?.getStatus();
      if (status) {
        setSeconds(status.currentDuration);
        setBufferSamples(status.bufferSamples || 0);
      }
    }, 100);
    return () => window.clearInterval(timer);
  }, [app.captureHandle]);

  useEffect(() => {
    const handle = app.captureHandle;
    if (!handle || !app.settings.groqApiKey || !app.settings.keyValid || !app.recordingSessionId) return;

    const handleChunkEncoded = async (event: { sessionId: string; seq: number; blob?: Blob }) => {
      const { sessionId, seq, blob } = event;
      
      try {
        let chunkBlob = blob;
        
        if (!chunkBlob) {
          await new Promise(resolve => setTimeout(resolve, 200));
          const chunks = await sessionStore.getChunksForSession(sessionId);
          const chunk = chunks.chunks?.find((c: any) => c.seq === seq);
          if (chunk) {
            const fullChunk = await sessionStore.getChunk(chunk.id);
            chunkBlob = fullChunk?.blob;
          }
        }
        
        if (!chunkBlob) return;

        const result = await transcribeAudio(chunkBlob, {
          apiKey: app.settings.groqApiKey,
          mode: 'live',
        });

        if ('error' in result && result.error) {
          setFailedChunks((prev) => [...prev, `${sessionId}-${seq}`]);
          console.error('Live transcription failed for chunk:', seq, result.error);
        } else {
          const text = result.text || '';
          if (text.trim()) {
            setLiveTranscript((prev) => (prev ? prev + ' ' + text : text));
            setShowPending(false);
          }
        }
      } catch (err) {
        setFailedChunks((prev) => [...prev, `${sessionId}-${seq}`]);
        console.error('Live transcription failed for chunk:', seq, err);
      }
    };

    handle.on('chunkEncoded', handleChunkEncoded);

    return () => {
      handle.off('chunkEncoded', handleChunkEncoded);
    };
  }, [app.captureHandle, app.settings.groqApiKey, app.settings.keyValid, app.recordingSessionId]);

  useEffect(() => {
    if (transcriptBoxRef.current) {
      transcriptBoxRef.current.scrollTop = transcriptBoxRef.current.scrollHeight;
    }
  }, [liveTranscript]);

  async function handleRetry() {
    if (!app.settings.groqApiKey || !app.settings.keyValid || !app.recordingSessionId) return;
    setRetrying(true);
    const failedKeys = [...failedChunks];
    const results: string[] = [];
    
    const allChunks = await sessionStore.getChunksForSession(app.recordingSessionId);
    
    for (const failedKey of failedKeys) {
      const [sessionId, seqStr] = failedKey.split('-');
      const seq = parseInt(seqStr, 10);
      
      try {
        const chunk = allChunks.chunks?.find((c: any) => c.seq === seq);
        if (!chunk) continue;
        
        const fullChunk = await sessionStore.getChunk(chunk.id);
        if (!fullChunk?.blob) continue;

        const result = await transcribeAudio(fullChunk.blob, {
          apiKey: app.settings.groqApiKey,
          mode: 'live',
        });

        if (!('error' in result) || !result.error) {
          const text = result.text || '';
          if (text.trim()) {
            results.push(text);
          }
          setFailedChunks((prev) => prev.filter((id) => id !== failedKey));
        }
      } catch (err) {
        console.error('Retry transcription failed for chunk:', seq, err);
      }
    }
    if (results.length > 0) {
      setLiveTranscript((prev) => (prev ? prev + ' ' + results.join(' ') : results.join(' ')));
    }
    setRetrying(false);
  }

  const hasTranscript = liveTranscript.trim().length > 0;
  const showOverlay = app.settings.groqApiKey && app.settings.keyValid;

  return (
    <main className="recording">
      <div className="rec-indicator">
        <span className="pulse" aria-hidden="true" />
        <span>Recording</span>
      </div>
      <div className="duration">{formatDuration(seconds)}</div>
      {app.settings.developerModeEnabled ? (
        <>
          <p className="tiny">{app.chunkCount} chunks</p>
          <p className="tiny">Buffer: {bufferSamples} samples</p>
        </>
      ) : null}

      {showOverlay ? (
        <div className="live-transcript-overlay">
          <h3 className="overlay-title">Live transcription</h3>
          {showPending && !hasTranscript ? (
            <p className="pending-message">Pending - first words arrive in about 30 seconds.</p>
          ) : (
            <div className="transcript-box" ref={transcriptBoxRef}>
              {hasTranscript ? liveTranscript : ''}
            </div>
          )}
          {failedChunks.length > 0 ? (
            <button
              className="retry-tx-btn"
              disabled={retrying}
              onClick={handleRetry}
            >
              {retrying ? 'RETRYING...' : 'RETRY TX'}
            </button>
          ) : null}
        </div>
      ) : null}

      <button className="stop-btn" onClick={() => void app.stopRecording()}>
        Stop Recording
      </button>
    </main>
  );
}
