# Session Store Isolation Demo

Package-local runnable demo for operating session-store independently without the production PWA.

## Purpose

Proves that session-store:
- Creates IndexedDB schema (all object stores: sessions, chunks, volume-profiles, snips, transcripts)
- Writes sessions, chunks, volume profiles, snips, transcripts
- Reads sessions, chunks, volume profiles, snips, transcripts (proves data persists after page reload)
- Deletes sessions with cascade (session + all chunks + volume profile + snips + transcripts)
- Enforces retention policy (deletes oldest sessions when storage quota exceeded)
- Calculates storage stats accurately (used bytes, cap bytes, session count, chunk count)

## Runtime

- **Platform**: Web app (local dev server, factory floor operating surface)
- **Viewport**: Desktop browser (wider factory floor, not phone-shaped)
- **Launch**: `cd packages/datastore/session-store/isolation-demo && npm start` (or equivalent)

## Data Mode

**Sandbox IndexedDB** (database name "web-whisper-sandbox-db", separate from production "web-whisper-db"). All writes go to sandbox database. Data persists across page reloads (proves durable storage). Can include **capture-engine** (in-memory → flush to store), **volume-analyzer** (fixture or live-from-capture → write to store) as optional demo dependencies for testing integrated write flows.

**Safe default**: Manual data entry (click "Create Session" button, manually write chunks via file upload or fixture, manually write volume profiles + snips, manually write transcripts via text input).

## Panel-Based Layout

**5 distinct regions:**

### 1. Top Chrome Panel (fixed header, spans full width)

- **Left**: "Session Store Isolation Demo" heading (bold)
- **Center**: Database name chip "SANDBOX DB (web-whisper-sandbox-db)" (cyan border, white text)
- **Right**: Storage stats: "Storage: 1.2 MB / 5.0 MB (24%)" (updates when data written/deleted)

### 2. Write Operations Panel (left quarter of viewport, below chrome, scrollable)

**Components:**
- Heading: "Write Operations" (small gray text)
- **Session writes:**
  - "Create Session" button (cyan, creates new empty session, returns session ID)
  - Session ID display: "Last created: ses_abc123" (shows last created session ID)
- **Chunk writes:**
  - Session ID input: "Session ID for chunk" (text input, pre-filled with last created session ID)
  - Chunk data source toggle: "Fixture Chunk" (default) vs "Upload MP3 File" vs "Live from Capture-Engine" (radio buttons)
  - "Write Chunk" button (cyan, writes one chunk with selected data source)
  - Chunk count display: "Chunks written: 3" (increments with each write)
- **Volume Profile writes:**
  - Session ID input: "Session ID for volume profile"
  - Volume data source toggle: "Fixture Volume" (default, mock peakDb values) vs "Compute via Volume-Analyzer" (includes volume-analyzer, reads chunks from store, computes real volume)
  - "Write Volume Profile" button (cyan)
- **Snip writes:**
  - Session ID input: "Session ID for snips"
  - Snip data source toggle: "Fixture Snips" (default, mock snip boundaries) vs "Propose via Volume-Analyzer" (includes volume-analyzer, reads volume profile, computes real snips)
  - "Write Snips" button (cyan)
  - Snip count display: "Snips written: 2"
- **Transcript writes:**
  - Snip ID input: "Snip ID for transcript" (text input)
  - Transcript text input: "Transcript text" (large text area, manual entry)
  - "Write Transcript" button (cyan)

**Behaviors:**
- When "Create Session" clicked → new session created in sandbox DB, session ID displayed ("Last created: ses_abc123"), session list panel updates (new row appears)
- When "Write Chunk" clicked → chunk written to sandbox DB (session ID from input, data from selected source), chunk count increments, storage stats update
- When "Write Volume Profile" clicked → volume profile written to sandbox DB (session ID from input, data from selected source or computed via volume-analyzer)
- When "Write Snips" clicked → snips written to sandbox DB (session ID from input, data from selected source or computed via volume-analyzer), snip count increments
- When "Write Transcript" clicked → transcript written to sandbox DB (snip ID from input, text from text area)

### 3. Session List Panel (center half of viewport, below chrome, scrollable table)

**Components:**
- Heading: "Sessions in Sandbox DB" (small gray text)
- Table columns:
  - Session ID (e.g., "ses_abc123", truncated with ellipsis)
  - Created At (e.g., "2026-08-26 15:20:37")
  - Duration (e.g., "12.5s", or "0s" if no chunks yet)
  - Chunks (e.g., "3", or "0")
  - Size (e.g., "1.2 MB", or "0 B")
  - Volume? (e.g., "✓" green if has volume profile, "—" gray if not)
  - Snips? (e.g., "2" if has snips, "—" gray if not)
  - Transcripts? (e.g., "2" if has transcripts, "—" gray if not)
  - Actions: "Details" button (cyan, expands row to show chunks/snips/transcripts), "Delete" button (red, deletes session)
- Rows sorted by createdAt desc (newest at top)

**Behaviors:**
- When "Create Session" clicked (in write panel) → new row appears at top of table
- When "Details" button clicked on a row → row expands below to show:
  - Chunks list (seq, start time, end time, size, "Read" button to fetch blob and play or inspect)
  - Volume profile (if exists): list of chunk volumes (chunkId, peakDb)
  - Snips list (if exists): snip ID, start/end chunk indices, start/end times, duration, "Read" button
  - Transcripts list (if exists): snip ID, transcript text preview (first 50 chars), "Read Full" button
- When "Delete" button clicked → confirmation dialog ("Delete session ses_abc123 and all chunks/snips/transcripts?"), if confirmed → session + all related data deleted, row removed from table, storage stats update

### 4. Storage Management Panel (right quarter of viewport, below chrome)

**Components:**
- Heading: "Storage Management" (small gray text)
- Storage cap input: "Storage Cap (MB): 5.0" (text input, default 5 MB for demo testing; production default is 200 MB)
- "Update Cap" button (gray, updates storage cap setting)
- Storage stats display (read-only, updates automatically):
  - Used: "1.2 MB"
  - Cap: "5.0 MB"
  - Usage: "24%"
  - Sessions: "5"
  - Chunks: "15"
- "Enforce Retention Policy" button (red, triggers retention policy: deletes oldest sessions until used <= cap)
- Retention log (scrollable, shows results of last enforcement):
  - "Retention policy enforced at 2026-08-26 15:25:10"
  - "Deleted 2 sessions (ses_old001, ses_old002) to reclaim 0.8 MB"
  - "New usage: 1.2 MB / 5.0 MB (24%)"

**Behaviors:**
- When "Update Cap" clicked → storage cap setting updates, storage stats "Cap" field updates, usage percentage recalculates
- When "Enforce Retention Policy" clicked → retention policy runs (sorts sessions by createdAt asc, deletes oldest until used <= cap), retention log updates with results, session list panel updates (deleted session rows removed), storage stats update
- Storage stats update automatically whenever data written or deleted (after "Write Chunk", after "Delete" session, after "Enforce Retention Policy")

### 5. Reload Test Panel (bottom strip, spans full width, secondary disclosure)

**Components:**
- Heading: "Persistence Test" (small gray text)
- "Reload Page" button (gray, full-width in panel, triggers `window.location.reload()`)
- Persistence status badge: "Data persists across reloads ✓" (green, visible after page reloaded and session list still populated) OR "Data lost after reload ✗" (red, if session list empty after reload)

**Behaviors:**
- When "Reload Page" clicked → page reloads, sandbox DB should still exist, session list should repopulate with same sessions (proves durable storage works)
- After page load: if session list has rows → persistence status shows "Data persists across reloads ✓" (green)
- After page load: if session list empty but user had created sessions before reload → persistence status shows "Data lost after reload ✗" (red, indicates IndexedDB bug or schema issue)

## Before / After States

**Before state (page load, sandbox DB empty):**
- Top chrome: "SANDBOX DB (web-whisper-sandbox-db)" chip, storage stats "0 B / 5.0 MB (0%)"
- Write operations panel: All inputs empty or default, "Create Session" button enabled, other write buttons enabled
- Session list panel: Empty, placeholder text "No sessions yet. Click 'Create Session' to start."
- Storage management panel: Storage cap "5.0 MB" (default), storage stats all 0, retention log empty
- Reload test panel: "Reload Page" button enabled, persistence status hidden (no data yet)

**After state (after Create Session → Write 3 Chunks → Write Volume Profile → Write 2 Snips → Write 2 Transcripts for 2 snips):**
- Top chrome: Storage stats "1.2 MB / 5.0 MB (24%)"
- Write operations panel: "Last created: ses_abc123", chunk count "3", snip count "2"
- Session list panel: 1 row visible:
  - Session ID: "ses_abc123"
  - Created At: "2026-08-26 15:20:37"
  - Duration: "12.5s"
  - Chunks: "3"
  - Size: "1.2 MB"
  - Volume?: "✓" (green)
  - Snips?: "2"
  - Transcripts?: "2"
  - Actions: "Details", "Delete"
- Storage management panel: Used "1.2 MB", Cap "5.0 MB", Usage "24%", Sessions "1", Chunks "3"
- Reload test panel: "Reload Page" button enabled

**After state (after Reload Page clicked → page reloaded):**
- All panels: Same as before reload (session list still has 1 row, storage stats still "1.2 MB / 5.0 MB (24%)")
- Reload test panel: Persistence status badge visible "Data persists across reloads ✓" (green)

**After state (after storage cap reduced to 0.5 MB, Enforce Retention Policy clicked):**
- Session list panel: Row for ses_abc123 removed (deleted by retention policy)
- Storage management panel: Used "0 B", Cap "0.5 MB", Usage "0%", Sessions "0", Chunks "0", retention log visible:
  - "Retention policy enforced at 2026-08-26 15:30:00"
  - "Deleted 1 session (ses_abc123) to reclaim 1.2 MB"
  - "New usage: 0 B / 0.5 MB (0%)"
- Top chrome: Storage stats "0 B / 0.5 MB (0%)"

## What This Demo Does NOT Do

- Does not implement capture logic (capture-engine does that; demo may include capture-engine as optional dependency for integrated chunk-write testing, but capture logic itself is not in session-store)
- Does not implement volume analysis logic (volume-analyzer does that; demo may include volume-analyzer as optional dependency for integrated volume-profile/snip-write testing)
- Does not implement transcription logic (transcription-client does that; demo uses manual text input for transcripts)
- Does not implement playback logic (playback-engine does that; demo may have "Read" buttons to fetch blobs, but playback itself is not in session-store)
- Session-store's public interface is the datastore authority for all data
- This demo exercises the CORE LOGIC (IndexedDB schema, writes, reads, deletes, retention policy) without the PWA orchestration
- This demo uses a sandbox database (separate from production "web-whisper-db") to avoid polluting production data

## Implementation Notes

(To be filled by Phase 06 implementation agent)

- Sandbox database name: "web-whisper-sandbox-db" (not "web-whisper-db")
- IndexedDB schema: Same as production schema (object stores: sessions, chunks, volume-profiles, snips, transcripts)
- Fixture chunk generation: Generate small MP3 blobs (1–4s each) using Web Audio API or pre-encoded fixture files
- Fixture volume profile: Mock peakDb values (e.g., [-50, -20, -45, -15, -55] for 5 chunks)
- Fixture snips: Mock snip boundaries (e.g., snip 0 = chunks 0–2, snip 1 = chunks 3–4)
- Optional capture-engine integration: Include capture-engine (in-memory mode), "Start Capture" button in write panel, "Stop Capture + Flush Chunks to Store" button writes captured chunks to sandbox DB
- Optional volume-analyzer integration: Include volume-analyzer (fixture or live-from-capture mode), "Compute via Volume-Analyzer" option reads chunks from sandbox DB, computes volume profile, writes to sandbox DB
- Retention policy: Sort sessions by createdAt asc, delete oldest (including cascade: chunks + volume-profile + snips + transcripts) until used <= cap
- Storage stats calculation: Sum chunk sizeBytes across all sessions (IndexedDB overhead not counted for simplicity; or use navigator.storage.estimate() if available)
