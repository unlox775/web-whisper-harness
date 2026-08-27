import { useEffect, useState } from 'react';
import { formatDuration } from '../format';
import { useApp } from '../context';

export function RecordingScreen() {
  const app = useApp();
  const [seconds, setSeconds] = useState(0);
  const [bufferSamples, setBufferSamples] = useState(0);

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
      <button className="stop-btn" onClick={() => void app.stopRecording()}>
        Stop Recording
      </button>
    </main>
  );
}
