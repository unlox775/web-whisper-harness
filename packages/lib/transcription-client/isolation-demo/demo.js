/**
 * Transcription Client Isolation Demo
 *
 * Live mic (capture-engine, in-memory) is the primary audio path.
 * Fixture blob remains optional. Session archive zip is parsed with
 * session-store parseSessionArchive.
 *
 * API key: field is never disabled (paste on mobile + desktop). Persisted
 * under ww-iso-transcription-client:groqApiKey. On load, also tries PWA
 * groq_api_key (read-only). Does not write PWA settings.
 *
 * Archive + mock refuses. Archive + live Groq steps snips when present,
 * else chunks (slim zip).
 */

import { validateKey, transcribeAudio } from '../src/index.js';
import { createFixtureAudioBlob } from '../src/fixture.js';
import { startCapture, CaptureError } from '@web-whisper/capture-engine';
import { parseSessionArchive } from '@web-whisper/session-store';
import {
  ARCHIVE_MOCK_REFUSE,
  describeArchiveStepUnits,
  loadSessionArchiveForTranscribe,
} from './archiveSource.js';
import {
  applyPastedKey,
  describeKeySource,
  loadStoredApiKey,
  persistDemoApiKey,
} from './apiKeyStore.js';
import '../../../isolation-demo-shared/compact-mobile.css';

let currentMode = 'fixture';
let audioSource = 'live';
let fixtureAudioBlob = null;
let liveBlobs = [];
let archiveBlob = null;
let archiveUnits = [];
let archiveUnitKind = 'chunk';
let nextUnitIndex = 0;
let captureHandle = null;
let meterTimer = null;
let isValidKey = false;
let transcriptLines = [];

const liveModeToggle = document.getElementById('liveModeToggle');
const modeChip = document.getElementById('modeChip');
const apiKeyInput = document.getElementById('apiKeyInput');
const pasteKeyBtn = document.getElementById('pasteKeyBtn');
const keySourceStatus = document.getElementById('keySourceStatus');
const validateKeyBtn = document.getElementById('validateKeyBtn');
const transcribeBtn = document.getElementById('transcribeBtn');
const stepNextBtn = document.getElementById('stepNextBtn');
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
const archiveMockWarning = document.getElementById('archiveMockWarning');
const archiveStepStatus = document.getElementById('archiveStepStatus');
const audioSourceRadios = document.querySelectorAll('input[name="audioSource"]');

function storage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function restoreApiKey() {
  const loaded = loadStoredApiKey(storage());
  if (loaded.key) {
    apiKeyInput.value = loaded.key;
    keySourceStatus.textContent = describeKeySource(loaded.source);
  } else {
    keySourceStatus.textContent = 'No saved key. Paste or type — it will persist here.';
  }
  updateValidateButton();
}

function persistCurrentKey() {
  persistDemoApiKey(apiKeyInput.value, storage());
}

function updateValidateButton() {
  validateKeyBtn.disabled = !apiKeyInput.value.trim();
}

function init() {
  fixtureAudioBlob = createFixtureAudioBlob();
  restoreApiKey();
  setupEventListeners();
  updateUIForMode();
  updateAudioSourceUI();
}

function setupEventListeners() {
  liveModeToggle.addEventListener('change', handleModeToggle);
  validateKeyBtn.addEventListener('click', handleValidateKey);
  transcribeBtn.addEventListener('click', () => handleTranscribe());
  stepNextBtn.addEventListener('click', () => handleTranscribe({ stepOnce: true }));
  resetBtn.addEventListener('click', handleReset);
  simNetworkBtn.addEventListener('click', () => handleTranscribe({ simulateError: 'network_failure' }));
  simRateLimitBtn.addEventListener('click', () => handleTranscribe({ simulateError: 'rate_limit' }));
  simInvalidAudioBtn.addEventListener('click', () => handleTranscribe({ simulateError: 'invalid_audio' }));
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
  apiKeyInput.addEventListener('input', () => {
    persistCurrentKey();
    updateValidateButton();
  });
  apiKeyInput.addEventListener('paste', handleApiKeyPaste);
  pasteKeyBtn.addEventListener('click', handlePasteKeyButton);
}

function handleApiKeyPaste(event) {
  const pasted =
    event.clipboardData?.getData('text') ||
    event.clipboardData?.getData('text/plain') ||
    '';
  if (!pasted) {
    // Let the browser apply native paste (iOS long-press).
    queueMicrotask(() => {
      persistCurrentKey();
      updateValidateButton();
    });
    return;
  }
  event.preventDefault();
  const next = applyPastedKey(
    apiKeyInput.value,
    apiKeyInput.selectionStart,
    apiKeyInput.selectionEnd,
    pasted
  );
  apiKeyInput.value = next;
  persistCurrentKey();
  updateValidateButton();
  keySourceStatus.textContent = 'Pasted into demo key field (saved).';
}

async function handlePasteKeyButton() {
  apiKeyInput.focus();
  try {
    const text = await navigator.clipboard.readText();
    if (text) {
      apiKeyInput.value = applyPastedKey(
        apiKeyInput.value,
        apiKeyInput.selectionStart,
        apiKeyInput.selectionEnd,
        text
      );
      persistCurrentKey();
      updateValidateButton();
      keySourceStatus.textContent = 'Pasted from clipboard (saved).';
      return;
    }
  } catch {
    // iOS Safari often blocks clipboard.readText without a prior copy.
  }
  keySourceStatus.textContent =
    'Clipboard API blocked. Long-press the key field and choose Paste.';
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
  updateArchiveWarning();
  updateStepControls();
}

function resetArchiveStatus(message = 'Choose a session archive zip, then Transcribe.') {
  archiveStatus.textContent = message;
  archiveStatus.classList.remove('error');
}

function showArchiveError(message) {
  archiveStatus.textContent = message;
  archiveStatus.classList.add('error');
}

function updateArchiveWarning() {
  const show = audioSource === 'archive' && currentMode !== 'live' && archiveUnits.length > 0;
  archiveMockWarning.hidden = !show;
}

function updateStepControls() {
  const archiveReady = audioSource === 'archive' && archiveUnits.length > 0;
  stepNextBtn.hidden = !archiveReady;
  if (!archiveReady) {
    archiveStepStatus.textContent = 'Step next is available after a zip is loaded.';
    transcribeBtn.textContent = 'Transcribe Audio';
    return;
  }
  const remaining = archiveUnits.length - nextUnitIndex;
  const unitWord = archiveUnitKind === 'snip' ? 'snip' : 'chunk';
  stepNextBtn.textContent = remaining > 0 ? `Next ${unitWord}` : `Next ${unitWord} (done)`;
  stepNextBtn.disabled = remaining <= 0 || (currentMode === 'live' && !isValidKey);
  transcribeBtn.textContent = remaining > 0 ? 'Transcribe remaining' : 'Transcribe remaining (done)';
  if (nextUnitIndex < archiveUnits.length) {
    const unit = archiveUnits[nextUnitIndex];
    const range =
      Number.isFinite(unit.startTime) && Number.isFinite(unit.endTime)
        ? ` ${Number(unit.startTime).toFixed(1)}–${Number(unit.endTime).toFixed(1)}s`
        : '';
    archiveStepStatus.textContent = `${nextUnitIndex + 1} / ${archiveUnits.length} · next ${unit.label}${range}`;
  } else {
    archiveStepStatus.textContent = `All ${archiveUnits.length} ${unitWord}(s) transcribed.`;
  }
}

async function handleArchiveUpload(event) {
  const file = event.target.files && event.target.files[0];
  archiveBlob = null;
  archiveUnits = [];
  archiveUnitKind = 'chunk';
  nextUnitIndex = 0;
  if (!file) {
    resetArchiveStatus();
    updateArchiveWarning();
    updateStepControls();
    return;
  }

  archiveStatus.textContent = 'Reading archive…';
  archiveStatus.classList.remove('error');

  const result = await loadSessionArchiveForTranscribe(file, parseSessionArchive);
  if (result.error) {
    showArchiveError(result.error);
    updateArchiveWarning();
    updateStepControls();
    return;
  }

  archiveBlob = result.blob;
  archiveUnits = result.units;
  archiveUnitKind = result.unitKind;
  nextUnitIndex = 0;
  const sessionLabel = result.sessionId ? `Session ${result.sessionId}` : 'Session archive';
  resetArchiveStatus(
    `${sessionLabel}: ${result.chunkCount} audio chunk(s). ${describeArchiveStepUnits(result)}`
  );
  updateArchiveWarning();
  updateStepControls();
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
    transcribeBtn.disabled = !isValidKey;
    errorSimSection.style.display = 'none';
  } else {
    if (audioSource === 'live') {
      modeChip.textContent = 'LIVE MIC (mock transcript until Groq is on)';
    } else if (audioSource === 'archive') {
      modeChip.textContent = 'SESSION ARCHIVE (mock — will not transcribe zip)';
    } else {
      modeChip.textContent = 'FIXTURE MODE (mock transcript)';
    }
    modeChip.className = 'mode-chip mode-fixture';
    transcribeBtn.disabled = false;
    errorSimSection.style.display = 'block';
  }
  apiKeyInput.disabled = false;
  updateValidateButton();
  updateArchiveWarning();
  updateStepControls();
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

function showArchiveMockRefuse() {
  transcriptOutput.textContent = ARCHIVE_MOCK_REFUSE;
  transcriptOutput.className = 'transcript-output error';
  languageBadge.style.display = 'none';
}

function renderTranscript() {
  if (transcriptLines.length === 0) {
    transcriptOutput.textContent = "Click 'Transcribe Audio' to generate transcript";
    transcriptOutput.className = 'transcript-output placeholder';
    return;
  }
  transcriptOutput.textContent = transcriptLines.join('\n\n');
  transcriptOutput.className = 'transcript-output success';
}

function formatUnitHeader(unit, index, total) {
  const range =
    Number.isFinite(unit.startTime) && Number.isFinite(unit.endTime)
      ? ` ${Number(unit.startTime).toFixed(1)}–${Number(unit.endTime).toFixed(1)}s`
      : '';
  return `[${index + 1}/${total}] ${unit.label}${range}`;
}

async function handleValidateKey() {
  const apiKey = apiKeyInput.value.trim();

  if (!apiKey) {
    updateValidationStatus(false, 'Please enter an API key');
    return;
  }

  persistCurrentKey();
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
      transcribeBtn.disabled = currentMode === 'live';
    }
  } catch (error) {
    updateValidationStatus(false, 'Validation failed: ' + error.message);
    isValidKey = false;
    transcribeBtn.disabled = currentMode === 'live';
  } finally {
    updateValidateButton();
    updateStepControls();
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

async function transcribeOneBlob(blob, simulateError) {
  const options = {
    mode: currentMode,
  };

  if (currentMode === 'live') {
    options.apiKey = apiKeyInput.value.trim();
  } else if (simulateError) {
    options.simulateError = simulateError;
  }

  return transcribeAudio(blob, options);
}

async function handleTranscribe(arg = null) {
  const stepOnce = Boolean(arg && typeof arg === 'object' && arg.stepOnce);
  const simulateError =
    typeof arg === 'string' ? arg : arg && typeof arg === 'object' ? arg.simulateError : null;

  if (audioSource === 'archive') {
    if (archiveUnits.length === 0) {
      transcriptOutput.textContent = missingAudioMessage();
      transcriptOutput.className = 'transcript-output error';
      return;
    }
    if (currentMode !== 'live') {
      showArchiveMockRefuse();
      return;
    }
    transcribeBtn.disabled = true;
    stepNextBtn.disabled = true;
    try {
      await transcribeArchiveUnits({ stepOnce });
    } finally {
      transcribeBtn.disabled = currentMode === 'live' && !isValidKey;
      updateStepControls();
    }
    return;
  }

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
    const result = await transcribeOneBlob(blob, simulateError);

    if (result.error) {
      transcriptOutput.textContent = `Error: ${result.error}`;
      transcriptOutput.className = 'transcript-output error';
      languageBadge.style.display = 'none';
    } else {
      const prefix = currentMode === 'fixture' ? 'MOCK (fixture blob)\n' : '';
      transcriptOutput.textContent = prefix + result.text;
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
    updateStepControls();
  }
}

async function transcribeArchiveUnits({ stepOnce }) {
  if (nextUnitIndex >= archiveUnits.length) {
    archiveStepStatus.textContent = `All ${archiveUnits.length} ${archiveUnitKind}(s) transcribed.`;
    return;
  }

  const end = stepOnce ? nextUnitIndex + 1 : archiveUnits.length;
  languageBadge.style.display = 'none';

  for (let i = nextUnitIndex; i < end; i++) {
    const unit = archiveUnits[i];
    transcriptOutput.textContent = `Transcribing ${formatUnitHeader(unit, i, archiveUnits.length)}…`;
    transcriptOutput.className = 'transcript-output loading';

    try {
      const result = await transcribeOneBlob(unit.blob, null);
      if (result.error) {
        transcriptLines.push(`${formatUnitHeader(unit, i, archiveUnits.length)}\nError: ${result.error}`);
        nextUnitIndex = i;
        renderTranscript();
        transcriptOutput.className = 'transcript-output error';
        return;
      }
      const text = result.text || '(empty)';
      const lang = result.language ? ` · language ${result.language}` : '';
      transcriptLines.push(`${formatUnitHeader(unit, i, archiveUnits.length)}${lang}\n${text}`);
      nextUnitIndex = i + 1;
      renderTranscript();
      if (result.language) {
        languageCode.textContent = result.language;
        languageBadge.style.display = 'block';
      }
    } catch (error) {
      transcriptLines.push(`${formatUnitHeader(unit, i, archiveUnits.length)}\nError: ${error.message}`);
      nextUnitIndex = i;
      renderTranscript();
      transcriptOutput.className = 'transcript-output error';
      return;
    }
  }
}

function handleReset() {
  if (captureHandle) {
    captureHandle.stop().catch(() => {});
    captureHandle = null;
  }
  liveBlobs = [];
  archiveBlob = null;
  archiveUnits = [];
  archiveUnitKind = 'chunk';
  nextUnitIndex = 0;
  archiveFileInput.value = '';
  resetArchiveStatus();
  updateLiveAudioStatus();
  transcriptLines = [];

  transcriptOutput.textContent = "Click 'Transcribe Audio' to generate transcript";
  transcriptOutput.className = 'transcript-output placeholder';
  languageBadge.style.display = 'none';

  validationStatus.textContent = 'Not validated';
  validationStatus.className = 'status-badge status-neutral';
  validationReason.textContent = '';
  isValidKey = false;

  updateArchiveWarning();
  updateUIForMode();
}

init();
