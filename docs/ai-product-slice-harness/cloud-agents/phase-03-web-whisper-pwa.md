# Phase 03: Product Spec for `apps/web-whisper-pwa`

You are the Phase 03 product-spec agent for `apps/web-whisper-pwa`.

## Context Documents

Read these files to understand the project and your product:

- `docs/AI-PRODUCT-SLICE-HARNESS.md` (the harness process)
- `docs/FOUNDER-vision.md` (the founder's product vision)
- `docs/SLICE-UP-plan.md` (the selected slice-up: Alternative A)
- `docs/VISUAL-BASELINE.md` (the visual identity to preserve)
- `SUBAGENTS.md` (the phase plan)
- `apps/web-whisper-pwa/README.md`
- `apps/web-whisper-pwa/docs/specs/*.md`
- `apps/web-whisper-pwa/customers/README.md`

## Your Job

1. **Expand or revise the product specs** under `apps/web-whisper-pwa/docs/specs/` into complete workable specs.

2. **Use short names and plain-language jobs** from the slice-up plan. Define any unavoidable specialist term the first time it appears.

3. **State the product type**: This product lives under `apps/`. Apps are runnable. The PWA owns navigation, UI screens, platform permissions (microphone), settings persistence, and orchestration of the lib packages and session-store. State explicitly what durable data it owns (if any; likely none beyond settings in localStorage, since session-store owns all session/chunk/snip/transcript data).

4. **Do not invent another product or UI package**. The generated product list must match the selected slice-up headings exactly. The PWA is an app, not a package. Apps are already directly runnable and do not automatically need a separate Isolation Demo. The app itself is the product surface the founder walks.

5. **For every main screen and orchestration flow**, name a concrete input, action, and output. Prefer simple function-level language such as `"user taps 'Start Recording' → PWA calls createSession() → calls startCapture(sessionId) → audio recording begins"` over broad abstractions.

6. **Include an interface inventory** for how the PWA calls each lib package and session-store. For each integration point, state the caller (PWA), the called interface (e.g., `startCapture`, `analyzeVolume`, `playSession`), input, output, and how the PWA uses the result.

7. **Name every PWA screen**. For each, list what appears there, the main controls, what changes after the main action, and the exact question the screen answers. Preserve the visual design from `docs/VISUAL-BASELINE.md`: dark navy-black background `#0a0f18`, lighter cards `#111a26`, 16–20px radius, cyan/teal accent `#22d3ee`, bold "Web Whisper" header, DATA storage chip, Settings button, optional 🐞 when developer mode is on.

8. **Include product goals, boundaries, UI surface, customer assumptions (the end user: iPhone user who needs to record, play back, and transcribe audio), orchestration flows (recording flow, transcription flow, playback flow), validation steps, and first implementation checklist.**

9. **Make the PWA runtime concrete**: name the runtime (Progressive Web App for iPhone), device or viewport (iPhone, Add to Home Screen), target device (iPhone PWA), and the launch command (`npm start` or equivalent).

10. **Fill the top third** of each customer document inside `apps/web-whisper-pwa/customers/` (if any package-to-package customer docs exist; if none, skip this step since the PWA's only customer is the end user, documented in the README).

11. **Leave any customer-request and producer-response sections** as TODO placeholders for later phases (Phase 04 and 05).

12. **Do not edit files outside `apps/web-whisper-pwa/`.**

## Deliverables

- Expanded product spec(s) in `apps/web-whisper-pwa/docs/specs/`
- Detailed screen-by-screen UI spec (components, layout, interactions) preserving visual baseline
- Orchestration flows (recording flow, transcription flow, playback flow)
- Settings persistence strategy (localStorage vs IndexedDB settings table)
- Developer mode gating and panel rendering
- Error handling and user feedback
- Visual design implementation notes (referencing visual baseline)
- Validation plan (manual walkthrough checklist)

## Stop Conditions

- Do NOT implement code (Phase 06 does that)
- Do NOT write customer requests (Phase 04 does that)
- Do NOT write producer responses (Phase 05 does that)
- Do NOT edit files outside this product's directory
- Do NOT invent new products or packages

## When Done

Commit your changes with a message like:
```
Phase 03: product spec for web-whisper-pwa
```

Then report completion with:
- **STATUS**: succeeded | blocked | failed
- **SUMMARY**: One-line summary of what was completed
- **DETAILS**: Any important notes, blockers, or issues
