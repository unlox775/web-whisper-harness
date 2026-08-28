/**
 * Session Store Isolation Demo
 * 
 * Desktop factory-floor store inspector for session-store package
 */

import * as sessionStore from '../../src/index.js';
import { startCapture, CaptureError } from '@web-whisper/capture-engine';
import '../../../../isolation-demo-shared/compact-mobile.css';

/** Distinct from PWA `web-whisper-db` and from other isolation demos. */
const ISOLATION_DB_NAME = 'web-whisper-isolation-demo-session-store';
const ISOLATION_RELOAD_FLAG = 'ww-iso-session-store:hadDataBeforeReload';

// State
let currentStorageCap = 5 * 1024 * 1024; // 5 MB default
let lastCreatedSessionId = null;
let currentDetailsSessionId = null;
let chunkWriteCount = 0;
let snipWriteCount = 0;
let captureHandle = null;
let pendingLiveChunks = [];
let captureMeterTimer = null;

// Initialize
async function init() {
  await sessionStore.init({ databaseName: ISOLATION_DB_NAME });
  await refreshUI();
  checkPersistence();
  setupEventListeners();
}

// Check if data persisted across page reload
function checkPersistence() {
  const hadData = sessionStorage.getItem(ISOLATION_RELOAD_FLAG);
  if (hadData === 'true') {
    sessionStorage.removeItem(ISOLATION_RELOAD_FLAG);
    setTimeout(async () => {
      const stats = await sessionStore.getStorageStats();
      if (stats.sessionCount > 0) {
        showPersistenceStatus('Data persists across reloads ✓', true);
      } else {
        showPersistenceStatus('Data lost after reload ✗', false);
      }
    }, 500);
  }
}

function showPersistenceStatus(message, success) {
  const statusEl = document.getElementById('persistence-status');
  statusEl.textContent = message;
  statusEl.className = `persistence-status ${success ? 'success' : 'error'}`;
}

// Setup event listeners
function setupEventListeners() {
  // Create Session
  document.getElementById('create-session-btn').addEventListener('click', async () => {
    const result = await sessionStore.createSession();
    if (result.error) {
      showToast(`Error: ${result.error}`, 'error');
    } else {
      lastCreatedSessionId = result.id;
      document.getElementById('last-session-id').textContent = `Last created: ${result.id}`;
      // Pre-fill chunk/volume/snip session ID fields
      document.getElementById('chunk-session-id').value = result.id;
      document.getElementById('volume-session-id').value = result.id;
      document.getElementById('snip-session-id').value = result.id;
      showToast(`Session created: ${result.id}`, 'success');
      await refreshUI();
    }
  });

  const chunkDataSource = document.getElementById('chunk-data-source');
  const liveChunkControls = document.getElementById('live-chunk-controls');
  const writeChunkBtn = document.getElementById('write-chunk-btn');
  const liveCaptureStatus = document.getElementById('live-capture-status');

  function syncChunkSourceUI() {
    const live = chunkDataSource.value === 'live';
    liveChunkControls.style.display = live ? 'block' : 'none';
    writeChunkBtn.style.display = live ? 'none' : 'block';
  }
  chunkDataSource.addEventListener('change', syncChunkSourceUI);
  syncChunkSourceUI();

  async function ensureSessionId() {
    let sessionId = document.getElementById('chunk-session-id').value.trim();
    if (sessionId) return sessionId;
    const result = await sessionStore.createSession();
    if (result.error) {
      showToast(`Error: ${result.error}`, 'error');
      return null;
    }
    lastCreatedSessionId = result.id;
    document.getElementById('last-session-id').textContent = `Last created: ${result.id}`;
    document.getElementById('chunk-session-id').value = result.id;
    document.getElementById('volume-session-id').value = result.id;
    document.getElementById('snip-session-id').value = result.id;
    showToast(`Session created: ${result.id}`, 'success');
    await refreshUI();
    return result.id;
  }

  document.getElementById('start-capture-btn').addEventListener('click', async () => {
    const sessionId = await ensureSessionId();
    if (!sessionId) return;
    pendingLiveChunks = [];
    try {
      captureHandle = await startCapture(`iso-session-store-${Date.now()}`, {
        audioSource: 'live',
        chunkTargetDuration: 4.0,
        watchdogTimeout: 10.0,
        inMemory: true,
      });
      captureHandle.on('chunkEncoded', (data) => {
        if (!data.blob) return;
        pendingLiveChunks.push({
          seq: data.seq,
          startTime: data.startTime,
          endTime: data.endTime,
          duration: data.duration,
          blob: data.blob,
          sizeBytes: data.byteLength || data.blob.size,
        });
        liveCaptureStatus.textContent = `Recording… ${pendingLiveChunks.length} chunk(s) in RAM`;
      });
      captureHandle.on('captureError', (data) => {
        liveCaptureStatus.textContent = `Capture error: ${data.reason || 'failed'}`;
        document.getElementById('start-capture-btn').disabled = false;
        document.getElementById('stop-capture-btn').disabled = true;
      });
      captureHandle.on('captureStopped', () => {
        document.getElementById('start-capture-btn').disabled = false;
        document.getElementById('stop-capture-btn').disabled = true;
        captureHandle = null;
        if (captureMeterTimer) {
          clearInterval(captureMeterTimer);
          captureMeterTimer = null;
        }
      });
      document.getElementById('start-capture-btn').disabled = true;
      document.getElementById('stop-capture-btn').disabled = false;
      liveCaptureStatus.textContent = 'Recording… speak, then Stop & Write Chunks';
      captureMeterTimer = setInterval(() => {
        if (!captureHandle) return;
        const status = captureHandle.getStatus();
        liveCaptureStatus.textContent = `Recording… ${status.currentDuration.toFixed(1)}s → sandbox session ${sessionId.slice(0, 12)}…`;
      }, 200);
    } catch (error) {
      const code = error instanceof CaptureError ? error.code : '';
      liveCaptureStatus.textContent = `Failed: ${error.message || error}`;
      if (code === 'permission_denied') {
        alert('Microphone permission denied. Allow access in browser settings.');
      }
    }
  });

  document.getElementById('stop-capture-btn').addEventListener('click', async () => {
    const sessionId = document.getElementById('chunk-session-id').value.trim();
    if (captureHandle) {
      try {
        await captureHandle.stop();
      } catch (error) {
        showToast(`Stop failed: ${error.message}`, 'error');
      }
    }
    if (!sessionId) {
      showToast('No session ID to write chunks', 'error');
      return;
    }
    if (pendingLiveChunks.length === 0) {
      liveCaptureStatus.textContent = 'No audio captured.';
      showToast('No live chunks to write', 'error');
      return;
    }
    let written = 0;
    for (const chunk of pendingLiveChunks) {
      const result = await sessionStore.writeChunk(sessionId, {
        ...chunk,
        seq: chunkWriteCount,
      });
      if (result.error) {
        showToast(`Error writing chunk: ${result.error}`, 'error');
        break;
      }
      written++;
      chunkWriteCount++;
    }
    document.getElementById('chunk-count').textContent = `Chunks written: ${chunkWriteCount}`;
    liveCaptureStatus.textContent = `Wrote ${written} live chunk(s) to sandbox DB (not web-whisper-db).`;
    showToast(`Wrote ${written} live chunks`, 'success');
    pendingLiveChunks = [];
    await refreshUI();
  });

  // Write Chunk
  document.getElementById('write-chunk-btn').addEventListener('click', async () => {
    const sessionId = document.getElementById('chunk-session-id').value.trim();
    if (!sessionId) {
      showToast('Please enter a session ID', 'error');
      return;
    }

    const fixtureBlob = await generateFixtureChunk();
    const chunkData = {
      seq: chunkWriteCount,
      startTime: chunkWriteCount * 4.0,
      endTime: (chunkWriteCount + 1) * 4.0,
      duration: 4.0,
      blob: fixtureBlob,
      sizeBytes: fixtureBlob.size
    };

    const result = await sessionStore.writeChunk(sessionId, chunkData);
    if (result.error) {
      showToast(`Error: ${result.error}`, 'error');
    } else {
      chunkWriteCount++;
      document.getElementById('chunk-count').textContent = `Chunks written: ${chunkWriteCount}`;
      showToast(`Chunk written: ${result.chunkId}`, 'success');
      await refreshUI();
    }
  });

  // Write Volume Profile
  document.getElementById('write-volume-btn').addEventListener('click', async () => {
    const sessionId = document.getElementById('volume-session-id').value.trim();
    if (!sessionId) {
      showToast('Please enter a session ID', 'error');
      return;
    }

    // Get chunks for this session to generate fixture volume data
    const chunksResult = await sessionStore.getChunksForSession(sessionId);
    if (chunksResult.error) {
      showToast(`Error: ${chunksResult.error}`, 'error');
      return;
    }

    const chunkVolumes = chunksResult.chunks.map(chunk => ({
      chunkId: chunk.id,
      peakDb: -50 + Math.random() * 40 // Random peak between -50 and -10 dB
    }));

    const result = await sessionStore.writeVolumeProfile(sessionId, { chunkVolumes });
    if (result.error) {
      showToast(`Error: ${result.error}`, 'error');
    } else {
      showToast('Volume profile written', 'success');
      await refreshUI();
    }
  });

  // Write Snips
  document.getElementById('write-snips-btn').addEventListener('click', async () => {
    const sessionId = document.getElementById('snip-session-id').value.trim();
    if (!sessionId) {
      showToast('Please enter a session ID', 'error');
      return;
    }

    // Get chunks for this session to generate fixture snips
    const chunksResult = await sessionStore.getChunksForSession(sessionId);
    if (chunksResult.error) {
      showToast(`Error: ${chunksResult.error}`, 'error');
      return;
    }

    if (chunksResult.chunks.length === 0) {
      showToast('No chunks found for this session', 'error');
      return;
    }

    // Create 2 fixture snips
    const midPoint = Math.floor(chunksResult.chunks.length / 2);
    const snips = [
      {
        startChunkIndex: 0,
        endChunkIndex: midPoint - 1,
        startTime: chunksResult.chunks[0].startTime,
        endTime: chunksResult.chunks[midPoint - 1].endTime,
        duration: chunksResult.chunks[midPoint - 1].endTime - chunksResult.chunks[0].startTime,
        chunkIds: chunksResult.chunks.slice(0, midPoint).map(c => c.id),
        confidence: 0.95
      },
      {
        startChunkIndex: midPoint,
        endChunkIndex: chunksResult.chunks.length - 1,
        startTime: chunksResult.chunks[midPoint].startTime,
        endTime: chunksResult.chunks[chunksResult.chunks.length - 1].endTime,
        duration: chunksResult.chunks[chunksResult.chunks.length - 1].endTime - chunksResult.chunks[midPoint].startTime,
        chunkIds: chunksResult.chunks.slice(midPoint).map(c => c.id),
        confidence: 0.88
      }
    ];

    for (const snipData of snips) {
      const result = await sessionStore.writeSnip(sessionId, snipData);
      if (result.error) {
        showToast(`Error: ${result.error}`, 'error');
        return;
      }
      snipWriteCount++;
    }

    document.getElementById('snip-count').textContent = `Snips written: ${snipWriteCount}`;
    showToast(`2 snips written`, 'success');
    await refreshUI();
  });

  // Write Transcript
  document.getElementById('write-transcript-btn').addEventListener('click', async () => {
    const snipId = document.getElementById('transcript-snip-id').value.trim();
    const text = document.getElementById('transcript-text').value.trim();
    
    if (!snipId) {
      showToast('Please enter a snip ID', 'error');
      return;
    }
    if (!text) {
      showToast('Please enter transcript text', 'error');
      return;
    }

    const result = await sessionStore.writeTranscript(snipId, text);
    if (result.error) {
      showToast(`Error: ${result.error}`, 'error');
    } else {
      showToast('Transcript written', 'success');
      document.getElementById('transcript-text').value = '';
      await refreshUI();
    }
  });

  // Update Storage Cap
  document.getElementById('update-cap-btn').addEventListener('click', () => {
    const capMB = parseFloat(document.getElementById('storage-cap-input').value);
    currentStorageCap = capMB * 1024 * 1024;
    document.getElementById('cap-bytes').textContent = formatBytes(currentStorageCap);
    showToast(`Storage cap updated to ${capMB} MB`, 'success');
    refreshStorageStats();
  });

  // Enforce Retention Policy
  document.getElementById('enforce-retention-btn').addEventListener('click', async () => {
    const result = await sessionStore.enforceRetentionPolicy(currentStorageCap);
    if (result.error) {
      showToast(`Error: ${result.error}`, 'error');
    } else {
      const timestamp = new Date().toLocaleString();
      const logEntry = `
        <div class="retention-log-entry">
          <div><strong>Retention policy enforced</strong> at ${timestamp}</div>
          <div>Deleted ${result.deletedSessions} session(s) to reclaim ${formatBytes(result.reclaimedBytes)}</div>
          <div>New usage: ${formatBytes(result.newUsedBytes)} / ${formatBytes(currentStorageCap)} (${Math.round((result.newUsedBytes / currentStorageCap) * 100)}%)</div>
        </div>
      `;
      document.getElementById('retention-log').innerHTML = logEntry + document.getElementById('retention-log').innerHTML;
      showToast(`Deleted ${result.deletedSessions} sessions`, 'success');
      await refreshUI();
    }
  });

  // Reload Page
  document.getElementById('reload-page-btn').addEventListener('click', async () => {
    const stats = await sessionStore.getStorageStats();
    if (stats.sessionCount > 0) {
      sessionStorage.setItem(ISOLATION_RELOAD_FLAG, 'true');
    }
    window.location.reload();
  });

  // Close Details
  document.getElementById('close-details-btn').addEventListener('click', () => {
    document.getElementById('session-details').style.display = 'none';
    currentDetailsSessionId = null;
  });

  // Tab switching
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`${tab}-tab`).classList.add('active');
    });
  });
}

// Generate fixture MP3 chunk (small audio blob)
async function generateFixtureChunk() {
  // Create a small silent MP3 blob as fixture data
  // Real implementation would encode actual audio, but for demo we use a minimal valid MP3
  const mp3Header = new Uint8Array([
    0xFF, 0xFB, 0x90, 0x00, // MP3 frame sync + header
  ]);
  
  // Create ~100KB of "audio" data for realistic chunk size
  const dataSize = 100 * 1024;
  const data = new Uint8Array(dataSize);
  data[0] = mp3Header[0];
  data[1] = mp3Header[1];
  data[2] = mp3Header[2];
  data[3] = mp3Header[3];
  
  return new Blob([data], { type: 'audio/mpeg' });
}

// Refresh UI
async function refreshUI() {
  await refreshSessionList();
  await refreshStorageStats();
  
  if (currentDetailsSessionId) {
    await loadSessionDetails(currentDetailsSessionId);
  }
}

// Refresh session list
async function refreshSessionList() {
  const result = await sessionStore.listSessions();
  
  if (result.error) {
    showToast(`Error: ${result.error}`, 'error');
    return;
  }

  const emptyState = document.getElementById('session-empty-state');
  const table = document.getElementById('session-list-table');
  const tbody = document.getElementById('session-list-body');

  if (result.sessions.length === 0) {
    emptyState.style.display = 'block';
    table.style.display = 'none';
  } else {
    emptyState.style.display = 'none';
    table.style.display = 'table';
    
    tbody.innerHTML = result.sessions.map(session => `
      <tr>
        <td class="session-id">${truncateId(session.id)}</td>
        <td>${formatDateTime(session.createdAt)}</td>
        <td>${formatDuration(session.duration)}</td>
        <td>${session.chunkCount}</td>
        <td>${formatBytes(session.sizeBytes)}</td>
        <td>${session.hasVolumeProfile ? '<span class="check-mark">✓</span>' : '<span class="dash">—</span>'}</td>
        <td>${session.hasSnips ? session.hasSnips : '<span class="dash">—</span>'}</td>
        <td>${session.hasTranscript ? session.hasTranscript : '<span class="dash">—</span>'}</td>
        <td class="actions">
          <button class="btn btn-primary btn-small" onclick="window.showDetails('${session.id}')">Details</button>
          <button class="btn btn-danger btn-small" onclick="window.deleteSessionClick('${session.id}')">Delete</button>
        </td>
      </tr>
    `).join('');
  }
}

// Refresh storage stats
async function refreshStorageStats() {
  const stats = await sessionStore.getStorageStats();
  
  if (stats.error) {
    return;
  }

  const usagePercent = currentStorageCap > 0 
    ? Math.round((stats.usedBytes / currentStorageCap) * 100)
    : 0;

  // Header stats
  document.getElementById('header-storage-stats').textContent = 
    `Storage: ${formatBytes(stats.usedBytes)} / ${formatBytes(currentStorageCap)} (${usagePercent}%)`;

  // Storage panel stats
  document.getElementById('used-bytes').textContent = formatBytes(stats.usedBytes);
  document.getElementById('cap-bytes').textContent = formatBytes(currentStorageCap);
  document.getElementById('usage-percent').textContent = `${usagePercent}%`;
  document.getElementById('session-count').textContent = stats.sessionCount;
  document.getElementById('chunk-count-stat').textContent = stats.chunkCount;
}

// Show session details
window.showDetails = async function(sessionId) {
  currentDetailsSessionId = sessionId;
  document.getElementById('details-session-id').textContent = sessionId;
  document.getElementById('session-details').style.display = 'block';
  await loadSessionDetails(sessionId);
};

// Load session details
async function loadSessionDetails(sessionId) {
  // Load chunks
  const chunksResult = await sessionStore.getChunksForSession(sessionId);
  if (!chunksResult.error) {
    const chunksList = document.getElementById('chunks-list');
    chunksList.innerHTML = chunksResult.chunks.map(chunk => `
      <tr>
        <td>${chunk.seq}</td>
        <td>${formatTime(chunk.startTime)}</td>
        <td>${formatTime(chunk.endTime)}</td>
        <td>${formatDuration(chunk.duration)}</td>
        <td>${formatBytes(chunk.sizeBytes)}</td>
      </tr>
    `).join('');
  }

  // Load volume profile
  const volumeProfile = await sessionStore.getVolumeProfile(sessionId);
  const volumeContent = document.getElementById('volume-content');
  if (volumeProfile) {
    volumeContent.innerHTML = `
      <table class="details-table">
        <thead>
          <tr>
            <th>Chunk ID</th>
            <th>Peak dB</th>
          </tr>
        </thead>
        <tbody>
          ${volumeProfile.chunkVolumes.map(cv => `
            <tr>
              <td class="session-id">${truncateId(cv.chunkId)}</td>
              <td>${cv.peakDb.toFixed(2)} dB</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } else {
    volumeContent.innerHTML = '<p style="color: #999;">No volume profile</p>';
  }

  // Load snips
  const snipsResult = await sessionStore.getSnipsForSession(sessionId);
  if (!snipsResult.error) {
    const snipsList = document.getElementById('snips-list');
    if (snipsResult.snips.length === 0) {
      snipsList.innerHTML = '<tr><td colspan="5" style="color: #999;">No snips</td></tr>';
    } else {
      snipsList.innerHTML = snipsResult.snips.map(snip => `
        <tr>
          <td class="session-id">${truncateId(snip.id)}</td>
          <td>${formatTime(snip.startTime)}</td>
          <td>${formatTime(snip.endTime)}</td>
          <td>${formatDuration(snip.duration)}</td>
          <td>${(snip.confidence * 100).toFixed(0)}%</td>
        </tr>
      `).join('');
      
      // Pre-fill transcript snip ID with first snip
      if (snipsResult.snips.length > 0) {
        document.getElementById('transcript-snip-id').value = snipsResult.snips[0].id;
      }
    }
  }

  // Load transcripts
  const transcriptsResult = await sessionStore.getTranscriptsForSession(sessionId);
  if (!transcriptsResult.error) {
    const transcriptsList = document.getElementById('transcripts-list');
    if (transcriptsResult.transcripts.length === 0) {
      transcriptsList.innerHTML = '<tr><td colspan="2" style="color: #999;">No transcripts</td></tr>';
    } else {
      transcriptsList.innerHTML = transcriptsResult.transcripts.map(t => `
        <tr>
          <td class="session-id">${truncateId(t.snipId)}</td>
          <td>${truncateText(t.text, 100)}</td>
        </tr>
      `).join('');
    }
  }
}

// Delete session with confirmation
window.deleteSessionClick = async function(sessionId) {
  if (!confirm(`Delete session ${sessionId}?\n\nThis will cascade delete all chunks, volume profile, snips, and transcripts. This cannot be undone.`)) {
    return;
  }

  const result = await sessionStore.deleteSession(sessionId);
  if (result.error) {
    showToast(`Error: ${result.error}`, 'error');
  } else {
    showToast(`Session deleted: ${sessionId}`, 'success');
    if (currentDetailsSessionId === sessionId) {
      document.getElementById('session-details').style.display = 'none';
      currentDetailsSessionId = null;
    }
    await refreshUI();
  }
};

// Utility functions
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatDuration(seconds) {
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${minutes}m ${secs}s`;
}

function formatTime(seconds) {
  return `${seconds.toFixed(2)}s`;
}

function formatDateTime(isoString) {
  const date = new Date(isoString);
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

function truncateId(id) {
  if (id.length <= 20) return id;
  return id.substring(0, 20) + '...';
}

function truncateText(text, maxLen) {
  if (text.length <= maxLen) return text;
  return text.substring(0, maxLen) + '...';
}

function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.remove();
  }, 3000);
}

// Start the demo
init();
