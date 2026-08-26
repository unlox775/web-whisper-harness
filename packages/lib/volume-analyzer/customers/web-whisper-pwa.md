# Customer: apps/web-whisper-pwa

The Web Whisper PWA is the primary customer of volume-analyzer. The PWA calls volume-analyzer to compute volume profiles and propose snips after recording completes.

## Producer's Understanding of This Customer

(To be filled by Phase 03 product-spec agent for volume-analyzer)

The PWA needs volume-analyzer to:
- Compute volume profile after recording completes (read chunks from session-store, compute peak dB per chunk, write volume profile to session-store)
- Propose snips based on silence detection (group contiguous loud chunks, split on silence > threshold duration, write snips to session-store)
- Support recomputation (user may change silence threshold in developer mode and click "Re-snip" button)
- Handle edge cases: session with no audio (all-quiet → zero snips), session with no silence (all-loud → one snip covering entire session), very short session (< 4s → one chunk, one snip)

The PWA will use the snip list to:
- Transcribe each snip separately (call transcription-client per snip, not per chunk or entire session)
- Display snip count in session detail (developer mode)
- Allow user to play individual snips (call playback-engine per snip)

## Customer Request

(To be filled by Phase 04 customer-request agent for web-whisper-pwa → volume-analyzer)

The PWA customer will write its request here: exact interfaces it needs (`analyzeVolume`, `proposeSnips`), session-store integration expectations (does PWA call analyzeVolume first, or does proposeSnips call it automatically if missing?), error handling expectations, edge case handling.

## Producer Response

(To be filled by Phase 05 producer-response agent for volume-analyzer)

Volume-analyzer will respond here: how it will meet the PWA's request, what interfaces it will provide, what session-store calls it will make, how it will handle edge cases, and what snip proposal format it will return.
