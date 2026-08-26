# Customer: Isolation Demo (Standing Human Customer)

The Isolation Demo is a standing founder/developer customer that operates volume-analyzer by itself, without the production PWA.

## Producer's Understanding of This Customer

(To be filled by Phase 03 product-spec agent for volume-analyzer)

The Isolation Demo is the package factory floor. It needs to prove that volume-analyzer's core logic works (compute volume profile, detect silence, propose snips) without depending on session-store or the PWA.

The demo operates with fixture audio by default (simulated chunks with known volume patterns). It allows the founder/developer to:
- Compute volume profile from fixture chunks (or optionally live capture-engine in-memory chunks)
- See volume histogram (peak dB per chunk)
- Adjust silence threshold and watch snip boundaries update in real-time
- Propose snips and see snip list (start/end chunk indices, start/end times, durations)
- Test different fixture patterns (all-quiet, all-loud, quiet-loud-quiet) to prove edge cases

## Customer Request

(To be filled by Phase 04 customer-request agent for isolation-demo → volume-analyzer)

The isolation-demo customer will write its request here: what interfaces it needs from volume-analyzer, what inputs it will provide (fixture chunks or live capture chunks), what outputs it expects (volume profile, snip list), and what validation it needs to see to trust the package.

## Producer Response

(To be filled by Phase 05 producer-response agent for volume-analyzer)

Volume-analyzer will respond here: how it will meet the isolation-demo's request, what interfaces it will expose for demo use, what data modes it supports (fixture by default, optionally live-from-capture in-memory), and how the demo proves the package works independently.
