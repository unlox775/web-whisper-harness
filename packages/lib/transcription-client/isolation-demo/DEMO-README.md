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
3. The demo calls `parseSessionArchive` and concatenates non-null chunk blobs (same one-shot blob as live mic)
4. Click **Transcribe Audio** — fixture mock or live Groq, depending on the toggle. Transcripts stay in the panel (not written to IndexedDB)
5. Bad zip → **Cannot read archive**. Wrong `formatVersion` / not a session archive → **Unsupported or invalid archive**. Purged / metadata-only → **No audio in archive to transcribe**

### Live Mode (Groq API Key Required)

1. Toggle **"Enable Live Mode"** ON
2. Enter your Groq API key (starts with `gsk_...`)
3. Click **"Validate Key"** → see validation result (Valid ✓ or Invalid ✗)
4. Click **"Transcribe Audio"** → see real transcript from Groq
5. Language badge appears if Groq returns language code

## Features Demonstrated

✓ API key validation (live mode)  
✓ Audio transcription (fixture + live modes)  
✓ Session archive zip as transcribe source (`parseSessionArchive`, concatenated chunks)  
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

The demo stores your API key in browser memory only. When you close the page, the key is lost. Enter it again when you return to the demo.
