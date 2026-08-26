# Phase 04: Isolation Demo → volume-analyzer Customer Request

**Date**: 2026-08-26  
**Phase**: 04 (Customer Requests)  
**Relationship**: Isolation Demo → packages/lib/volume-analyzer  
**Customer Document**: `packages/lib/volume-analyzer/customers/00-isolation-demo.md`

## Relationship Summary

The Isolation Demo is the standing founder/developer customer that operates volume-analyzer independently to prove volume computation and snip proposal algorithms work correctly with known-good fixture data. It is the package factory floor for validating volume analysis logic.

## Customer Request Content

The Isolation Demo's customer request in `packages/lib/volume-analyzer/customers/00-isolation-demo.md` specifies:

- **Safe default: Fixture audio**: Demo defaults to fixture audio chunks with known volume patterns (no session-store, no capture-engine, instant validation). Fixture patterns: "Quiet → Loud → Quiet" (default), "All Quiet", "All Loud", "Loud → Quiet → Loud", "Short Speech".

- **Interfaces needed**: `analyzeVolume(chunks)` (input: chunk array with blobs, output: {chunkVolumes: [{chunkId, peakDb}]}), `proposeSnips(chunks, volumeProfile, options?)` (input: chunks metadata + volume profile + threshold, output: {snips: [...]}).

- **Real-time threshold tuning**: When operator moves threshold slider (-60 dB to -20 dB), demo immediately re-calls `proposeSnips` with new threshold. Snip boundaries auto-update. Proves algorithm is tunable, threshold impacts snip boundaries predictably.

- **Visual proof: Volume histogram**: X-axis = chunk index, Y-axis = peak dB (-60 dB to 0 dB). Bars color-coded: red (quiet, < threshold), green (loud, >= threshold). Threshold line (dashed horizontal line) moves when slider adjusted. Snip boundaries (cyan vertical lines) appear after "Propose Snips" clicked.

- **Visual proof: Snip list table**: Columns: Snip ID, Chunks, Time Range, Duration, Confidence. Updates when "Propose Snips" clicked or threshold slider moved.

- **Edge cases validation**: All-Quiet (0 snips, message: "No speech detected"), All-Loud (1 snip covering entire session), Short Speech (1 snip < 5s, proves min duration not strict), Threshold Tuning (snip boundaries update in real-time).

- **Optional mode: Live Capture (in-memory)**: Operator toggles "Enable Live Capture" ON → demo includes capture-engine (in-memory mode, NO session-store writes). Captured chunks live in RAM. Operator computes volume → proposes snips from live audio. Proves volume-analyzer works with real audio from capture-engine.

- **UI panels**: Top Chrome Panel (data mode chip, live capture toggle), Control Panel (fixture dropdown, Compute/Propose/Reset buttons, threshold slider), Volume Histogram Panel, Snip List Panel.

- **Performance expectations**: `analyzeVolume` < 500ms for 15 fixture chunks. `proposeSnips` < 100ms for 15-chunk volume profile. Threshold slider < 50ms to re-run snip proposal + update UI (real-time feel).

## Phase 05 Follow-Up

Phase 05 producer-response agent will write volume-analyzer's response in the same customer document, confirming how it will meet the Isolation Demo's request.
