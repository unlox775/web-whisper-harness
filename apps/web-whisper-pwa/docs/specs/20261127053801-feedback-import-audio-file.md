Spec Status: resolved
Spec Type: feedback
Created: 2026-11-27T05:38:01Z
Resolved: 2026-11-27T06:00:00Z
Product: apps/web-whisper-pwa

# Feedback: Import an audio file as a new recording (iPhone)

## User Feedback

Dave (iPhone PWA): "Let me upload an audio file (at least .m4a) to add a new recording to transcribe, alongside live recording." The upload must show up in the same recording list and go through the same transcription pipeline as a live capture.

## Requested Outcome

One job: an **Import audio file** control on Home that turns a picked file into a normal session.

1. **Control:** in the Home **CAPTURE** card, below **Start recording**, a secondary button **Import audio file** backed by a hidden `<input type="file" accept="audio/*,.m4a,.mp3,.wav,.webm,.aac,.mp4">`. Works with the iOS Files / Voice Memos picker. Not developer-mode gated (unlike the session zip import). Disabled while recording or while an import runs.
2. **Flow (same as a live take after Stop):**
   1. `sessionStore.createSession()`.
   2. `captureEngine.importAudioFile(sessionId, file, { onProgress })` — chunks persisted durably by capture-engine before any transcription.
   3. `sessionStore.finalizeSession(id)`.
   4. `enforceCap({ force: true, opportunity: 'stop' })` (retention runs after persist idle, as after Stop).
   5. `ingestGrowingSession(id, { includeTrailing: true, transcribe: false, …context })` then, if the Groq key is valid, `transcribeSession(id, apiKey, …)` — the exact post-Stop path. Without a valid key the session is saved and playable; the existing PART TX / Retry path transcribes later.
3. **Progress:** the CAPTURE card status line shows `Importing <file name>… decoding` then `… N / M chunks saved`. Home list refreshes when the import finishes; the new session tile then shows the usual transcription badges / snippet as transcription completes. Toast: `Imported <name> (MM:SS). Transcribing…` (or `… Add a Groq key in Settings to transcribe.`).
4. **Errors:** `decode_failed` → toast `Could not read <name>. This browser can't decode that audio format.` and the empty session is deleted (no audio was written, so nothing is discarded). Any other failure after chunks were written keeps the session (never delete a session that has saved chunks).
5. **Durability:** imported audio is never discarded by the PWA. If the app is killed mid-import, already-saved chunks stay and `reconcileDanglingSessions` finalizes the session on next launch (existing behavior).
6. **Live recording unaffected:** Start recording and Import are mutually exclusive; no change to capture/Stop flow.
7. **Proof hooks:** none needed beyond Playwright file chooser; Groq is mocked by routing `api.groq.com` in Playwright.

## Formats

Whatever `decodeAudioData` supports in the browser: iOS Safari decodes m4a/AAC, mp3, wav (webm/Opus on iOS 17+). Desktop Chrome decodes all four. Open-source Chromium builds lack AAC (m4a) — expected, shown as the decode error.

## Limits

Decoded in memory at 16 kHz (capture-engine default) — ~230 MB for a 60 min mono file. Very long files may fail on older iPhones; error is reported, nothing partial is hidden.

## Customer docs

Update `customers/README.md` (end-user guarantee) and the PWA expectation section in `packages/lib/capture-engine/customers/web-whisper-pwa.md`.

## Tests / proof

- Unit: pure helpers (accept string, progress/status copy, toast copy, error mapping).
- Playwright iPhone 13 (Google Chrome channel so m4a/AAC decodes): BEFORE (Home without the control, current main), AFTER (Home with **Import audio file**), import in progress, imported session in the list, its transcript (mocked Groq) on Session Detail. Formats exercised: m4a, mp3, wav, webm.
- Existing unit tests green; live recording (`?simulate=1`) still records and stops.

## Resolution Criteria

- [x] Control + flow above
- [x] iPhone screenshots in PR body
- [x] Unit tests pass
- [x] `make build`
- [x] Spec Resolution section

## Resolution

Resolved on branch `pwa/import-audio-file` (capture-engine side merged in #78).

- `src/importAudio.ts` — accept string, status / success / error copy, `importWroteNothing`. Tests: `src/importAudio.test.ts`.
- `src/context.tsx` — `importAudio(file)` + `importStatus`: createSession → `importAudioFile` (progress → status line) → `finalizeSession` → refresh + toast → background `enforceCap('stop')` → `ingestGrowingSession` → `transcribeSession` (same as post-Stop). Decode failures delete the empty session only when it has 0 chunks; otherwise finalize and keep. `startRecording` is a no-op while importing.
- `src/screens/HomeScreen.tsx` — **Import audio file** (`cta-outline`) under Start recording; Start recording disabled while importing.

### Proof (Google Chrome, Playwright iPhone 13, Groq mocked via route)

- `documentation/qa/import-audio-01-before-home-iphone.png` — BEFORE (live main): no import control
- `import-audio-02-after-home-iphone.png` — AFTER: Import audio file
- `import-audio-03-decoding-iphone.png`, `import-audio-04-chunks-saved-iphone.png` — progress (decoding; 42 / 150 chunks saved for a 10 min m4a)
- `import-audio-05-list-ready-iphone.png` — imported m4a in the session list, READY + transcript snippet
- `import-audio-06-detail-transcript-iphone.png` — Session Detail: 0:26, playable, transcript (3 of 3 snips)
- `import-audio-07-all-formats-iphone.png` — m4a, mp3, wav, webm all imported + READY
- `import-audio-08-decode-error-iphone.png` — not-audio file → decode error toast, no session left behind
- `import-audio-09-live-recording-iphone.png` — live recording (`?simulate=1`) still records and stops

IndexedDB after the run: each 26 s import = 7 chunks, 208,800 B, status `ready`, `hasTranscript: true`. 10 min m4a: 150 chunks in ~5.8 s.
