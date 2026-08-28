// Demo app logic
// Storage: in-memory only. Must never open IndexedDB `web-whisper-db` or write
// PWA localStorage keys. Reserved unused namespace:
// `web-whisper-isolation-demo-capture-engine`.
let captureHandle = null;
let updateInterval = null;
let chunks = [];

// UI Elements
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

// Mock capture engine implementation for demo
class MockCaptureEngine {
  constructor(sessionId, options) {
    this.sessionId = sessionId;
    this.options = {
      audioSource: 'simulated',
      chunkTargetDuration: 4.0,
      watchdogTimeout: 10.0,
      inMemory: true,
      ...options,
    };
    this.isActive = false;
    this.chunks = [];
    this.totalSamples = 0;
    this.sampleRate = 44100;
    this.chunkCount = 0;
    this.watchdogStartTime = 0;
    this.watchdogCancelled = false;
    this.eventHandlers = new Map();
    this.audioContext = null;
    this.intervalId = null;
    this.watchdogTimeoutId = null;
  }

  async start() {
    if (this.options.audioSource === 'live') {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(track => track.stop()); // Just test permission
        updateMicStatus('granted');
      } catch (error) {
        updateMicStatus('denied');
        throw new Error('permission_denied');
      }
    }

    this.isActive = true;
    this.startWatchdog();
    this.startCapture();

    return {
      stop: () => this.stop(),
      on: (event, callback) => this.on(event, callback),
      off: (event, callback) => this.off(event, callback),
      getStatus: () => this.getStatus(),
    };
  }

  startCapture() {
    const samplesPerInterval = Math.floor(this.sampleRate * 0.1); // 100ms intervals
    
    this.intervalId = setInterval(() => {
      if (!this.isActive) return;

      this.totalSamples += samplesPerInterval;

      if (!this.watchdogCancelled && this.chunkCount === 0) {
        this.watchdogCancelled = true;
      }

      const targetSamples = Math.floor(this.options.chunkTargetDuration * this.sampleRate);
      const currentChunkSamples = this.totalSamples - (this.chunkCount * targetSamples);

      if (currentChunkSamples >= targetSamples) {
        this.encodeChunk(targetSamples);
      }
    }, 100);
  }

  encodeChunk(sampleCount) {
    const duration = sampleCount / this.sampleRate;
    const startTime = (this.chunkCount * this.options.chunkTargetDuration);
    const endTime = startTime + duration;

    // Create a simple audio blob (silent audio for demo)
    const blob = this.createSilentAudioBlob(duration);

    const chunk = {
      seq: this.chunkCount,
      startTime,
      endTime,
      duration,
      blob,
      byteLength: blob.size,
    };

    this.chunks.push(chunk);

    this.emit('chunkEncoded', {
      sessionId: this.sessionId,
      seq: chunk.seq,
      startTime: chunk.startTime,
      endTime: chunk.endTime,
      duration: chunk.duration,
      byteLength: chunk.byteLength,
      blob: chunk.blob,
    });

    this.chunkCount++;
  }

  createSilentAudioBlob(duration) {
    // Create a minimal MP3-like blob for demo
    const size = Math.floor(duration * 16000); // ~16KB per second
    const data = new Uint8Array(size);
    return new Blob([data], { type: 'audio/mpeg' });
  }

  startWatchdog() {
    this.watchdogStartTime = Date.now();
    this.watchdogCancelled = false;

    this.watchdogTimeoutId = setTimeout(() => {
      if (!this.watchdogCancelled && this.chunkCount === 0) {
        this.emit('captureError', {
          sessionId: this.sessionId,
          reason: 'no_audio_received',
          details: 'Watchdog timeout: no audio received for ' + this.options.watchdogTimeout + 's',
        });
        this.stop();
      }
    }, this.options.watchdogTimeout * 1000);
  }

  async stop() {
    this.isActive = false;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    if (this.watchdogTimeoutId) {
      clearTimeout(this.watchdogTimeoutId);
      this.watchdogTimeoutId = null;
    }

    // Encode remaining samples
    const targetSamples = Math.floor(this.options.chunkTargetDuration * this.sampleRate);
    const currentChunkSamples = this.totalSamples - (this.chunkCount * targetSamples);
    
    if (currentChunkSamples > 0) {
      this.encodeChunk(currentChunkSamples);
    }

    const summary = {
      chunksWritten: this.chunkCount,
      totalDuration: this.totalSamples / this.sampleRate,
      hasAudio: this.chunkCount > 0,
      sessionId: this.sessionId,
    };

    this.emit('captureStopped', summary);

    return summary;
  }

  getStatus() {
    const currentDuration = this.totalSamples / this.sampleRate;
    let watchdogRemaining = 0;

    if (this.watchdogTimeoutId && !this.watchdogCancelled) {
      const elapsed = (Date.now() - this.watchdogStartTime) / 1000;
      watchdogRemaining = Math.max(0, this.options.watchdogTimeout - elapsed);
    }

    const targetSamples = Math.floor(this.options.chunkTargetDuration * this.sampleRate);
    const currentChunkSamples = this.totalSamples - (this.chunkCount * targetSamples);

    return {
      isActive: this.isActive,
      chunksEncoded: this.chunkCount,
      currentDuration,
      watchdogActive: this.watchdogTimeoutId !== null && !this.watchdogCancelled,
      watchdogRemaining,
      pcmBufferFill: currentChunkSamples,
      pcmBufferTarget: targetSamples,
    };
  }

  on(eventName, callback) {
    if (!this.eventHandlers.has(eventName)) {
      this.eventHandlers.set(eventName, new Set());
    }
    this.eventHandlers.get(eventName).add(callback);
  }

  off(eventName, callback) {
    const handlers = this.eventHandlers.get(eventName);
    if (handlers) {
      handlers.delete(callback);
    }
  }

  emit(eventName, data) {
    const handlers = this.eventHandlers.get(eventName);
    if (handlers) {
      handlers.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in event handler for ${eventName}:`, error);
        }
      });
    }
  }
}

// Event handlers
startBtn.addEventListener('click', async () => {
  try {
    const audioSource = document.querySelector('input[name="audioSource"]:checked').value;
    
    const engine = new MockCaptureEngine('demo-session', {
      audioSource,
      chunkTargetDuration: 4.0,
      watchdogTimeout: 10.0,
      inMemory: true,
    });

    captureHandle = await engine.start();

    // Subscribe to events
    captureHandle.on('chunkEncoded', handleChunkEncoded);
    captureHandle.on('captureError', handleCaptureError);
    captureHandle.on('captureStopped', handleCaptureStopped);

    // Update UI
    startBtn.disabled = true;
    stopBtn.disabled = false;
    audioSourceRadios.forEach(radio => radio.disabled = true);

    // Start meter updates
    updateInterval = setInterval(updateMeters, 100);
    watchdogMeterItem.style.display = 'flex';

    addEvent('info', 'Capture started');
  } catch (error) {
    addEvent('error', `Failed to start capture: ${error.message}`);
    if (error.message === 'permission_denied') {
      alert('Microphone permission denied. Please allow microphone access in browser settings.');
    }
  }
});

stopBtn.addEventListener('click', async () => {
  if (captureHandle) {
    try {
      const summary = await captureHandle.stop();
      addEvent('info', `Capture stopped: ${summary.chunksWritten} chunks, ${summary.totalDuration.toFixed(2)}s`);
    } catch (error) {
      addEvent('error', `Error stopping capture: ${error.message}`);
    }
  }
});

resetBtn.addEventListener('click', () => {
  // Clear chunks
  chunks.forEach(chunk => {
    if (chunk.blobUrl) {
      URL.revokeObjectURL(chunk.blobUrl);
    }
  });
  chunks = [];

  // Reset UI
  chunkTapeBody.innerHTML = '<tr class="empty-state"><td colspan="6">No chunks yet. Click Start Capture.</td></tr>';
  durationMeter.textContent = '0.00s';
  pcmBufferMeter.textContent = '0 / 0 samples';
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
  audioSourceRadios.forEach(radio => radio.disabled = false);

  addEvent('info', 'Demo reset');
});

function handleChunkEncoded(data) {
  const chunk = {
    seq: data.seq,
    startTime: data.startTime,
    endTime: data.endTime,
    duration: data.duration,
    byteLength: data.byteLength,
    blob: data.blob,
    blobUrl: URL.createObjectURL(data.blob),
  };

  chunks.push(chunk);

  // Remove empty state if present
  const emptyState = chunkTapeBody.querySelector('.empty-state');
  if (emptyState) {
    emptyState.remove();
  }

  // Add row to tape
  const row = document.createElement('tr');
  row.innerHTML = `
    <td>${chunk.seq}</td>
    <td>${chunk.startTime.toFixed(2)}s</td>
    <td>${chunk.endTime.toFixed(2)}s</td>
    <td>${chunk.duration.toFixed(2)}s</td>
    <td>${formatBytes(chunk.byteLength)}</td>
    <td><button class="play-btn" data-seq="${chunk.seq}">▶ Play</button></td>
  `;

  const playBtn = row.querySelector('.play-btn');
  playBtn.addEventListener('click', () => playChunk(chunk));

  chunkTapeBody.appendChild(row);

  addEvent('success', `Chunk ${data.seq} encoded: ${data.startTime.toFixed(2)}s–${data.endTime.toFixed(2)}s (${formatBytes(data.byteLength)})`);
}

function handleCaptureError(data) {
  addEvent('error', `Capture error: ${data.reason} - ${data.details || ''}`);
  
  if (data.reason === 'no_audio_received') {
    alert('Recording completed without playable audio. The microphone may not have delivered audio.');
  }
}

function handleCaptureStopped(data) {
  startBtn.disabled = false;
  stopBtn.disabled = true;
  audioSourceRadios.forEach(radio => radio.disabled = false);

  if (updateInterval) {
    clearInterval(updateInterval);
    updateInterval = null;
  }

  watchdogMeterItem.style.display = 'none';
  watchdogMeter.textContent = 'N/A';

  addEvent('info', `Capture stopped: ${data.chunksWritten} chunks, ${data.totalDuration.toFixed(2)}s, hasAudio=${data.hasAudio}`);
}

function updateMeters() {
  if (!captureHandle) return;

  const status = captureHandle.getStatus();
  
  durationMeter.textContent = `${status.currentDuration.toFixed(2)}s`;
  chunkCountMeter.textContent = status.chunksEncoded;

  if (status.pcmBufferFill !== undefined && status.pcmBufferTarget !== undefined) {
    pcmBufferMeter.textContent = `${status.pcmBufferFill} / ${status.pcmBufferTarget} samples`;
  }

  if (status.watchdogActive) {
    watchdogMeter.textContent = `${status.watchdogRemaining.toFixed(1)}s`;
  } else {
    watchdogMeter.textContent = 'N/A';
    watchdogMeterItem.style.display = 'none';
  }
}

function playChunk(chunk) {
  const audio = new Audio();
  audio.src = chunk.blobUrl;
  audio.play().catch(error => {
    console.error('Error playing chunk:', error);
    addEvent('error', `Failed to play chunk ${chunk.seq}: ${error.message}`);
  });

  addEvent('info', `Playing chunk ${chunk.seq}`);
}

function addEvent(type, message) {
  const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false, fractionalSecondDigits: 3 });
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
  micStatus.textContent = status === 'granted' ? 'Granted' : status === 'denied' ? 'Denied' : 'Not requested';
  micStatus.className = `mic-status ${status}`;
}

// Initialize
updateMicStatus('not-requested');
addEvent('info', 'Demo initialized. Ready to capture.');
