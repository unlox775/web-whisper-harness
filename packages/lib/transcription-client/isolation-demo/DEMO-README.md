# Transcription Client Isolation Demo

## Quick Start

```bash
cd packages/lib/transcription-client/isolation-demo
npm install
npm start
```

The demo will open in your browser at `http://localhost:3002`.

## What This Demo Does

This isolation demo proves that transcription-client works correctly:

- **Fixture Mode (default)**: Returns mock transcripts without making real API calls
- **Live Mode (optional)**: Makes real requests to Groq Whisper API with your API key
- **Audio sources**: live microphone, optional fixture blob, or **Upload session archive** (zip from session-store export)

## Using the Demo

### Fixture Mode (No API Key Required)

1. Demo starts in **FIXTURE MODE** by default
2. Click **"Transcribe Audio"** → see mock transcript: "This is a test transcription from fixture audio"
3. Try error simulations:
   - **"Simulate Network Failure"** → see network error handling
   - **"Simulate Rate Limit"** → see rate limit error handling
   - **"Simulate Invalid Audio"** → see invalid audio error handling
4. Click **"Reset"** to clear output

### Upload session archive

1. Choose **Upload session archive** as the audio source
2. Pick a `web-whisper-session-*.zip` exported from session-store (spec `20260904180001`)
3. The demo calls `parseSessionArchive` and builds **step units**:
   - **Snips** when `snips.json` is present and audio can be assembled (concat `chunkIds`, same as PWA live path; empty `chunkIds` → time overlap)
   - **Chunks** for slim zips (no snips.json, or `hasSnips` flag only)
4. In **mock** mode, **Transcribe remaining** / **Next** refuse: `Switch to Live Groq API to transcribe this archive`. They do **not** return the fixture sentence.
5. Toggle **Live Groq API**, paste/validate a key, then **Next snip/chunk** (one unit) or **Transcribe remaining** (sequential remaining units). Each live unit hits Groq. Transcripts stay in the panel (not written to IndexedDB)
6. Bad zip → **Cannot read archive**. Wrong `formatVersion` / not a session archive → **Unsupported or invalid archive**. Purged / metadata-only → **No audio in archive to transcribe**

### Live Mode (Groq API Key Required)

1. The key field is always enabled — **paste** (long-press on iPhone, Cmd/Ctrl-V, or **Paste** button). The field is never disabled.
2. Key is saved as `ww-iso-transcription-client:groqApiKey` and restored on reload. If that is empty, the demo **reads** PWA `groq_api_key` (does not write it).
3. Toggle **"Live Groq API"** ON
4. Click **"Validate Key"** → see validation result (Valid ✓ or Invalid ✗)
5. Click **"Transcribe Audio"** (or Next / Transcribe remaining on an archive) → see real transcript from Groq
6. Language badge appears if Groq returns language code

## Features Demonstrated

✓ API key validation (live mode)  
✓ Audio transcription (fixture + live modes)  
✓ Session archive zip as transcribe source (`parseSessionArchive`, snip or chunk step-through)  
✓ Archive + mock refuse copy (never unlabeled fixture text)  
✓ Groq key paste + persist (`ww-iso-transcription-client:groqApiKey`, optional read of `groq_api_key`)  
✓ Error handling (network failure, rate limit, invalid key, invalid audio)  
✓ Retry logic with exponential backoff  
✓ Structured error results (no thrown exceptions)  
✓ Language detection (optional)

## Troubleshooting

**"Enable Live Mode" toggle doesn't work**
- Ensure JavaScript is enabled in your browser

**Validation fails with "Network error"**
- Check your internet connection
- Verify Groq API is accessible

**Transcription fails with "Invalid API key"**
- Verify your Groq API key starts with `gsk_`
- Check key is active in your Groq account

**Demo doesn't start**
- Ensure Node.js is installed
- Run `npm install` first
- Check port 3002 is available

## API Key Security

⚠️ **Never commit API keys to the repository**

The demo writes the key only to `localStorage['ww-iso-transcription-client:groqApiKey']`. It never writes PWA `groq_api_key` or IndexedDB. Reload restores the demo key, or the PWA key if the demo key is missing.
