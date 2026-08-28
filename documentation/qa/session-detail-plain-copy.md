# QA: Plain concatenated transcript copy

**Date:** 2026-08-28  
**Branch:** `cursor/plain-transcript-copy-5a85`  
**Viewport:** iPhone 12/13/14 (390×844 CSS px → 1170×2532 screenshots)

## What was verified

1. **Plain Transcript tab text**
   - Opened `?screenshot=session-detail` (fixture session with 3 snips).
   - Textarea value is one continuous prose wall joined by spaces.
   - No `[0:00]` / `[m:ss]` bracket time headers.
   - No snip markers / failed-snip walls.
   - No blank-line walls between snips.

2. **Selection + Copy**
   - Textarea auto-selects on open.
   - Copy button present; click succeeds.

3. **Debug still per-snip**
   - Debug tab lists snips with durations and `0:00 → 0:12` ranges.
   - Returning to Transcript keeps the plain concatenated text.

4. **Untouched surfaces**
   - Play + seek + volume still visible at rest.
   - Live recording / Stop / storage purge / isolation demos not exercised as part of this change.

## Proof shot (1170×2532)

- `documentation/qa/session-detail-plain-copy.png` — Transcript tab with selected plain prose, Copy button, no time brackets

## Example textarea value

```
Okay so the first thing I wanted to talk through is the grocery list because if we wait until tonight the store will be packed. We need milk, eggs, sourdough, the good butter not the cheap one, and those frozen blueberries she actually eats. Then after that I have to call the dentist and move Thursday because the recital is at four and parking downtown is a mess.
```
