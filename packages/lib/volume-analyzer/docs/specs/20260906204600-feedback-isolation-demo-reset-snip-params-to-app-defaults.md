Spec Status: resolved
Spec Type: feedback
Created: 2026-09-06T20:46:00Z
Resolved: 2026-09-06T21:15:00Z
Product: packages/lib/volume-analyzer

# Feedback: Isolation Demo — Reset snip params to app defaults

## User Feedback

Dave exported a real PWA session (`ses_1788550979475_nxkjk4yv`, ~3m27s) and uploaded the zip into the volume-analyzer Isolation Demo. Manifest flags `hasSnips` / `hasTranscript` / `hasVolumeProfile` are true, but the zip contains only `manifest.json` + `chunks/*.mp3` (Phase 07-03 default). The demo then **re-proposes** snips with **remembered tuner values** that diverge from the PWA / `DEFAULT_SNIP_OPTIONS`, so he cannot reproduce the live BLT boundary repeats he sees in Session Detail Debug.

Live Debug UI (contiguous times, repeated boundary words):

- Snip #9 `1:55→2:11` ends with “BLT's.”
- Snip #10 `2:11→2:30` starts “BLT is cheese quesadilla”
- Snip #11 continues “cheese quesadillas”

He needs a one-click way to put the Isolation Demo back on the **same snip/noise-floor controls the PWA uses**, and to be told when saved demo params are not those defaults. Diagnosis only — do **not** change the snip algorithm.

## Current behavior (do not “fix” by changing proposal)

Isolation Demo (`isolation-demo/src/App.tsx` + `demoStore.ts`):

- Sliders: noise floor (manual dB vs **auto**), min snip, max snip, quiet-gap.
- `proposeSnipsFromProfile` is called with those slider values (`snipOptions`). Target / hangover / percentiles stay at `DEFAULT_SNIP_OPTIONS` and are not exposed.
- Tuner settings persist in IndexedDB `web-whisper-volume-analyzer-demo-db` (store `tuner`, key `snip-tuner`) via `loadTunerSettings` / `saveTunerSettings`. Dave described this as “localStorage-remembered”; the product issue is the same: **saved demo params survive reload and diverge from the PWA**.
- There is a **Reset** button (`handleReset`) that sets auto floor + min/max/gap to `DEFAULT_SNIP_OPTIONS`, but it also **clears** volume profile, proposed snips, playhead, and (in live mode) chunks. It is not labeled as matching the PWA, and archive upload does not warn that saved sliders ≠ app defaults.
- “Reset to auto noise floor” only flips `autoNoiseFloor`; it does not restore duration/gap sliders.

PWA / library defaults (`src/defaults.ts` `DEFAULT_SNIP_OPTIONS`):

| Control | App default |
| --- | --- |
| Noise floor | **Adaptive** (`quietThreshold` omitted; `computeAdaptiveQuietThresholdDb` / percentile floor). Not a fixed −40 dB line. |
| `minSnipDuration` | `5` s |
| `targetSnipDuration` | `10` s (not a slider; already hardcoded in the demo) |
| `maxSnipDuration` | `60` s |
| `minSilenceGapDuration` | `0.6` s |
| hangover / percentiles / multiplier | already the original constants; leave them |

`FALLBACK_QUIET_THRESHOLD_DB` (−40) is only for an explicit dB override. Matching app defaults means **auto noise floor on**, not “slider at −40”.

## Requested Outcome

Isolation Demo UX only. Do **not** change `proposeSnipsFromProfile` / `src/snips.ts` / `DEFAULT_SNIP_OPTIONS` values.

### A. Clear control: **Reset to app defaults**

Add a visible control labeled **Reset to app defaults** (sidebar, near the snip sliders — not buried).

On click it must:

1. Set **all** Isolation Demo snip / noise-floor controls to the PWA / original set:
   - `autoNoiseFloor = true` (adaptive; do not leave a stale manual dB override in `snipOptions`)
   - `minSnipDuration = DEFAULT_SNIP_OPTIONS.minSnipDuration`
   - `maxSnipDuration = DEFAULT_SNIP_OPTIONS.maxSnipDuration`
   - `minSilenceGapDuration = DEFAULT_SNIP_OPTIONS.minSilenceGapDuration`
   - Leave `targetSnipDuration` / hangover / percentiles as they already are (`DEFAULT_SNIP_OPTIONS`)
2. **Persist** that reset through the existing tuner store (`saveTunerSettings`) so a reload stays on app defaults.
3. If a volume profile is already computed, **recompute snips** with those defaults (existing `recomputeSnips` path). Do **not** wipe an uploaded archive or in-memory chunks just to reset sliders.
4. Do **not** reset histogram zoom / pan unless a later clamp is required.

The existing full **Reset** (clear analysis + live chunks) may stay. It is not a substitute: Dave needs defaults **without** throwing away the archive he just uploaded. Prefer keeping both, with copy that distinguishes them (e.g. Reset = clear session data; Reset to app defaults = sliders only).

### B. Banner / offer when saved params ≠ app defaults

On **session-archive upload** (after a successful `parseSessionArchive` + mapped chunks), and/or on the **first Compute Volume** after that upload:

- If current saved/applied tuner values are **not** app defaults, show a clear banner (or an equally obvious offer).
- Copy must say the saved Isolation Demo sliders differ from the PWA / `DEFAULT_SNIP_OPTIONS`, so recomputed snips will **not** match live cuts.
- One-click action on that banner runs the same **Reset to app defaults** (and persists it).
- Do **not** silently overwrite saved tuner values on upload. Dave may still want to experiment; he must see the divergence.

“≠ app defaults” means any of:

- `autoNoiseFloor === false`
- `minSnipDuration` ≠ `DEFAULT_SNIP_OPTIONS.minSnipDuration`
- `maxSnipDuration` ≠ `DEFAULT_SNIP_OPTIONS.maxSnipDuration`
- `minSilenceGapDuration` ≠ `DEFAULT_SNIP_OPTIONS.minSilenceGapDuration`

When auto is on, ignore the stored `quietThresholdDb` number (it is display-only after adaptive compute).

A small helper (demo-local is fine) such as `tunerMatchesAppDefaults(settings)` keeps the banner and the button honest. Cover it with a unit test.

### Isolation Demo only

`packages/lib/volume-analyzer/isolation-demo/**` (App, demoStore, styles, small helpers/tests). Do not edit `src/snips.ts` / defaults except to **import** `DEFAULT_SNIP_OPTIONS` (already imported).

## Notes For Phase 07

- Cursor Cloud Agent only — never Codex.
- Do **not** change the snip algorithm.
- Publish via `make build` so `docs/isolation-demos/volume-analyzer/` updates on Pages.
- Update this spec with a Resolution section when implementation ships.
- Do **not** mark this spec resolved from a specs-only commit.

## Out of scope

- Changing `proposeSnipsFromProfile` / hangover / percentiles / defaults to “fix” BLT repeats
- Session-store archive format (Spec B / `20260906204601`)
- Overlap / n-gram doctor (Spec C / `20260906204602`)
- PWA session-detail histogram or PWA tuner UI
- Silently auto-resetting sliders with no user-visible offer

## Resolution Criteria

Mark this spec resolved when:

- [x] **Reset to app defaults** sets auto noise floor + min/max/gap to `DEFAULT_SNIP_OPTIONS` and persists that reset
- [x] Resetting defaults does not delete an uploaded archive / in-memory chunks
- [x] Archive upload (or first compute after upload) shows a banner/offer when saved params ≠ app defaults
- [x] Banner action persists the same defaults
- [x] `proposeSnipsFromProfile` / `src/snips.ts` / default constants unchanged
- [x] `make build` published Isolation Demo artifacts
- [x] Spec updated with a Resolution section documenting what shipped

## Resolution

**Resolved**: 2026-09-06  
**Package**: `packages/lib/volume-analyzer` Isolation Demo only  
**Algorithm**: unchanged — `src/snips.ts` / `proposeSnipsFromProfile` / `DEFAULT_SNIP_OPTIONS` were not edited.

### What landed

- **Reset to app defaults** in `isolation-demo/src/App.tsx` (sidebar, under the min/max/quiet-gap sliders). Click sets `autoNoiseFloor = true` and min/max/gap to `DEFAULT_SNIP_OPTIONS`, then persists via `saveTunerSettings` (`web-whisper-volume-analyzer-demo-db` / store `tuner`). If a volume profile is already computed, snips recompute on the existing `recomputeSnips` path. Uploaded archive chunks and in-memory live/fixture chunks stay. Histogram zoom / pan is not reset.
- Distinct from the existing **Reset** (clear analysis + live chunks). Copy under each control says which is which.
- After a successful session-archive upload (mapped chunks > 0), and again on Compute Volume in archive mode, a banner offers the same reset when saved sliders ≠ app defaults. Copy states that recomputed snips will not match live Session Detail cuts. The banner action persists the same defaults. Saved sliders are never silently overwritten. **Keep current sliders** dismisses the offer so Dave can still experiment.
- Demo-local helper `tunerMatchesAppDefaults` (`isolation-demo/src/tunerDefaults.ts`): auto on + min/max/gap match defaults; stored `quietThresholdDb` is ignored when auto is on.

### How to repro

1. Open the Isolation Demo (`docs/isolation-demos/volume-analyzer/` on Pages, or isolation-demo Vite).
2. Drag min / max / quiet-gap and/or the noise-floor slider off PWA defaults. **Reset to app defaults** should restore adaptive floor + 5s / 60s / 0.6s and stay that way after reload.
3. With sliders still diverged, **Upload session archive**. After playable chunks map, the orange banner should appear. **Reset to app defaults** on the banner restores and persists; archive chunk count stays.
4. Confirm the existing **Reset** still clears analysis (and live chunks), and that fixture/archive audio is not wiped by the defaults-only control.

### Tests / publish

- `isolation-demo/src/tunerDefaults.test.ts` — match / diverge / ignore stored dB when auto.
- `make build` published `docs/isolation-demos/volume-analyzer/`.
