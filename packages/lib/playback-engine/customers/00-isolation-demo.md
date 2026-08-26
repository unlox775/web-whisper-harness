# Customer: Isolation Demo (Standing Human Customer)

The Isolation Demo is a standing founder/developer customer that operates playback-engine by itself, without the production PWA.

## Producer's Understanding of This Customer

(To be filled by Phase 03 product-spec agent for playback-engine)

The Isolation Demo is the package factory floor. It needs to prove that playback-engine's core logic works (read audio, concatenate chunks, play, pause, seek, stop, emit events) without depending on the PWA.

The demo operates with fixture audio by default (simulated session with 3 chunks, 2 snips). It allows the founder/developer to:
- Play sessions (concatenates all chunks, plays full 11.6s audio)
- Play chunks (plays single chunk: 4.0s, 4.1s, or 3.5s)
- Play snips (concatenates chunk range: snip 0 = chunks 0–1 = 8.1s, snip 1 = chunk 2 = 3.5s)
- Control playback (play, pause, resume, stop, seek)
- See playback state (current time, duration, playing/paused/stopped)
- See playback events (event feed logs all events: playing, paused, ended, error)

Optionally, the demo can read from real session-store in read-only mode (sandbox IndexedDB, not production) to prove storage integration.

## Customer Request

(To be filled by Phase 04 customer-request agent for isolation-demo → playback-engine)

The isolation-demo customer will write its request here: what interfaces it needs from playback-engine (`playSession`, `playChunk`, `playSnip`, playback handle methods), what inputs it will provide (fixture session ID or real session ID from sandbox store), what outputs it expects (playback handle with methods and events), and what validation it needs to see to trust the package.

## Producer Response

(To be filled by Phase 05 producer-response agent for playback-engine)

Playback-engine will respond here: how it will meet the isolation-demo's request, what interfaces it will expose for demo use, what data modes it supports (fixture by default, optionally real store read-only), and how the demo proves the package works independently.
