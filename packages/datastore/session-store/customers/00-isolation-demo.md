# Customer: Isolation Demo (Standing Human Customer)

The Isolation Demo is a standing founder/developer customer that operates session-store by itself, without the production PWA.

## Producer's Understanding of This Customer

(To be filled by Phase 03 product-spec agent for session-store)

The Isolation Demo is the package factory floor. It needs to prove that session-store's core logic works (IndexedDB schema, writes, reads, deletes, retention policy) without depending on the PWA.

The demo operates on a sandbox IndexedDB instance (database name "web-whisper-sandbox-db", separate from production "web-whisper-db"). It allows the founder/developer to:
- Create sessions (manual "Create Session" button, returns session ID)
- Write chunks (fixture chunks or via optional capture-engine integration)
- Write volume profiles (fixture volume or via optional volume-analyzer integration)
- Write snips (fixture snips or via optional volume-analyzer integration)
- Write transcripts (manual text input)
- Read sessions (list sessions table with full metadata: duration, chunk count, size, volume/snips/transcripts indicators)
- Read chunks / volume profiles / snips / transcripts (click "Details" on session row to expand and see all related data)
- Delete sessions (click "Delete" button, confirms cascade delete of all related data)
- Enforce retention policy (set storage cap to low value, fill with sessions, click "Enforce Retention" button, see oldest sessions deleted)
- Test persistence (click "Reload Page" button, see session list repopulate with same data after page reload)

## Customer Request

(To be filled by Phase 04 customer-request agent for isolation-demo → session-store)

The isolation-demo customer will write its request here: what interfaces it needs from session-store (createSession, writeChunk, getSession, listSessions, deleteSession, enforceRetentionPolicy, getStorageStats), what inputs it will provide (session IDs, chunk blobs, volume profiles, snip data, transcript text), what outputs it expects (session metadata, chunk lists, volume profiles, snips, transcripts), and what validation it needs to see to trust the package.

## Producer Response

(To be filled by Phase 05 producer-response agent for session-store)

Session-store will respond here: how it will meet the isolation-demo's request, what interfaces it will expose for demo use, how the sandbox database is isolated from production, and how the demo proves the package works independently.
