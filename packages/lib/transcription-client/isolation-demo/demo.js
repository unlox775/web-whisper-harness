/**
 * Transcription Client Isolation Demo
 *
 * Live mic (capture-engine, in-memory) is the primary audio path.
 * Fixture blob remains optional. Session archive zip is parsed with
 * session-store parseSessionArchive and concatenated like live chunks.
 * API key stays in the input and is not written to PWA localStorage
 * (`groq_api_key`). Reserved unused prefix: `ww-iso-transcription-client:`.
 */

import { validateKey, transcribeAudio } from '../src/index.js';
import { createFixtureAudioBlob } from '../src/fixture.js';
import { startCapture, CaptureError } from '@web-whisper/capture-engine';
import { parseSessionArchive } from '@web-whisper/session-store';
import { loadSessionArchiveForTranscribe } from './archiveSource.js';
import '../../../isolation-demo-shared/compact-mobile.css';

let currentMode = 'fixture';
let audioSource = 'live';
let fixtureAudioBlob = null;
let liveBlobs = [];
let archiveBlob = null;
let captureHandle = null;
let meterTimer = null;
let isValidKey = false;

const liveModeToggle = document.getElementById('liveModeToggle');
const modeChip = document.getElementById('modeChip');
const apiKeyInput = document.getElementById('apiKeyInput');
const validateKeyBtn = document.getElementById('validateKeyBtn');
const transcribeBtn = document.getElementById('transcribeBtn');
const resetBtn = document.getElementById('resetBtn');
const errorSimSection = document.getElementById('errorSimSection');
const simNetworkBtn = document.getElementById('simNetworkBtn');
const simRateLimitBtn = document.getElementById('simRateLimitBtn');
const simInvalidAudioBtn = document.getElementById('simInvalidAudioBtn');
const validationStatus = document.getElementById('validationStatus');
const validationReason = document.getElementById('validationReason');
const languageBadge = document.getElementById('languageBadge');
const languageCode = document.getElementById('languageCode');
const transcriptOutput = document.getElementById('transcriptOutput');
const recordBtn = document.getElementById('recordBtn');
const recordStopBtn = document.getElementById('recordStopBtn');
const audioStatus = document.getElementById('audioStatus');
const liveCaptureSection = document.getElementById('liveCaptureSection');
const archiveSection = document.getElementById('archiveSection');
const archiveFileInput = document.getElementById('archiveFileInput');
const archiveStatus = document.getElementById('archiveStatus');
const audioSourceRadios = document.querySelectorAll('input[name="audioSource"]');

function init() {
  fixtureAudioBlob = createFixtureAudioBlob();
  setupEventListeners();
  updateUIForMode();
  updateAudioSourceUI();
}

function setupEventListeners() {
  liveModeToggle.addEventListener('change', handleModeToggle);
  validateKeyBtn.addEventListener('click', handleValidateKey);
  transcribeBtn.addEventListener('click', () => handleTranscribe());
  resetBtn.addEventListener('click', handleReset);
  simNetworkBtn.addEventListener('click', () => handleTranscribe('network_failure'));
  simRateLimitBtn.addEventListener('click', () => handleTranscribe('rate_limit'));
  simInvalidAudioBtn.addEventListener('click', () => handleTranscribe('invalid_audio'));
  recordBtn.addEventListener('click', handleRecordStart);
  recordStopBtn.addEventListener('click', handleRecordStop);
  audioSourceRadios.forEach((radio) => {
    radio.addEventListener('change', () => {
      audioSource = document.querySelector('input[name="audioSource"]:checked').value;
      updateAudioSourceUI();
      updateUIForMode();
    });
  });
  archiveFileInput.addEventListener('change', handleArchiveUpload);
}

function sourceChipLabel() {
  if (audioSource === 'live') return 'LIVE MIC';
  if (audioSource === 'archive') return 'SESSION ARCHIVE';
  return 'FIXTURE BLOB';
}

function handleModeToggle(event) {
  currentMode = event.target.checked ? 'live' : 'fixture';
  updateUIForMode();
}

function updateAudioSourceUI() {
  liveCaptureSection.style.display = audioSource === 'live' ? 'flex' : 'none';
  archiveSection.style.display = audioSource === 'archive' ? 'flex' : 'none';
  if (audioSource === 'live') {
    updateLiveAudioStatus();
  }
}

function resetArchiveStatus(message = 'Choose a session archive zip, then Transcribe.') {
  archiveStatus.textContent = message;
  archiveStatus.classList.remove('error');
}

function showArchiveError(message) {
  archiveStatus.textContent = message;
  archiveStatus.classList.add('error');
}

async function handleArchiveUpload(event) {
  const file = event.target.files && event.target.files[0];
  archiveBlob = null;
  if (!file) {
    resetArchiveStatus();
    return;
  }

  archiveStatus.textContent = 'Reading archive…';
  archiveStatus.classList.remove('error');

  const result = await loadSessionArchiveForTranscribe(file, parseSessionArchive);
  if (result.error) {
    showArchiveError(result.error);
    return;
  }

  archiveBlob = result.blob;
  const sessionLabel = result.sessionId ? `Session ${result.sessionId}` : 'Session archive';
  resetArchiveStatus(
    `${sessionLabel}: ${result.chunkCount} audio chunk(s) concatenated (not persisted)`
  );
}

function updateLiveAudioStatus() {
  if (liveBlobs.length === 0) {
    audioStatus.textContent = 'No live audio yet. Record, then Transcribe.';
  } else {
    audioStatus.textContent = `${liveBlobs.length} live chunk(s) in RAM (not persisted)`;
  }
}

function updateUIForMode() {
  if (currentMode === 'live') {
    modeChip.textContent = 'LIVE GROQ + ' + sourceChipLabel();
    modeChip.className = 'mode-chip mode-live';
    apiKeyInput.disabled = false;
    validateKeyBtn.disabled = false;
    transcribeBtn.disabled = !isValidKey;
    errorSimSection.style.display = 'none';
  } else {
    if (audioSource === 'live') {
      modeChip.textContent = 'LIVE MIC (mock transcript until Groq is on)';
    } else if (audioSource === 'archive') {
      modeChip.textContent = 'SESSION ARCHIVE (mock transcript)';
    } else {
      modeChip.textContent = 'FIXTURE MODE (mock transcript)';
    }
    modeChip.className = 'mode-chip mode-fixture';
    apiKeyInput.disabled = true;
    validateKeyBtn.disabled = true;
    transcribeBtn.disabled = false;
    errorSimSection.style.display = 'block';
  }
}

async function handleRecordStart() {
  liveBlobs = [];
  updateLiveAudioStatus();
  try {
    captureHandle = await startCapture(`iso-transcription-${Date.now()}`, {
      audioSource: 'live',
      chunkTargetDuration: 4.0,
      watchdogTimeout: 10.0,
      inMemory: true,
    });
    captureHandle.on('chunkEncoded', (data) => {
      if (data.blob) {
        liveBlobs.push(data.blob);
        updateLiveAudioStatus();
      }
    });
    captureHandle.on('captureError', (data) => {
      audioStatus.textContent = `Capture error: ${data.reason || 'failed'}`;
      recordBtn.disabled = false;
      recordStopBtn.disabled = true;
    });
    captureHandle.on('captureStopped', () => {
      recordBtn.disabled = false;
      recordStopBtn.disabled = true;
      captureHandle = null;
      if (meterTimer) {
        clearInterval(meterTimer);
        meterTimer = null;
      }
      updateLiveAudioStatus();
    });
    recordBtn.disabled = true;
    recordStopBtn.disabled = false;
    audioStatus.textContent = 'Recording… speak into the mic';
    meterTimer = setInterval(() => {
      if (!captureHandle) return;
      const status = captureHandle.getStatus();
      audioStatus.textContent = `Recording… ${status.currentDuration.toFixed(1)}s, ${status.chunksEncoded} chunks`;
    }, 200);
  } catch (error) {
    const code = error instanceof CaptureError ? error.code : '';
    audioStatus.textContent = `Failed: ${error.message || error}`;
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
    audioStatus.textContent = `Stop failed: ${error.message}`;
  }
}

function audioBlobForTranscribe() {
  if (audioSource === 'live') {
    if (liveBlobs.length === 0) return null;
    return new Blob(liveBlobs, { type: 'audio/mpeg' });
  }
  if (audioSource === 'archive') {
    return archiveBlob;
  }
  return fixtureAudioBlob;
}

function missingAudioMessage() {
  if (audioSource === 'archive') {
    return archiveStatus.classList.contains('error')
      ? archiveStatus.textContent
      : 'Upload a session archive zip first.';
  }
  return 'No live audio yet. Start Capture, speak, then Stop Capture.';
}

async function handleValidateKey() {
  const apiKey = apiKeyInput.value.trim();

  if (!apiKey) {
    updateValidationStatus(false, 'Please enter an API key');
    return;
  }

  validationStatus.textContent = 'Validating...';
  validationStatus.className = 'status-badge status-neutral';
  validationReason.textContent = '';
  validateKeyBtn.disabled = true;

  try {
    const result = await validateKey(apiKey);

    if (result.valid) {
      updateValidationStatus(true);
      isValidKey = true;
      transcribeBtn.disabled = false;
    } else {
      updateValidationStatus(false, result.reason);
      isValidKey = false;
      transcribeBtn.disabled = true;
    }
  } catch (error) {
    updateValidationStatus(false, 'Validation failed: ' + error.message);
    isValidKey = false;
    transcribeBtn.disabled = true;
  } finally {
    validateKeyBtn.disabled = false;
  }
}

function updateValidationStatus(valid, reason = '') {
  if (valid) {
    validationStatus.textContent = 'Valid ✓';
    validationStatus.className = 'status-badge status-valid';
    validationReason.textContent = '';
  } else {
    validationStatus.textContent = 'Invalid ✗';
    validationStatus.className = 'status-badge status-invalid';
    validationReason.textContent = reason;
  }
}

async function handleTranscribe(simulateError = null) {
  const blob = audioBlobForTranscribe();
  if (!blob) {
    transcriptOutput.textContent = missingAudioMessage();
    transcriptOutput.className = 'transcript-output error';
    return;
  }

  transcriptOutput.textContent = 'Transcribing...';
  transcriptOutput.className = 'transcript-output loading';
  languageBadge.style.display = 'none';
  transcribeBtn.disabled = true;

  try {
    const options = {
      mode: currentMode,
    };

    if (currentMode === 'live') {
      options.apiKey = apiKeyInput.value.trim();
    } else if (simulateError) {
      options.simulateError = simulateError;
    }

    const result = await transcribeAudio(blob, options);

    if (result.error) {
      transcriptOutput.textContent = `Error: ${result.error}`;
      transcriptOutput.className = 'transcript-output error';
      languageBadge.style.display = 'none';
    } else {
      transcriptOutput.textContent = result.text;
      transcriptOutput.className = 'transcript-output success';

      if (result.language) {
        languageCode.textContent = result.language;
        languageBadge.style.display = 'block';
      } else {
        languageBadge.style.display = 'none';
      }
    }
  } catch (error) {
    transcriptOutput.textContent = `Error: ${error.message}`;
    transcriptOutput.className = 'transcript-output error';
    languageBadge.style.display = 'none';
  } finally {
    transcribeBtn.disabled = currentMode === 'live' && !isValidKey;
  }
}

function handleReset() {
  if (captureHandle) {
    captureHandle.stop().catch(() => {});
    captureHandle = null;
  }
  liveBlobs = [];
  archiveBlob = null;
  archiveFileInput.value = '';
  resetArchiveStatus();
  updateLiveAudioStatus();

  transcriptOutput.textContent = "Click 'Transcribe Audio' to generate transcript";
  transcriptOutput.className = 'transcript-output placeholder';
  languageBadge.style.display = 'none';

  validationStatus.textContent = 'Not validated';
  validationStatus.className = 'status-badge status-neutral';
  validationReason.textContent = '';
  isValidKey = false;

  if (currentMode === 'live') {
    apiKeyInput.value = '';
    transcribeBtn.disabled = true;
  }
}

init();
