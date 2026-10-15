/**
 * Isolation Demo: with/without context side by side, plus guard fallback.
 * Fixture mock by default. Optional live Groq uses the silent fixture blob
 * once per snip so prompts can be inspected without a session zip.
 */

import { transcribeAudio, transcribeSequence } from '../src/index.js';
import { createFixtureAudioBlob } from '../src/fixture.js';
import {
  applyPastedKey,
  describeKeySource,
  loadStoredApiKey,
  persistDemoApiKey,
} from './apiKeyStore.js';
import {
  COMPARE_SNIPS,
  DEFAULT_VOCABULARY,
  GUARD_SNIPS,
  mockCompareTranscribe,
  mockGuardTranscribe,
  snipItems,
} from './contextFixtures.js';
import './styles.css';
import '../../../isolation-demo-shared/compact-mobile.css';

const liveModeToggle = document.getElementById('liveModeToggle');
const modeChip = document.getElementById('modeChip');
const vocabInput = document.getElementById('vocabInput');
const apiKeyInput = document.getElementById('apiKeyInput');
const pasteKeyBtn = document.getElementById('pasteKeyBtn');
const keySourceStatus = document.getElementById('keySourceStatus');
const runCompareBtn = document.getElementById('runCompareBtn');
const runGuardBtn = document.getElementById('runGuardBtn');
const runStatus = document.getElementById('runStatus');
const withoutOutput = document.getElementById('withoutOutput');
const withOutput = document.getElementById('withOutput');
const guardOutput = document.getElementById('guardOutput');

let liveMode = false;

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
    keySourceStatus.textContent = 'No saved key. Paste only if you want live Groq.';
  }
}

function persistCurrentKey() {
  persistDemoApiKey(apiKeyInput.value, storage());
}

function vocabulary() {
  return vocabInput.value.trim() || DEFAULT_VOCABULARY;
}

function formatRun(snips, results, titleNote) {
  const lines = titleNote ? [titleNote, ''] : [];
  for (let i = 0; i < results.length; i += 1) {
    const snip = snips[i];
    const row = results[i];
    const result = row.result || {};
    const text = result.error ? `Error: ${result.error}` : result.text || '(empty)';
    const quality = [];
    if (typeof result.noSpeechProb === 'number') {
      quality.push(`no_speech_prob ${result.noSpeechProb.toFixed(2)}`);
    }
    if (typeof result.avgLogprob === 'number') {
      quality.push(`avg_logprob ${result.avgLogprob.toFixed(2)}`);
    }
    const guard = row.guardReason ? ` · guard ${row.guardReason}` : '';
    lines.push(`[${i + 1}] ${snip.label} · ${row.kind || 'none'}${guard}`);
    lines.push(`spoken: ${snip.spoken}`);
    lines.push(`prompt: ${row.prompt ? JSON.stringify(row.prompt) : '(empty)'}`);
    if (quality.length) lines.push(`quality: ${quality.join(', ')}`);
    lines.push(`transcript: ${text}`);
    lines.push('');
  }
  return lines.join('\n').trim();
}

function setLoading(el, message) {
  el.textContent = message;
  el.className = 'transcript-output loading';
}

function setOutput(el, text, ok = true) {
  el.textContent = text;
  el.className = ok ? 'transcript-output success' : 'transcript-output error';
}

async function liveTranscribeForSnip(_blob, options) {
  const audio = createFixtureAudioBlob();
  return transcribeAudio(audio, {
    mode: 'live',
    apiKey: apiKeyInput.value.trim(),
    prompt: options.prompt,
    contextEnabled: options.contextEnabled,
  });
}

async function runSequence(snips, transcribe, contextEnabled) {
  return transcribeSequence(snipItems(snips), {
    transcribe,
    vocabulary: vocabulary(),
    contextEnabled,
    mode: liveMode ? 'live' : 'fixture',
    apiKey: apiKeyInput.value.trim(),
  });
}

function updateModeChip() {
  if (liveMode) {
    modeChip.textContent = 'LIVE GROQ (fixture blobs · real prompt)';
    modeChip.className = 'mode-chip mode-live';
  } else {
    modeChip.textContent = 'FIXTURE MODE (mock Groq)';
    modeChip.className = 'mode-chip mode-fixture';
  }
}

async function handleRunCompare() {
  if (liveMode && !apiKeyInput.value.trim()) {
    setOutput(withoutOutput, 'Paste a Groq API key for live mode.', false);
    setOutput(withOutput, 'Paste a Groq API key for live mode.', false);
    return;
  }
  runCompareBtn.disabled = true;
  runGuardBtn.disabled = true;
  setLoading(withoutOutput, 'Transcribing without context…');
  setLoading(withOutput, 'Transcribing with context (serial)…');
  runStatus.textContent = liveMode
    ? 'Live Groq: each snip is the silent fixture blob. Compare prompts, not speech content.'
    : 'Fixture mock: snip 2/3 spelling follows the prompt.';
  try {
    const transcribe = liveMode ? liveTranscribeForSnip : mockCompareTranscribe;
    const without = await runSequence(COMPARE_SNIPS, transcribe, false);
    setOutput(withoutOutput, formatRun(COMPARE_SNIPS, without, 'context off · empty prompt'));
    const withCtx = await runSequence(COMPARE_SNIPS, transcribe, true);
    setOutput(
      withOutput,
      formatRun(
        COMPARE_SNIPS,
        withCtx,
        'context on · snip N waits for N−1 · vocab first, then tail'
      )
    );
  } catch (error) {
    setOutput(withoutOutput, `Error: ${error.message}`, false);
    setOutput(withOutput, `Error: ${error.message}`, false);
  } finally {
    runCompareBtn.disabled = false;
    runGuardBtn.disabled = false;
  }
}

async function handleRunGuard() {
  if (liveMode && !apiKeyInput.value.trim()) {
    setOutput(guardOutput, 'Paste a Groq API key for live mode.', false);
    return;
  }
  runCompareBtn.disabled = true;
  runGuardBtn.disabled = true;
  setLoading(guardOutput, 'Running guard scenario…');
  try {
    const transcribe = liveMode ? liveTranscribeForSnip : mockGuardTranscribe;
    const results = await runSequence(GUARD_SNIPS, transcribe, true);
    const note = liveMode
      ? 'Live Groq: snip 1 is silent fixture audio. If no_speech_prob is high or text is empty/repetitive, snip 2 prompt is vocabulary only.'
      : 'Fixture: snip 1 is a thank-you loop with high no_speech_prob. Snip 2 prompt is vocabulary only (vocab-guard).';
    setOutput(guardOutput, formatRun(GUARD_SNIPS, results, note));
  } catch (error) {
    setOutput(guardOutput, `Error: ${error.message}`, false);
  } finally {
    runCompareBtn.disabled = false;
    runGuardBtn.disabled = false;
  }
}

function handleApiKeyPaste(event) {
  const pasted =
    event.clipboardData?.getData('text') ||
    event.clipboardData?.getData('text/plain') ||
    '';
  if (!pasted) {
    queueMicrotask(() => persistCurrentKey());
    return;
  }
  event.preventDefault();
  apiKeyInput.value = applyPastedKey(
    apiKeyInput.value,
    apiKeyInput.selectionStart,
    apiKeyInput.selectionEnd,
    pasted
  );
  persistCurrentKey();
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
      keySourceStatus.textContent = 'Pasted from clipboard (saved).';
      return;
    }
  } catch {
    /* iOS often blocks clipboard.readText */
  }
  keySourceStatus.textContent = 'Clipboard API blocked. Long-press the key field and choose Paste.';
}

liveModeToggle.addEventListener('change', (event) => {
  liveMode = event.target.checked;
  updateModeChip();
});
runCompareBtn.addEventListener('click', () => void handleRunCompare());
runGuardBtn.addEventListener('click', () => void handleRunGuard());
apiKeyInput.addEventListener('input', persistCurrentKey);
apiKeyInput.addEventListener('paste', handleApiKeyPaste);
pasteKeyBtn.addEventListener('click', () => void handlePasteKeyButton());

restoreApiKey();
updateModeChip();
