// Real capture-engine, in-memory only. Must never open IndexedDB `web-whisper-db`
// or write PWA localStorage keys. Reserved unused namespace:
// `web-whisper-isolation-demo-capture-engine`.
import { startCapture, CaptureError } from '@web-whisper/capture-engine';
import '../../../isolation-demo-shared/compact-mobile.css';

let captureHandle = null;
let updateInterval = null;
let chunks = [];

const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const resetBtn = document.getElementById('resetBtn');
const audioSourceRadios = document.querySelectorAll('input[name="audioSource"]');
const micStatus = document.getElementById('micStatus');
const durationMeter = document.getElementById('durationMeter');
const pcmBufferMeter = document.getElementById('pcmBufferMeter');
const chunkCountMeter = document.getElementById('chunkCountMeter');
const watchdogMeter = document.getElementById('watchdogMeter');
const watchdogMeterItem = document.getElementById('watchdogMeterItem');
const chunkTapeBody = document.getElementById('chunkTapeBody');
const eventFeed = document.getElementById('eventFeed');
const dataModeChip = document.getElementById('dataModeChip');

function selectedAudioSource() {
  return document.querySelector('input[name="audioSource"]:checked')?.value || 'live';
}

function updateDataModeChip() {
  const live = selectedAudioSource() === 'live';
  dataModeChip.textContent = live
    ? 'LIVE MICROPHONE (in-memory)'
    : 'SIMULATED PCM (in-memory)';
  dataModeChip.classList.toggle('live', live);
}

audioSourceRadios.forEach((radio) => {
  radio.addEventListener('change', updateDataModeChip);
});

startBtn.addEventListener('click', async () => {
  try {
    const audioSource = selectedAudioSource();
    if (audioSource === 'live') {
      updateMicStatus('requesting');
    }

    captureHandle = await startCapture(`iso-capture-${Date.now()}`, {
      audioSource,
      chunkTargetDuration: 4.0,
      watchdogTimeout: 10.0,
      inMemory: true,
    });

    if (audioSource === 'live') {
      updateMicStatus('granted');
    }

    captureHandle.on('chunkEncoded', handleChunkEncoded);
    captureHandle.on('captureError', handleCaptureError);
    captureHandle.on('captureStopped', handleCaptureStopped);

    startBtn.disabled = true;
    stopBtn.disabled = false;
    audioSourceRadios.forEach((radio) => {
      radio.disabled = true;
    });

    updateInterval = setInterval(updateMeters, 100);
    watchdogMeterItem.style.display = 'flex';

    addEvent('info', `Capture started (${audioSource})`);
  } catch (error) {
    const code = error instanceof CaptureError ? error.code : error.name;
    const message = error?.message || String(error);
    addEvent('error', `Failed to start capture: ${message}`);
    if (code === 'permission_denied' || error?.name === 'NotAllowedError') {
      updateMicStatus('denied');
      alert('Microphone permission denied. Please allow microphone access in browser settings.');
    } else if (code === 'no_microphone_found' || error?.name === 'NotFoundError') {
      updateMicStatus('denied');
      alert('No microphone found.');
    } else {
      updateMicStatus('denied');
    }
    captureHandle = null;
  }
});

stopBtn.addEventListener('click', async () => {
  if (captureHandle) {
    try {
      const summary = await captureHandle.stop();
      addEvent(
        'info',
        `Capture stopped: ${summary.chunksWritten} chunks, ${summary.totalDuration.toFixed(2)}s`
      );
    } catch (error) {
      addEvent('error', `Error stopping capture: ${error.message}`);
    }
  }
});

resetBtn.addEventListener('click', () => {
  chunks.forEach((chunk) => {
    if (chunk.blobUrl) {
      URL.revokeObjectURL(chunk.blobUrl);
    }
  });
  chunks = [];

  chunkTapeBody.innerHTML =
    '<tr class="empty-state"><td colspan="6">No chunks yet. Click Start Capture.</td></tr>';
  durationMeter.textContent = '0.00s';
  pcmBufferMeter.textContent = '0 samples';
  chunkCountMeter.textContent = '0';
  watchdogMeter.textContent = 'N/A';
  watchdogMeterItem.style.display = 'none';
  eventFeed.innerHTML = '';

  if (captureHandle) {
    captureHandle.stop().catch(() => {});
    captureHandle = null;
  }

  if (updateInterval) {
    clearInterval(updateInterval);
    updateInterval = null;
  }

  startBtn.disabled = false;
  stopBtn.disabled = true;
  audioSourceRadios.forEach((radio) => {
    radio.disabled = false;
  });

  addEvent('info', 'Demo reset');
});

function handleChunkEncoded(data) {
  const blob = data.blob;
  const chunk = {
    seq: data.seq,
    startTime: data.startTime,
    endTime: data.endTime,
    duration: data.duration,
    byteLength: data.byteLength,
    blob,
    blobUrl: blob ? URL.createObjectURL(blob) : null,
  };

  chunks.push(chunk);

  const emptyState = chunkTapeBody.querySelector('.empty-state');
  if (emptyState) {
    emptyState.remove();
  }

  const row = document.createElement('tr');
  row.innerHTML = `
    <td>${chunk.seq}</td>
    <td>${chunk.startTime.toFixed(2)}s</td>
    <td>${chunk.endTime.toFixed(2)}s</td>
    <td>${chunk.duration.toFixed(2)}s</td>
    <td>${formatBytes(chunk.byteLength)}</td>
    <td>${chunk.blobUrl ? `<button class="play-btn" data-seq="${chunk.seq}">▶ Play</button>` : '—'}</td>
  `;

  const playBtn = row.querySelector('.play-btn');
  if (playBtn) {
    playBtn.addEventListener('click', () => playChunk(chunk));
  }

  chunkTapeBody.appendChild(row);

  addEvent(
    'success',
    `Chunk ${data.seq} encoded: ${data.startTime.toFixed(2)}s–${data.endTime.toFixed(2)}s (${formatBytes(data.byteLength)})`
  );
}

function handleCaptureError(data) {
  addEvent('error', `Capture error: ${data.reason} - ${data.details || ''}`);

  if (data.reason === 'no_audio_received') {
    alert(
      'Recording completed without playable audio. The microphone may not have delivered audio.'
    );
  }
}

function handleCaptureStopped(data) {
  startBtn.disabled = false;
  stopBtn.disabled = true;
  audioSourceRadios.forEach((radio) => {
    radio.disabled = false;
  });

  if (updateInterval) {
    clearInterval(updateInterval);
    updateInterval = null;
  }

  watchdogMeterItem.style.display = 'none';
  watchdogMeter.textContent = 'N/A';
  captureHandle = null;

  addEvent(
    'info',
    `Capture stopped: ${data.chunksWritten} chunks, ${data.totalDuration.toFixed(2)}s, hasAudio=${data.hasAudio}`
  );
}

function updateMeters() {
  if (!captureHandle) return;

  const status = captureHandle.getStatus();

  durationMeter.textContent = `${status.currentDuration.toFixed(2)}s`;
  chunkCountMeter.textContent = status.chunksEncoded;
  pcmBufferMeter.textContent = `${status.bufferSamples ?? 0} samples`;

  if (status.watchdogActive) {
    watchdogMeter.textContent = `${status.watchdogRemaining.toFixed(1)}s`;
  } else {
    watchdogMeter.textContent = 'N/A';
    watchdogMeterItem.style.display = 'none';
  }
}

function playChunk(chunk) {
  if (!chunk.blobUrl) {
    addEvent('error', `Chunk ${chunk.seq} has no playable blob`);
    return;
  }
  const audio = new Audio();
  audio.src = chunk.blobUrl;
  audio.play().catch((error) => {
    console.error('Error playing chunk:', error);
    addEvent('error', `Failed to play chunk ${chunk.seq}: ${error.message}`);
  });

  addEvent('info', `Playing chunk ${chunk.seq}`);
}

function addEvent(type, message) {
  const timestamp = new Date().toLocaleTimeString('en-US', {
    hour12: false,
    fractionalSecondDigits: 3,
  });
  const entry = document.createElement('div');
  entry.className = `event-entry ${type}`;
  entry.innerHTML = `<span class="event-timestamp">[${timestamp}]</span>${message}`;
  eventFeed.appendChild(entry);
  eventFeed.scrollTop = eventFeed.scrollHeight;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function updateMicStatus(status) {
  const labels = {
    granted: 'Granted',
    denied: 'Denied',
    requesting: 'Requesting…',
    'not-requested': 'Not requested',
  };
  micStatus.textContent = labels[status] || status;
  micStatus.className = `mic-status ${status}`;
}

updateMicStatus('not-requested');
updateDataModeChip();
addEvent('info', 'Demo initialized. Live microphone is the primary source (in-memory, not persisted).');
