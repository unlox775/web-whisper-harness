/**
 * Transcription Client Isolation Demo
 * 
 * Interactive demo for testing transcription-client in fixture and live modes
 */

import { validateKey, transcribeAudio } from '../src/index.js';
import { createFixtureAudioBlob } from '../src/fixture.js';

// Storage: none. API key stays in the input and is not written to PWA
// localStorage (`groq_api_key`). Reserved unused prefix:
// `ww-iso-transcription-client:`.

// State
let currentMode = 'fixture';
let fixtureAudioBlob = null;
let isValidKey = false;

// DOM Elements
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

// Initialize
function init() {
  fixtureAudioBlob = createFixtureAudioBlob();
  setupEventListeners();
  updateUIForMode();
}

// Event Listeners
function setupEventListeners() {
  liveModeToggle.addEventListener('change', handleModeToggle);
  validateKeyBtn.addEventListener('click', handleValidateKey);
  transcribeBtn.addEventListener('click', () => handleTranscribe());
  resetBtn.addEventListener('click', handleReset);
  simNetworkBtn.addEventListener('click', () => handleTranscribe('network_failure'));
  simRateLimitBtn.addEventListener('click', () => handleTranscribe('rate_limit'));
  simInvalidAudioBtn.addEventListener('click', () => handleTranscribe('invalid_audio'));
}

// Mode Toggle Handler
function handleModeToggle(event) {
  currentMode = event.target.checked ? 'live' : 'fixture';
  updateUIForMode();
}

// Update UI based on current mode
function updateUIForMode() {
  if (currentMode === 'live') {
    // Live mode
    modeChip.textContent = 'LIVE MODE (real Groq API)';
    modeChip.className = 'mode-chip mode-live';
    apiKeyInput.disabled = false;
    validateKeyBtn.disabled = false;
    transcribeBtn.disabled = !isValidKey;
    errorSimSection.style.display = 'none';
  } else {
    // Fixture mode
    modeChip.textContent = 'FIXTURE MODE (mock transcript)';
    modeChip.className = 'mode-chip mode-fixture';
    apiKeyInput.disabled = true;
    validateKeyBtn.disabled = true;
    transcribeBtn.disabled = false;
    errorSimSection.style.display = 'block';
  }
}

// Validate Key Handler
async function handleValidateKey() {
  const apiKey = apiKeyInput.value.trim();
  
  if (!apiKey) {
    updateValidationStatus(false, 'Please enter an API key');
    return;
  }

  // Show validating state
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

// Update validation status display
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

// Transcribe Handler
async function handleTranscribe(simulateError = null) {
  // Show transcribing state
  transcriptOutput.textContent = 'Transcribing...';
  transcriptOutput.className = 'transcript-output loading';
  languageBadge.style.display = 'none';
  transcribeBtn.disabled = true;

  try {
    const options = {
      mode: currentMode
    };

    if (currentMode === 'live') {
      options.apiKey = apiKeyInput.value.trim();
    } else if (simulateError) {
      options.simulateError = simulateError;
    }

    const result = await transcribeAudio(fixtureAudioBlob, options);

    if (result.error) {
      // Error result
      transcriptOutput.textContent = `Error: ${result.error}`;
      transcriptOutput.className = 'transcript-output error';
      languageBadge.style.display = 'none';
    } else {
      // Success result
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

// Reset Handler
function handleReset() {
  // Clear transcript
  transcriptOutput.textContent = 'Click \'Transcribe Audio\' to generate transcript';
  transcriptOutput.className = 'transcript-output placeholder';
  languageBadge.style.display = 'none';

  // Clear validation
  validationStatus.textContent = 'Not validated';
  validationStatus.className = 'status-badge status-neutral';
  validationReason.textContent = '';
  isValidKey = false;

  // Clear API key if in live mode
  if (currentMode === 'live') {
    apiKeyInput.value = '';
    transcribeBtn.disabled = true;
  }
}

// Initialize on page load
init();
