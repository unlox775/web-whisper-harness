import {
  playSession,
  playChunk,
  playSnip,
  fixtureStore,
  type PlaybackHandle,
  type PlaybackError,
} from '../../src/index.js';

// State
let currentHandle: PlaybackHandle | null = null;
let currentDuration = 11.6;

// DOM elements
const btnPlay = document.getElementById('btn-play') as HTMLButtonElement;
const btnPause = document.getElementById('btn-pause') as HTMLButtonElement;
const btnResume = document.getElementById('btn-resume') as HTMLButtonElement;
const btnStop = document.getElementById('btn-stop') as HTMLButtonElement;
const seekSlider = document.getElementById('seek-slider') as HTMLInputElement;
const stateDisplay = document.getElementById('state-display') as HTMLDivElement;
const timeDisplay = document.getElementById('time-display') as HTMLDivElement;
const eventFeed = document.getElementById('event-feed') as HTMLDivElement;
const targetSelect = document.getElementById('target-select') as HTMLSelectElement;

// Radio buttons for target selection
const radioButtons = document.querySelectorAll<HTMLInputElement>('input[name="target"]');

// Initialize
async function initialize() {
  await fixtureStore.initialize();
  setupEventListeners();
  updateTargetOptions();
}

function setupEventListeners() {
  btnPlay.addEventListener('click', handlePlay);
  btnPause.addEventListener('click', handlePause);
  btnResume.addEventListener('click', handleResume);
  btnStop.addEventListener('click', handleStop);
  seekSlider.addEventListener('input', handleSeek);

  radioButtons.forEach(radio => {
    radio.addEventListener('change', updateTargetOptions);
  });
}

function updateTargetOptions() {
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

async function handlePlay() {
  const selectedTarget = document.querySelector<HTMLInputElement>('input[name="target"]:checked')?.value;

  try {
    let result: PlaybackHandle | PlaybackError;

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

    if ('error' in result) {
      logEvent('error', `Error: ${result.error}`, result);
      return;
    }

    currentHandle = result;
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

  handle.on('playbackError', (data: { reason: string; detail?: any }) => {
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

function logEvent(type: string, message: string, data: any) {
  const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false, fractionalSecondDigits: 3 });
  const entry = document.createElement('div');
  entry.className = `event-entry ${type}`;
  entry.innerHTML = `<span class="event-timestamp">[${timestamp}]</span>${message}`;
  eventFeed.appendChild(entry);
  eventFeed.scrollTop = eventFeed.scrollHeight;

  // Limit event feed to last 100 entries
  while (eventFeed.children.length > 100) {
    eventFeed.removeChild(eventFeed.firstChild!);
  }
}

// Start the demo
initialize().catch(error => {
  console.error('Initialization error:', error);
  logEvent('error', 'Failed to initialize demo', error);
});
