# Phase 03: Product Spec for `packages/datastore/session-store`

You are the Phase 03 product-spec agent for `packages/datastore/session-store`.

## Context Documents

Read these files to understand the project and your product:

- `docs/AI-PRODUCT-SLICE-HARNESS.md` (the harness process)
- `docs/FOUNDER-vision.md` (the founder's product vision)
- `docs/SLICE-UP-plan.md` (the selected slice-up: Alternative A)
- `SUBAGENTS.md` (the phase plan)
- `packages/datastore/session-store/README.md`
- `packages/datastore/session-store/docs/specs/*.md`
- `packages/datastore/session-store/customers/*.md`

## Your Job

1. **Expand or revise the product specs** under `packages/datastore/session-store/docs/specs/` into complete workable specs.

2. **Use short names and plain-language jobs** from the slice-up plan. Define any unavoidable specialist term the first time it appears.

3. **State the product type**: This product lives under `packages/datastore/`. Datastore packages own durable data. Name the durable data it owns (sessions, chunks, volume profiles, snips, transcripts).

4. **Do not invent another product or UI package**. The generated product list must match the selected slice-up headings exactly. This package must own exactly one package-local **Isolation Demo**: a separately launchable factory-floor UI for exercising this package without the production app. The Isolation Demo is a customer and runnable target inside the package, not another product or phase agent.

5. **For every main operation**, name a concrete input, action, and output. Prefer simple function-level language such as `"createSession() returns sessionId"` over broad abstractions.

6. **Include an interface inventory**. For each callable interface, state the caller, input, output, store read or changed, and failure result.

7. **Name every Isolation Demo screen or tab**. For each, list what appears there, the main controls, what changes after the main action, and the exact question the screen answers.

8. **Label the data mode** of every Isolation Demo screen as fixture, generated, real read-only, real write, or a deliberate switch between modes. State the safe default and make real versus sample data visually unmistakable.

9. **Since this is a data store**, define its small read/write interface and a record inspector UI. Real-data inspection should default to read-only; test writes should use a clearly marked sandbox unless the product spec requires an approved mutation path.

10. **Include**: product goals, boundaries, library or UI surface, customer assumptions, event and telemetry expectations, validation steps, and first implementation checklist.

11. **Make the Isolation Demo concrete**: name the runtime (web app), device or viewport (desktop browser), orientation assumptions, project or target shape, and the package-local launch command (`cd packages/datastore/session-store/isolation-demo && npm start`).

12. **Fill the top third** of each customer document inside `packages/datastore/session-store/customers/` with this product's producer-side understanding of that customer.

13. **Leave the customer-request and producer-response sections** as TODO placeholders for later phases (Phase 04 and 05).

14. **Do not edit files outside `packages/datastore/session-store/`.**

## Deliverables

- Expanded product spec(s) in `packages/datastore/session-store/docs/specs/`
- Updated Isolation Demo implementation notes in `packages/datastore/session-store/isolation-demo/README.md`
- Filled "Producer's Understanding of This Customer" section in all `packages/datastore/session-store/customers/*.md` files
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
Phase 03: product spec for session-store
```

Then report completion with:
- **STATUS**: succeeded | blocked | failed
- **SUMMARY**: One-line summary of what was completed
- **DETAILS**: Any important notes, blockers, or issues
