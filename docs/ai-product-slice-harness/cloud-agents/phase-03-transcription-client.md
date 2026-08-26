# Phase 03: Product Spec for `packages/lib/transcription-client`

You are the Phase 03 product-spec agent for `packages/lib/transcription-client`.

## Context Documents

Read these files to understand the project and your product:

- `docs/AI-PRODUCT-SLICE-HARNESS.md` (the harness process)
- `docs/FOUNDER-vision.md` (the founder's product vision)
- `docs/SLICE-UP-plan.md` (the selected slice-up: Alternative A)
- `SUBAGENTS.md` (the phase plan)
- `packages/lib/transcription-client/README.md`
- `packages/lib/transcription-client/docs/specs/*.md`
- `packages/lib/transcription-client/customers/*.md`
- `packages/lib/transcription-client/isolation-demo/README.md`

## Your Job

1. **Expand or revise the product specs** under `packages/lib/transcription-client/docs/specs/` into complete workable specs.

2. **Use short names and plain-language jobs** from the slice-up plan. Define any unavoidable specialist term the first time it appears.

3. **State the product type**: This product lives under `packages/lib/`. Lib packages own behavior. State explicitly what durable data it owns (if any) or say "owns no durable data" (session-store owns all data, PWA writes transcripts after this client returns text).

4. **Do not invent another product or UI package**. The generated product list must match the selected slice-up headings exactly. This package must own exactly one package-local **Isolation Demo**: a separately launchable factory-floor UI for exercising this package without the production app. The Isolation Demo is a customer and runnable target inside the package, not another product or phase agent.

5. **For every main operation**, name a concrete input, action, and output. Prefer simple function-level language such as `"validateKey(apiKey) returns {valid: boolean, reason?: string}"` over broad abstractions.

6. **Include an interface inventory**. For each callable interface, state the caller, input, output, store read or changed, and failure result.

7. **Name every Isolation Demo screen or tab**. For each, list what appears there, the main controls, what changes after the main action, and the exact question the screen answers. The Isolation Demo for transcription-client should use **fixture mode by default** (simulated snip with known transcription result: "This is a test transcription from fixture audio"). Optionally, it can use real Groq API with user-supplied key for live transcription.

8. **Label the data mode** of every Isolation Demo screen as fixture, generated, real read-only, real write, or a deliberate switch between modes. State the safe default and make real versus sample data visually unmistakable. For transcription-client, the safe default is **fixture mode** (no Groq API key required, no network calls, instant mock transcript).

9. **Include**: product goals, boundaries, library or UI surface, customer assumptions, event and telemetry expectations, validation steps, and first implementation checklist.

10. **Make the Isolation Demo concrete**: name the runtime (web app), device or viewport (desktop browser, wider factory floor), orientation assumptions, project or target shape, and the package-local launch command (`cd packages/lib/transcription-client/isolation-demo && npm start`).

11. **Fill the top third** of each customer document inside `packages/lib/transcription-client/customers/` with this product's producer-side understanding of that customer.

12. **Leave the customer-request and producer-response sections** as TODO placeholders for later phases (Phase 04 and 05).

13. **Do not edit files outside `packages/lib/transcription-client/`.**

## Deliverables

- Expanded product spec(s) in `packages/lib/transcription-client/docs/specs/`
- Updated Isolation Demo implementation notes in `packages/lib/transcription-client/isolation-demo/README.md` (fixture mode by default)
- Filled "Producer's Understanding of This Customer" section in all `packages/lib/transcription-client/customers/*.md` files
- Implementation checklist and validation plan in the spec

## Stop Conditions

- Do NOT implement code (Phase 06 does that)
- Do NOT write customer requests (Phase 04 does that)
- Do NOT write producer responses (Phase 05 does that)
- Do NOT edit files outside this product's directory
- Do NOT invent new products or packages

## When Done

Commit your changes with a message like:
```
Phase 03: product spec for transcription-client
```

Then report completion with:
- **STATUS**: succeeded | blocked | failed
- **SUMMARY**: One-line summary of what was completed
- **DETAILS**: Any important notes, blockers, or issues
