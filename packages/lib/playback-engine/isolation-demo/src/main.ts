import {
  playSession,
  playChunk,
  playSnip,
  playBlobs,
  fixtureStore,
  type PlaybackHandle,
  type PlaybackError,
} from '../../src/index.js';
import { startCapture, CaptureError } from '@web-whisper/capture-engine';
import '../../../../isolation-demo-shared/compact-mobile.css';

// Storage: live chunks in RAM, or in-memory fixture blobs. Must never open
// IndexedDB `web-whisper-db`. Reserved unused namespace:
// `web-whisper-isolation-demo-playback-engine`.

type LiveChunk = {
  seq: number;
  startTime: number;
  endTime: number;
  duration: number;
  blob: Blob;
};

let currentHandle: PlaybackHandle | null = null;
let currentDuration = 11.6;
let captureHandle: Awaited<ReturnType<typeof startCapture>> | null = null;
let liveChunks: LiveChunk[] = [];
let meterTimer: ReturnType<typeof setInterval> | null = null;

const btnPlay = document.getElementById('btn-play') as HTMLButtonElement;
const btnPause = document.getElementById('btn-pause') as HTMLButtonElement;
const btnResume = document.getElementById('btn-resume') as HTMLButtonElement;
const btnStop = document.getElementById('btn-stop') as HTMLButtonElement;
const btnRecord = document.getElementById('btn-record') as HTMLButtonElement;
const btnRecordStop = document.getElementById('btn-record-stop') as HTMLButtonElement;
const seekSlider = document.getElementById('seek-slider') as HTMLInputElement;
const volumeSlider = document.getElementById('volume-slider') as HTMLInputElement;
const volumeValue = document.getElementById('volume-value') as HTMLSpanElement;
const volumeNote = document.getElementById('volume-note') as HTMLParagraphElement;
const stateDisplay = document.getElementById('state-display') as HTMLDivElement;
const timeDisplay = document.getElementById('time-display') as HTMLDivElement;
const eventFeed = document.getElementById('event-feed') as HTMLDivElement;
const targetSelect = document.getElementById('target-select') as HTMLSelectElement;
const dataModeChip = document.getElementById('data-mode-chip') as HTMLDivElement;
const liveStatus = document.getElementById('live-status') as HTMLDivElement;
const livePanel = document.getElementById('live-panel') as HTMLDivElement;
const fixtureTargetPanel = document.getElementById('fixture-target-panel') as HTMLDivElement;
const radioButtons = document.querySelectorAll<HTMLInputElement>('input[name="target"]');
const sourceRadios = document.querySelectorAll<HTMLInputElement>('input[name="audio-source"]');

function isLiveSource() {
  return document.querySelector<HTMLInputElement>('input[name="audio-source"]:checked')?.value === 'live';
}

async function initialize() {
  await fixtureStore.initialize();
  setupEventListeners();
  updateVolumeLabel(readSliderVolume());
  updateSourceMode();
}

function setupEventListeners() {
  btnPlay.addEventListener('click', () => void handlePlay());
  btnPause.addEventListener('click', handlePause);
  btnResume.addEventListener('click', handleResume);
  btnStop.addEventListener('click', handleStop);
  btnRecord.addEventListener('click', () => void handleRecordStart());
  btnRecordStop.addEventListener('click', () => void handleRecordStop());
  seekSlider.addEventListener('input', handleSeek);
  volumeSlider.addEventListener('input', handleVolumeChange);
  radioButtons.forEach((radio) => radio.addEventListener('change', updateTargetOptions));
  sourceRadios.forEach((radio) => radio.addEventListener('change', updateSourceMode));
}

function updateSourceMode() {
  const live = isLiveSource();
  livePanel.style.display = live ? 'block' : 'none';
  fixtureTargetPanel.style.display = live ? 'none' : 'block';
  dataModeChip.textContent = live ? 'LIVE FROM CAPTURE (in-memory)' : 'FIXTURE MODE (mock audio)';
  dataModeChip.className = `data-mode-chip ${live ? 'live' : 'fixture'}`;
  updateTargetOptions();
  updateLiveStatus();
}

function updateLiveStatus() {
  if (!isLiveSource()) return;
  liveStatus.textContent =
    liveChunks.length === 0
      ? 'No live audio yet. Record, then Play.'
      : `${liveChunks.length} chunk(s), ${liveChunks.reduce((s, c) => s + c.duration, 0).toFixed(1)}s in RAM`;
}

function updateTargetOptions() {
  if (isLiveSource()) {
    currentDuration = liveChunks.reduce((sum, chunk) => sum + chunk.duration, 0) || 0;
    targetSelect.style.display = 'none';
    updateSeekSlider();
    updateTimeDisplay(0, currentDuration);
    return;
  }

  const selectedTarget = document.querySelector<HTMLInputElement>('input[name="target"]:checked')?.value;

  if (selectedTarget === 'session') {
    targetSelect.style.display = 'none';
    currentDuration = 11.6;
  } else if (selectedTarget === 'chunk') {
    targetSelect.style.display = 'block';
    targetSelect.innerHTML = `
      <option value="demo-chunk-000">Chunk 0 (4.0s)</option>
      <option value="demo-chunk-001">Chunk 1 (4.1s)</option>
      <option value="demo-chunk-002">Chunk 2 (3.5s)</option>
    `;
    currentDuration = 4.0;
  } else if (selectedTarget === 'snip') {
    targetSelect.style.display = 'block';
    targetSelect.innerHTML = `
      <option value="demo-snip-000">Snip 0: First snip (8.1s)</option>
      <option value="demo-snip-001">Snip 1: Second snip (3.5s)</option>
    `;
    currentDuration = 8.1;
  }

  updateSeekSlider();
  updateTimeDisplay(0, currentDuration);
}

async function handleRecordStart() {
  liveChunks = [];
  updateLiveStatus();
  try {
    captureHandle = await startCapture(`iso-playback-${Date.now()}`, {
      audioSource: 'live',
      chunkTargetDuration: 4.0,
      watchdogTimeout: 10.0,
      inMemory: true,
    });
    captureHandle.on('chunkEncoded', (data: LiveChunk & { blob?: Blob }) => {
      if (!data.blob) return;
      liveChunks.push({
        seq: data.seq,
        startTime: data.startTime,
        endTime: data.endTime,
        duration: data.duration,
        blob: data.blob,
      });
      updateLiveStatus();
      logEvent('info', `Live chunk ${data.seq} encoded (${data.duration.toFixed(2)}s)`, data);
    });
    captureHandle.on('captureError', (data: { reason?: string }) => {
      logEvent('error', `Capture error: ${data.reason}`, data);
      btnRecord.disabled = false;
      btnRecordStop.disabled = true;
    });
    captureHandle.on('captureStopped', (data: { chunksWritten?: number }) => {
      logEvent('info', `Live capture stopped (${data.chunksWritten ?? 0} chunks)`, data);
      btnRecord.disabled = false;
      btnRecordStop.disabled = true;
      captureHandle = null;
      if (meterTimer) {
        clearInterval(meterTimer);
        meterTimer = null;
      }
      updateTargetOptions();
    });
    btnRecord.disabled = true;
    btnRecordStop.disabled = false;
    liveStatus.textContent = 'Recording… speak into the mic';
    meterTimer = setInterval(() => {
      if (!captureHandle) return;
      const status = captureHandle.getStatus();
      liveStatus.textContent = `Recording… ${status.currentDuration.toFixed(1)}s, ${status.chunksEncoded} chunks`;
    }, 200);
    logEvent('info', 'Live capture started', {});
  } catch (error) {
    const code = error instanceof CaptureError ? error.code : '';
    logEvent('error', `Failed to start capture: ${(error as Error).message}`, error);
    if (code === 'permission_denied') {
      alert('Microphone permission denied. Allow access in browser settings.');
    }
  }
}

async function handleRecordStop() {
  if (!captureHandle) return;
  try {
    await captureHandle.stop();
  } catch (error) {
    logEvent('error', `Stop capture failed: ${(error as Error).message}`, error);
  }
}

async function handlePlay() {
  try {
    let result: PlaybackHandle | PlaybackError;

    if (isLiveSource()) {
      if (liveChunks.length === 0) {
        logEvent('error', 'No live audio. Record first.', {});
        return;
      }
      result = await playBlobs(liveChunks.map((chunk) => chunk.blob));
      currentDuration = liveChunks.reduce((sum, chunk) => sum + chunk.duration, 0);
    } else {
      const selectedTarget = document.querySelector<HTMLInputElement>('input[name="target"]:checked')?.value;
      if (selectedTarget === 'session') {
        result = await playSession('demo-session-001');
        currentDuration = 11.6;
      } else if (selectedTarget === 'chunk') {
        const chunkId = targetSelect.value;
        result = await playChunk(chunkId);
        const chunk = await fixtureStore.getChunk(chunkId);
        currentDuration = chunk?.duration || 4.0;
      } else if (selectedTarget === 'snip') {
        const snipId = targetSelect.value;
        result = await playSnip(snipId);
        const snip = await fixtureStore.getSnip(snipId);
        currentDuration = snip?.duration || 8.1;
      } else {
        return;
      }
    }

    if ('error' in result) {
      logEvent('error', `Error: ${result.error}`, result);
      return;
    }

    currentHandle = result;
    applySliderVolume(currentHandle);
    setupHandleListeners(currentHandle);
    updateButtons('playing');
    updateSeekSlider();
  } catch (error) {
    logEvent('error', 'Playback failed', error);
    console.error('Playback error:', error);
  }
}

function handlePause() {
  if (currentHandle) {
    currentHandle.pause();
    updateButtons('paused');
  }
}

function handleResume() {
  if (currentHandle) {
    currentHandle.resume();
    updateButtons('playing');
  }
}

function handleStop() {
  if (currentHandle) {
    currentHandle.stop();
    currentHandle = null;
    updateButtons('idle');
    updateTimeDisplay(0, currentDuration);
    seekSlider.value = '0';
  }
}

function handleSeek(event: Event) {
  if (currentHandle) {
    const time = parseFloat((event.target as HTMLInputElement).value);
    currentHandle.seek(time);
  }
}

function readSliderVolume(): number {
  const volume = parseFloat(volumeSlider.value);
  return Number.isFinite(volume) ? volume : 1;
}

function updateVolumeLabel(volume: number): void {
  if (volumeValue) {
    volumeValue.textContent = volume.toFixed(2);
  }
}

function refreshVolumePathNote(): void {
  if (!volumeNote) return;
  const audio = document.querySelector('audio');
  const path = audio?.dataset.volumePath;
  const applied = Number(audio?.dataset.playbackVolume);
  const shown = Number.isFinite(applied) ? applied.toFixed(2) : readSliderVolume().toFixed(2);
  if (path === 'gain-node') {
    volumeNote.textContent =
      `Loudness path: GainNode (applied ${shown}). iOS Safari ignores HTMLAudioElement.volume.`;
  } else if (path === 'element-volume') {
    volumeNote.textContent = `Loudness path: element.volume fallback (applied ${shown}).`;
  }
}

function applySliderVolume(handle: PlaybackHandle): void {
  const volume = readSliderVolume();
  updateVolumeLabel(volume);
  handle.setVolume(volume);
  refreshVolumePathNote();
}

function handleVolumeChange(event: Event) {
  const volume = parseFloat((event.target as HTMLInputElement).value);
  updateVolumeLabel(Number.isFinite(volume) ? volume : 1);
  if (currentHandle) {
    currentHandle.setVolume(volume);
    refreshVolumePathNote();
  }
}

function setupHandleListeners(handle: PlaybackHandle) {
  handle.on('playing', (data: { currentTime: number; duration: number }) => {
    logEvent('playing', `playing(${data.currentTime.toFixed(1)}s, ${data.duration.toFixed(1)}s)`, data);
    updateStateDisplay('playing');
    currentDuration = data.duration;
    updateSeekSlider();
  });

  handle.on('paused', (data: { currentTime: number }) => {
    logEvent('paused', `paused(${data.currentTime.toFixed(1)}s)`, data);
    updateStateDisplay('paused');
  });

  handle.on('timeupdate', (data: { currentTime: number }) => {
    updateTimeDisplay(data.currentTime, currentDuration);
    seekSlider.value = data.currentTime.toString();
  });

  handle.on('seeked', (data: { currentTime: number }) => {
    logEvent('seeked', `seeked(${data.currentTime.toFixed(1)}s)`, data);
  });

  handle.on('ended', () => {
    logEvent('ended', 'ended()', {});
    currentHandle = null;
    updateButtons('idle');
    updateTimeDisplay(0, currentDuration);
    seekSlider.value = '0';
  });

  handle.on('stopped', () => {
    logEvent('stopped', 'stopped()', {});
    updateStateDisplay('stopped');
  });

  handle.on('playbackError', (data: { reason: string; detail?: unknown }) => {
    logEvent('error', `playbackError(${data.reason})`, data);
  });
}

function updateButtons(state: 'idle' | 'playing' | 'paused') {
  if (state === 'idle') {
    btnPlay.disabled = false;
    btnPause.disabled = true;
    btnResume.disabled = true;
    btnStop.disabled = true;
    seekSlider.disabled = true;
  } else if (state === 'playing') {
    btnPlay.disabled = true;
    btnPause.disabled = false;
    btnResume.disabled = true;
    btnStop.disabled = false;
    seekSlider.disabled = false;
  } else if (state === 'paused') {
    btnPlay.disabled = true;
    btnPause.disabled = true;
    btnResume.disabled = false;
    btnStop.disabled = false;
    seekSlider.disabled = false;
  }
}

function updateStateDisplay(state: 'idle' | 'playing' | 'paused' | 'stopped') {
  stateDisplay.className = `state-display ${state}`;
  stateDisplay.textContent = `State: ${state.charAt(0).toUpperCase() + state.slice(1)}`;
}

function updateTimeDisplay(currentTime: number, duration: number) {
  timeDisplay.textContent = `Time: ${currentTime.toFixed(1)}s / ${duration.toFixed(1)}s`;
}

function updateSeekSlider() {
  seekSlider.max = currentDuration.toString();
}

function logEvent(type: string, message: string, data: unknown) {
  const timestamp = new Date().toLocaleTimeString('en-US', {
    hour12: false,
    fractionalSecondDigits: 3,
  });
  const entry = document.createElement('div');
  entry.className = `event-entry ${type}`;
  entry.innerHTML = `<span class="event-timestamp">[${timestamp}]</span>${message}`;
  eventFeed.appendChild(entry);
  eventFeed.scrollTop = eventFeed.scrollHeight;
  void data;

  while (eventFeed.children.length > 100) {
    eventFeed.removeChild(eventFeed.firstChild!);
  }
}

initialize().catch((error) => {
  console.error('Initialization error:', error);
  logEvent('error', 'Failed to initialize demo', error);
});
