# Phase 04: Isolation Demo → session-store Customer Request

**Date**: 2026-08-26  
**Phase**: 04 (Customer Requests)  
**Relationship**: Isolation Demo → packages/datastore/session-store  
**Customer Document**: `packages/datastore/session-store/customers/00-isolation-demo.md`

## Relationship Summary

The Isolation Demo is the standing founder/developer customer that operates session-store independently to prove the package works before PWA integration. It is the package factory floor: a separately launchable web app that exercises all session-store interfaces with manual operator controls.

## Customer Request Content

The Isolation Demo's customer request in `packages/datastore/session-store/customers/00-isolation-demo.md` specifies:

- **Sandbox database isolation**: Demo operates on sandbox IndexedDB (`web-whisper-sandbox-db`, separate from production `web-whisper-db`). Session-store MUST provide configuration option: `sessionStore.init({databaseName: 'web-whisper-sandbox-db'})`.

- **Safe default: Fixture data entry**: Demo defaults to manual controls (click buttons to create session, write chunk, write volume profile, etc.). Data mode labeled "FIXTURE DATA" (cyan chip). Optional live integrations (capture-engine, volume-analyzer) clearly labeled "LIVE CAPTURE" (orange chip), "COMPUTED VOLUME" (purple chip).

- **All session-store interfaces exercised**: Demo calls ALL interfaces: `createSession`, `writeChunk`, `writeVolumeProfile`, `writeSnip`, `writeTranscript`, `listSessions`, `getSession`, `getChunksForSession`, `getChunk`, `getVolumeProfile`, `getSnipsForSession`, `getSnip`, `getTranscriptsForSession`, `getTranscript`, `deleteSession`, `getStorageStats`, `enforceRetentionPolicy`.

- **Validation walkthrough**: Demo proves session-store works by executing 10-step walkthrough: create session → write 3 chunks → write volume profile → write 2 snips → write 2 transcripts → read operations → delete session → enforce retention policy → reload page (prove persistence) → inspect schema in IndexedDB DevTools.

- **UI panels**: Session List Panel (table), Write Operations Panel (buttons + forms), Storage Management Panel (usage display + retention controls), Details Panel (tabs: Chunks, Volume Profile, Snips, Transcripts), Persistence Status Badge.

- **Error handling**: Session-store MUST return error objects (NOT throw exceptions). Demo displays error toasts for `session_not_found`, `snip_not_found`, `quota_exceeded`, `database_unavailable`.

- **Cascade delete validation**: After delete, operator inspects IndexedDB DevTools to verify all chunks/volume-profile/snips/transcripts deleted (no orphan data).

- **Retention policy validation**: Operator creates 5 sessions (~5 MB), sets cap to 2 MB, clicks "Enforce". Session-store MUST delete oldest 3 sessions (sorted by createdAt ASC), keep newest 2 sessions.

- **Performance expectations**: Demo UI should feel snappy. `createSession` < 50ms, `writeChunk` < 100ms, `listSessions` < 200ms for < 20 sessions, `deleteSession` < 500ms (acceptable with cascade delete).

## Phase 05 Follow-Up

Phase 05 producer-response agent will write session-store's response in the same customer document, confirming how it will meet the Isolation Demo's request.
