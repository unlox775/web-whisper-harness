# Customer: apps/web-whisper-pwa

The Web Whisper PWA is the primary customer of playback-engine. The PWA calls playback-engine to play sessions, chunks, and snips in session detail and developer mode screens.

## Producer's Understanding of This Customer

(To be filled by Phase 03 product-spec agent for playback-engine)

The PWA needs playback-engine to:
- Play sessions (session detail screen: user clicks "Play Session" button → PWA calls `playSession(sessionId)` → audio plays in-page, user sees playback controls: pause, resume, seek, time display)
- Play chunks (developer mode chunk list: user clicks "Play" button on chunk row → PWA calls `playChunk(chunkId)` → single chunk audio plays)
- Play snips (session detail snip list: user clicks "Play" button on snip row → PWA calls `playSnip(snipId)` → snip audio plays; OR transcription flow: PWA may play snip before transcribing to preview)
- Provide playback handle with methods: `pause()`, `resume()`, `seek(time)`, `stop()`
- Emit playback events: `playing`, `paused`, `ended`, `timeupdate` (so PWA can update UI: progress bar, time display, play/pause button state)
- Handle errors (chunk missing, blob read failure, HTML5 audio error) → emit `playbackError` event, PWA displays "Playback failed" to user

The PWA will:
- Subscribe to playback events to update UI
- Call playback handle methods based on user interactions (user clicks pause button → PWA calls `handle.pause()`)
- Display current time and duration from events (timeupdate event → PWA updates "5:32 / 12:45" time display)
- Handle playback errors (playbackError event → PWA shows "Playback failed: chunk not found" toast)

## Customer Request

(To be filled by Phase 04 customer-request agent for web-whisper-pwa → playback-engine)

The PWA customer will write its request here: exact interfaces it needs (`playSession`, `playChunk`, `playSnip`, playback handle methods, events), error handling expectations (what errors are possible, how to recover), playback state expectations (when does playback auto-stop, what happens if user navigates away), audio concatenation expectations (seamless multi-chunk playback, no gaps).

## Producer Response

(To be filled by Phase 05 producer-response agent for playback-engine)

Playback-engine will respond here: how it will meet the PWA's request, what interfaces it will provide, what event formats it will emit, how it will implement audio concatenation (blob concatenation vs sequential playback), how it will handle errors, and what playback handle lifecycle management it expects from caller (does caller need to call `stop()` before releasing handle, or is handle auto-released when playback ends).
