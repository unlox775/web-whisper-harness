import { useEffect, useRef, useState } from 'react';
import {
  ingestGrowingSession,
  overlayTranscriptText,
} from '../orchestration';
import { formatDuration } from '../format';
import { useApp } from '../context';
import {
  isRecordScreenshot,
  readScreenshotMode,
  recordScreenshotPreview,
} from '../screenshotMode';
import type { SnipRecord, TranscriptRecord } from '../types';

export function RecordingScreen() {
  const app = useApp();
  const screenshot = readScreenshotMode();
  const preview = isRecordScreenshot(screenshot) ? recordScreenshotPreview(screenshot) : null;

  const [seconds, setSeconds] = useState(preview?.seconds ?? 0);
  const [liveTranscript, setLiveTranscript] = useState(preview?.transcript ?? '');
  const [snipsGathered, setSnipsGathered] = useState(preview?.snipsGathered ?? 0);
  const [showPending, setShowPending] = useState(preview?.pending ?? true);
  const [failedSnips, setFailedSnips] = useState<string[]>([]);
  const [retrying, setRetrying] = useState(false);
  const transcriptBoxRef = useRef<HTMLDivElement>(null);

  function applyDurableState(
    snips: SnipRecord[],
    transcripts: TranscriptRecord[],
    failures: Array<{ snipId: string; error: string }> = []
  ) {
    const text = overlayTranscriptText(snips, transcripts);
    setLiveTranscript(text);
    setSnipsGathered(snips.length);
    if (text.trim()) setShowPending(false);
    const done = new Set(
      transcripts.filter((item) => item.text?.trim()).map((item) => item.snipId)
    );
    setFailedSnips((prev) => {
      const next = new Set(prev);
      for (const failure of failures) next.add(failure.snipId);
      return [...next].filter((id) => !done.has(id));
    });
  }

  useEffect(() => {
    if (preview) return undefined;
    const timer = window.setInterval(() => {
      const status = app.captureHandle?.getStatus();
      if (status) {
        setSeconds(status.currentDuration);
      }
    }, 100);
    return () => window.clearInterval(timer);
  }, [app.captureHandle, preview]);

  useEffect(() => {
    if (preview) return undefined;
    const handle = app.captureHandle;
    const sessionId = app.recordingSessionId;
    if (!handle || !sessionId) return undefined;

    const apiKey = app.settings.groqApiKey;
    const canTranscribe = Boolean(apiKey && app.settings.keyValid);

    const runTick = async () => {
      try {
        const result = await ingestGrowingSession(sessionId, {
          apiKey: canTranscribe ? apiKey : undefined,
          includeTrailing: false,
          transcribe: canTranscribe,
        });
        applyDurableState(result.snips, result.transcripts, result.failures);
      } catch (err) {
        console.error('Live snip ingest failed', err);
      }
    };

    handle.on('chunkEncoded', runTick);
    return () => {
      handle.off('chunkEncoded', runTick);
    };
  }, [
    app.captureHandle,
    app.recordingSessionId,
    app.settings.groqApiKey,
    app.settings.keyValid,
    preview,
  ]);

  useEffect(() => {
    if (transcriptBoxRef.current) {
      transcriptBoxRef.current.scrollTop = transcriptBoxRef.current.scrollHeight;
    }
  }, [liveTranscript]);

  async function handleRetry() {
    if (!app.settings.groqApiKey || !app.settings.keyValid || !app.recordingSessionId) return;
    setRetrying(true);
    try {
      const result = await ingestGrowingSession(app.recordingSessionId, {
        apiKey: app.settings.groqApiKey,
        includeTrailing: false,
        transcribe: true,
      });
      applyDurableState(result.snips, result.transcripts, result.failures);
    } catch (err) {
      console.error('Retry live snip transcription failed', err);
    }
    setRetrying(false);
  }

  const hasTranscript = liveTranscript.trim().length > 0;
  const showOverlay = Boolean(preview) || Boolean(app.settings.groqApiKey && app.settings.keyValid);
  const showDeveloperHud = preview ? preview.showDeveloperHud : app.settings.developerModeEnabled;

  return (
    <main className="recording">
      <div className="rec-hud">
        <div className="rec-indicator">
          <span className="pulse" aria-hidden="true" />
          <span>Recording</span>
        </div>
        <div className="duration">{formatDuration(seconds)}</div>
        {showDeveloperHud ? (
          <p className="tiny rec-dev-line">{snipsGathered} snips gathered</p>
        ) : null}
      </div>

      {showOverlay ? (
        <div className="rec-overlay-slot">
          <div className="live-transcript-overlay">
            <h3 className="overlay-title">Live transcription</h3>
            {showPending && !hasTranscript ? (
              <p className="pending-message">Pending - first words arrive in about 30 seconds.</p>
            ) : (
              <div className="transcript-box" ref={transcriptBoxRef}>
                {hasTranscript ? liveTranscript : ''}
              </div>
            )}
            {failedSnips.length > 0 ? (
              <button
                className="retry-tx-btn"
                disabled={retrying}
                onClick={() => void handleRetry()}
              >
                {retrying ? 'RETRYING...' : 'RETRY TX'}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="rec-stop-slot">
        <button
          type="button"
          className="stop-btn"
          data-testid="stop-recording"
          onClick={() => void app.stopRecording()}
        >
          Stop Recording
        </button>
      </div>
    </main>
  );
}
