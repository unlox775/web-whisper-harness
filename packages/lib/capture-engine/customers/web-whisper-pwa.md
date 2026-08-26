# Customer: apps/web-whisper-pwa

The Web Whisper PWA is the primary customer of capture-engine. The PWA calls capture-engine to record audio when the user taps "Start Recording" and writes chunks to session-store immediately.

## Producer's Understanding of This Customer

(To be filled by Phase 03 product-spec agent for capture-engine)

The PWA needs capture-engine to:
- Start capturing audio on demand (after PWA creates session via session-store and passes session ID)
- Encode MP3 chunks every ~4s and write them to session-store immediately (not at the end)
- Emit events when chunks encode (so PWA can update chunk count in developer mode)
- Stop capturing on demand and flush final chunk < 4s
- Detect mic ghost (iOS issue where mic granted but no audio callbacks) and report it honestly (not leave a zombie "recording" that is empty)
- Return completion summary (chunks written, total duration, hasAudio boolean)

The PWA will use the completion summary to decide:
- If hasAudio=true: navigate to session detail, user can play the recording
- If hasAudio=false: show "Recording completed without playable audio" (not "transcription failed"), offer Delete button

## Customer Request

(To be filled by Phase 04 customer-request agent for web-whisper-pwa → capture-engine)

The PWA customer will write its request here: exact interfaces it needs (`startCapture`, `stopCapture`, events), error handling expectations, timing requirements, session-store integration expectations, and how it will handle mic ghost failures.

## Producer Response

(To be filled by Phase 05 producer-response agent for capture-engine)

Capture-engine will respond here: how it will meet the PWA's request, what interfaces it will provide, what session-store calls it will make, how it will handle errors, and what completion summary format it will return.
