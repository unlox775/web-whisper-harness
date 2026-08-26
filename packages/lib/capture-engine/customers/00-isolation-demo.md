# Customer: Isolation Demo (Standing Human Customer)

The Isolation Demo is a standing founder/developer customer that operates capture-engine by itself, without the production PWA or session-store writes.

## Producer's Understanding of This Customer

(To be filled by Phase 03 product-spec agent for capture-engine)

The Isolation Demo is the package factory floor. It needs to prove that capture-engine's core logic works (acquire mic, capture PCM, encode MP3 chunks every ~4s, detect mic ghost, flush final chunk) without depending on session-store or the PWA.

The demo operates in-memory only (no IndexedDB writes). It allows the founder/developer to:
- Start capture with live mic or simulated PCM
- Watch chunks encode every ~4s (visualized in chunk tape list)
- See duration from PCM sample count (not wall clock)
- Play each chunk from RAM immediately (proves encoding worked)
- Detect mic ghost (watchdog timeout if no audio received)
- Stop and see final chunk < 4s flush correctly
- Reset and discard everything (proves in-memory, not durable)

## Customer Request

(To be filled by Phase 04 customer-request agent for isolation-demo → capture-engine)

The isolation-demo customer will write its request here: what interfaces it needs from capture-engine, what inputs it will provide, what outputs it expects, how it will operate the package, and what validation it needs to see to trust the package.

## Producer Response

(To be filled by Phase 05 producer-response agent for capture-engine)

Capture-engine will respond here: how it will meet the isolation-demo's request, what interfaces it will expose for demo use, what data modes it supports (in-memory only for this demo), and how the demo proves the package works independently.
