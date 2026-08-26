# AI Product Slice Harness

This document describes the way we build projects with AI assistance: start from the business value, use AI to turn the vision into independently valuable products, and then assemble those products into the final application.

The harness is a collaboration plan. Humans provide the founder vision, make product-boundary choices, and resolve judgment calls. AI agents create planning artifacts, scaffold the selected products, run product-specific planning passes, and later build the pieces.

## Project Bootstrap Sequence

Every new project should be able to identify which phase it is in.

### Phase 01: Harness And Founder Vision

Human:

- From the project root, install the harness:
  `path/to/ai-product-slice-harness/bin/install`
  (or `bin/install /path/to/your-project` from the harness repo).
- That copies `docs/AI-PRODUCT-SLICE-HARNESS.md`, the helper folder
  `docs/ai-product-slice-harness/`, phase utilities under `subagents/`,
  `Makefile.harness`, and related scripts into the project.
- Edit `docs/ai-product-slice-harness/config.env` if your founder-vision or
  slice-up filenames will differ from the defaults.
- Dictate or write the founder vision. The human does not need to solve product
  boundaries yet.
- Ask AI to capture the vision and create the initial project files.

AI:

- Create the root `README.md`.
- Capture the founder vision in `docs/` (default: `docs/FOUNDER-vision.md`).
- Generate the initial slice-up plan (default: `docs/SLICE-UP-plan.md`).
- Point `docs/ai-product-slice-harness/config.env` at those files if the names
  differ from the defaults.

Phase output:

- Root `README.md`.
- Founder vision document.
- Initial slice-up plan with alternate product-boundary philosophies.
- Installed harness helpers and Makefile targets.

### Phase 02: Slice-Up Selection And Scaffold

Phase 02 is a conversational IDE-agent phase, not a background sub-agent shell
phase. If the human asks to "run Phase 02 agents," clarify that Phase 02 is
completed by the current IDE agent and the first background fan-out phase is
Phase 03.

Human:

- Choose the selected slice-up philosophy.
- Tell AI to proceed with that choice.

AI:

- Record the selected slice-up philosophy at the top of the slice-up plan.
- As the current IDE agent, perform the one-time architecture setup across all
  selected products. This is the last planned phase where the current IDE agent
  owns multiple products at once.
- For each selected piece, create its exact `apps/<name>`,
  `packages/ui/<name>`, `packages/lib/<name>`, or
  `packages/datastore/<name>` folder with `README.md`, `docs/specs/`, and
  `customers/`.
- For each selected product, create a timestamped stub spec under `docs/specs/`
  that briefly names the product goal, expected interfaces, and—for every
  package—the package-local Isolation Demo.
- For each known consumer-to-producer relationship, create a placeholder customer document in the producing package's `customers/` folder.
- For every selected package under `packages/`, create
  `isolation-demo/README.md` as the placeholder for its package-local runnable
  target and `customers/00-isolation-demo.md` as the standing human customer that
  asks to operate the package by itself. Neither is another product or package.
- Create the root sub-agent phase plan (`SUBAGENTS.md`).
- Generate Phase 03–07 shell scripts with
  `bash docs/ai-product-slice-harness/write-phase-scripts.sh` (see that script's
  `--help`), or write them by hand using the examples under
  `subagents/examples/`. Re-architecture phase scripts are already installed.

Phase output:

- Selected slice-up recorded.
- Monorepo product scaffold.
- Stub package specs.
- Placeholder customer documents.
- Root sub-agent plan.
- Runnable Phase 03, Phase 04, Phase 05, Phase 06, and Phase 07 shell scripts.
- A Git checkpoint before package-specific planning begins.

After reviewing the scaffold, the normal handoff is one command:

```sh
HARNESS_COMMIT_DIRTY=1 make phase-2-5
```

The explicit flag means: "I reviewed every current local change and want it in
the Phase 02 checkpoint." The command commits that checkpoint, runs all of Phase
03, then Phase 04, then Phase 05, and creates a separate commit after each
successful round. It stops immediately on a blocked or failed round. If Phase 02
was already committed, use `make phase-3-5`; that form requires a clean
worktree.

### Phase 03: Product Specs

Phase 03 is the first shell-run background-agent phase.

Human:

- Approve the Phase 02 scaffold and start the combined Phase 02–05 or 03–05
  command.

AI:

- Run one product-spec agent per selected app/package heading.
- Each agent works only on its own product.
- Each agent fleshes out its package spec.
- Each agent fills the top third of its customer documents with the producer's understanding of each customer.
- Agents must not mark package implementation specs `resolved` in this phase.
  Phase 03 completes the planning detail, but the work represented by an
  initial product spec is not resolved until implementation is built and
  validated.

Phase output:

- Expanded initial product specs that remain `Spec Status: unresolved` until
  implementation completes.
- Producer-understanding sections in customer documents.
- Logs and status files for each product agent.

### Phase 04: Customer Requests

Human:

- No routine action. The combined planning command starts this round after every
  Phase 03 agent succeeds and the Phase 03 commit is created.

AI:

- Run one customer-request agent per consumer-to-producer relationship.
- Run one Isolation Demo customer-request agent for every selected package.
- Each consumer fills the middle third of the producer's customer document with its requested needs.

Phase output:

- Customer-request sections in producer customer documents, including exactly
  one `00-isolation-demo.md` request per package.
- Logs and status files for each relationship agent.

### Phase 05: Producer Responses

Human:

- No routine action. The combined planning command starts this round after every
  Phase 04 relationship succeeds and the Phase 04 commit is created.

AI:

- Run one producer-response agent per producing package.
- Each producer fills the bottom third of its customer documents.
- Each producer updates its specs to meet those customer requests.
- Producer-response agents must not mark implementation specs `resolved`.
  Phase 05 finalizes the planned producer contract; Phase 06 is still
  responsible for building and resolving the actual implementation work.

Phase output:

- Producer-response sections in customer documents.
- Updated package specs that remain `Spec Status: unresolved` until Phase 06
  implementation completes them.
- Logs and status files for each producer agent.

### Phase 06: First Implementation

Human:

- Review the separate Phase 02, 03, 04, and 05 commits and the completed specs
  and producer responses.
- Decide that the package plans are ready for first implementation.
- When ready, run the implementation phase shell script.

AI:

- Run implementation agents in parallel worktrees where possible.
- Each implementation agent works on one package or one clearly isolated work item.
- Each package implementation agent builds the package MVP and its package-local
  Isolation Demo from the completed spec.
- For implementation, prefer dependency order when downstream products need upstream package outputs. Build lower-level producers first, then dependent packages, then the final application. Parallel implementation is still useful for independent leaves, but the script should make dependency ordering explicit.
- When implementation and validation are complete for a spec, the Phase 06 agent
  should mark that spec `Spec Status: resolved` and add a Resolution section.
  If the implementation is blocked, leave the spec unresolved and add a Blocked
  section.

Phase output:

- Package MVPs.
- One separately launchable Isolation Demo per package.
- Tests or validation results.
- Logs and status files for each implementation agent.

### Phase 07: Iterate

Human:

- Review one or more package Isolation Demos or the final app.
- Turn feedback into timestamped work-order specs under the relevant product's `docs/specs/` folder.
- Run the iteration phase after the desired feedback specs are written.

AI:

- Detect unresolved specs by reading `Spec Status: unresolved`.
- Run specs inside the same product sequentially by timestamped filename.
- Run unrelated product packages in parallel where possible, but never run more
  than one Phase 07 agent for the same product at the same time.
- Stop processing later specs in a product if an earlier spec is blocked or
  failed, because later specs may depend on the state produced by earlier specs.
- Run the final application last so it can integrate package-level changes.
- Mark each work-order spec resolved or leave it unresolved with a blocked section.
- Offer a dry-run command that reports unresolved specs and run order without launching agents.
- Run a final iteration-notes pass that summarizes the completed Phase 07 run
  into a durable project version history.
- When a product finishes work that creates a new or changed expectation for one
  of its customers or consumers, write a downstream request spec in the
  receiving product's `docs/specs/` inbox rather than silently editing that
  product's implementation.

Phase output:

- Updated packages or app.
- Resolved, blocked, or still-unresolved feedback specs.
- Any downstream request specs created for consumer products that need to
  reassess integration after a producer change.
- Logs, result files, and status files for each iteration agent.
- A version-history entry summarizing the iteration run, completed specs,
  validation, and known limits.

### Later Phases: Review And Integration

Human and AI:

- Review product outputs.
- Resolve blockers.
- Integrate packages into the final application.
- Iterate until the final application is assembled from proven products.

### Re-Architecture Phases: Midstream Product Boundary Changes

Human:

- Call out when the original slice-up no longer matches the product that is
  emerging.
- Dictate the pain points, duplicated surfaces, wrong ownership boundaries, and
  the desired new product shape.
- Choose whether the re-architecture is exploratory, selected, or ready for
  scaffold.

AI:

- Create a dated re-architecture plan under `docs/re-architectures/`.
- Preserve the original slice-up plan as design history instead of rewriting it
  in place.
- Propose new product boundaries, dependencies, customer relationships,
  migration risks, and strangler steps.
- Re-run the relevant harness phases for only the changed architecture slice:
  new packages, materially changed packages, and changed relationships.
- Create new package specs/customer docs before implementation agents rewrite
  production surfaces.

Phase output:

- Dated re-architecture plan.
- Selected re-slice or explicit alternatives.
- New or updated package scaffold plan.
- Re-architecture phase scripts or instructions.
- Strangler migration plan from old package/app ownership to new ownership.

The early phases are intentionally documentation-heavy. They establish the founder intent, selected product boundaries, package responsibilities, customer relationships, and sub-agent plan before implementation agents start building.

After the one-time scaffolding pass, agents should normally be scoped to one product, one customer relationship, or one worktree. This keeps each agent acting like a member of a specific product team instead of rewriting the whole company at once.

## Start With The Founder Value

Every project begins with the value the founder or CEO cares about. This is the company-level vision: the reason the product should exist, the outcome it should create, and the end value that justifies the work.

At this level, the founder does not care about implementation details. They care that the final system realizes the vision. The job of the team is to take that broad value and turn it into working pieces that can be built, demonstrated, evaluated, and eventually assembled.

## Capture The Founder Perspective

Before breaking work into products, capture the founder or CEO perspective in a durable document under `docs/`. This document should preserve the raw strategic intent: the problem, the desired feeling of the product, the primary user, the motivating examples, and the behaviors that matter most.

The founder perspective document is not a requirements spec. It is the source material the architect uses to reason from. It should keep the important language, metaphors, and product instincts intact so later planning does not lose the original point of the work.

For each founder vision, capture:

- The user and customer the final product serves.
- The job the product should make easier.
- The experience the founder wants the user to feel.
- The core flows that define success.
- The examples that make the product concrete.
- The future possibilities that should be remembered but not overbuilt now.

## Break The Company Into Products

Inside the company-level vision are multiple jobs that work together to create
the final output. Some become apps, some reusable packages, and some explicit
data stores. Do not assume every technical handoff should become a separate
founder-facing product.

Each reusable package should have one understandable reason to exist and a
direct way to prove its input and output. That does not require turning every
package into a production app or exposing its internal machinery in the final
navigation.

The same metaphor applies to software packages and libraries. Each package should be able to prove its independence. It should create value by itself, even if its most important long-term role is being imported into another product.

## Create A Slice-Up Plan Before Projects

After the founder perspective is captured, create a slice-up plan before creating separate project documents or package directories. The slice-up plan is the architect's proposal for how the vision could become independently valuable products.

The plan must make the system easier to explain, not merely give technical
boundaries impressive names. If the architect cannot describe a boundary with a
short verb, a concrete input, and a concrete output, the boundary is not ready.
Say that the split is unclear and keep working instead of hiding the uncertainty
behind terms such as "shared normalization," "semantic interpretation,"
"orchestration," or "field-level provenance."

### First write the plain-language job map

Before proposing products, list the jobs the system must perform in the order a
person would explain them. Use ordinary verbs. For example:

- find the play links on a publisher's catalog pages;
- read what one play page says;
- turn the publisher's wording into the fields the database uses;
- flag wording that cannot be interpreted safely;
- save the downloaded source page and the database record;
- browse and search accepted plays.

For each job, show one example input and one example output. When a job contains
two independently testable actions, split it. When two proposed products both
appear to perform the same job, stop and resolve that overlap before scaffolding.

Add a short project lexicon near the top. Give stable, plain names to the main
things and operations so later documents can say exactly what calls what. Prefer
names such as `findPlayLinks`, `readPlayPage`, `interpretCast`, `saveSourcePage`,
and `searchPlays`. These are planning names, not frozen implementation APIs.

Names must come from the founder's domain or describe the literal contents.
Avoid generic architecture words such as "evidence," "trust," "registry,"
"orchestration," and "provenance" unless the founder already uses and
understands that word. For example, prefer `Source Store` when the thing holds
downloaded publisher pages, found URLs, scan progress, and source wording. If a
name requires a paragraph before a founder can guess what is inside, rename it.

### Classify every proposed piece

Use only two top-level monorepo kinds:

```text
apps/
packages/
  ui/
  lib/
  datastore/
```

- **`apps/`:** substantial runnable products. The production app owns navigation
  and the user's mental model. A backend handoff or a collection of debug routes
  is not automatically a separate app.
- **`packages/ui/`:** substantial, independently valuable UI systems. Use this
  only when the UI itself is a major going concern with complex behavior,
  multiple consumers, and enough scope to justify its own product agent. Do not
  extract ordinary screens, forms, search pages, inspectors, or components just
  because this folder category exists.
- **`packages/lib/`:** reusable behavior and the main functions that perform
  work. A lib package owns no durable production data.
- **`packages/datastore/`:** durable information with one named authority,
  lifecycle, and read/write contract. A cache, search index, or exported version
  must be called a derived copy when it is not the authority.

“Package” remains the generic term. UI, lib, and datastore are package
categories, not additional top-level concepts. Every proposed piece must include
its exact path so `packages/foo` does not hide which category it belongs to.

Every selected app and package must have a peer-level major heading in each
alternative. The heading must carry the full boundary, interfaces, screens, data
mode, and finished-picture role. A bullet nested under another package cannot
quietly become a generated product, customer-doc owner, or phase agent.

Before Phase 02, print the exact count: for example, "one app, four lib packages,
zero UI packages, and two datastore packages—seven Phase 03 agents." The
`--product` list passed to `write-phase-scripts.sh` must match those headings
one-for-one. Adding a product that the founder saw only as a supporting bullet
is a slice-up error and requires another decision checkpoint.

For each datastore package, name exactly what it keeps, who writes it, who reads
it, and what it does not own. For every lib and UI package, say explicitly that
it owns no durable data. Never let folder placement or generated files imply
data ownership silently.

Isolation Demos do not imply UI packages or another shared playground app. Each
demo is a runnable target or example inside the package it exercises. Create a
separate UI package or app only when it meets the same substantial-team test and
appears as its own fully described major heading.

### Slice as though staffing long-lived internal teams

Each selected package is a major company division with its own backlog,
maintenance burden, customers, and continuing reason to exist. Before creating
a package, ask: **Would we hire and retain a team to own this area?**

A credible package normally has:

- a durable business or technical responsibility, not one page or component;
- several related capabilities that change together;
- meaningful interfaces used by at least one production customer;
- an ongoing roadmap, debugging surface, and maintenance lifecycle;
- enough independent value that a team can improve it without loading the
  entire final application into its head;
- exactly one package-local Isolation Demo through which humans can operate and
  understand that package alone.

Do not create a package for a confirmation modal, edit form, route, search box,
store inspector screen, or other task that would not justify a standing team.
Keep those inside the app or owning package. The same bar applies to UI
packages: only a substantial UI system with its own behavior, multiple uses,
and ongoing product lifecycle should become a package.

The goal is usually two to six major packages, adjusted only when the founder can
clearly defend a different count. Fewer coherent teams are better than a large
set of tiny agents that each understand only a fragment.

A slice alternative is invalid if its major headings, Phase 03 product list, and
imagined team roster differ. They are three views of the same decision.

### Every package has exactly one Isolation Demo

An **Isolation Demo** is the package factory floor: a separately launchable,
package-local UI for playing with every primary interface without launching or
depending on the production app. It shows inputs, outputs, intermediate state,
events, failure behavior, and explanations with fixtures or clearly labeled
real data.

The Isolation Demo:

- is a standing founder/developer customer of the package;
- is documented at `customers/00-isolation-demo.md`, sorted before package customers;
- uses the same public interfaces promised to production customers;
- lives inside the package as a runnable target or example;
- is built and maintained by the same package team;
- is never another app/package heading or Phase 03 product agent.

Apps are already directly runnable and do not automatically need an Isolation
Demo. A selected UI package still does: its demo renders that UI system alone
with controllable sample states and interactions.

### Give every piece an interface inventory

The slice-up plan must make each proposed app and package concrete
enough that the next agent cannot replace clarity with a generic dashboard.
Every piece gets a short interface inventory containing:

1. **Boundary:** one sentence saying what it does and one sentence saying what
   the neighboring piece does instead.
2. **Main callable interfaces:** the small set of named operations that make the
   piece useful. Show an example function-style name, input, output, caller, and
   store read or changed. These are planning contracts, not final syntax.
3. **Normal product screens:** for an app or selected UI package, name each primary
   screen, what appears there, the main action, and which real store or package
   supplies it.
4. **Isolation Demo:** for each package, name its package-local runnable target,
   screens or tabs, controls, what appears before and after each action, launch
   command, and the exact question it answers. The demo is not another selected
   product.
5. **Data mode:** label every playground screen as fixture, generated, real
   read-only, real write, or a deliberate choice between them. State the safe
   default. Never leave it unclear whether a demonstration is showing six fake
   records or the real retained catalog.
6. **Secondary tools:** put settings, raw events, hashes, versions, timing, and
   debug logs in a clearly secondary screen or disclosure. Name it, but do not
   let it substitute for the main input and output.

A datastore package Isolation Demo includes a store inspector. Its primary interfaces
are ordinary reads and writes such as `savePage`, `getRun`, `listClaims`,
`savePlay`, or `listReviewQueue`. Its inspector should show the actual records,
relationships, and write history in plain language. Real-data mode should
normally be read-only; mutations should go through the package that owns the
business rule or through an explicitly marked sandbox.

Do not accept phrases such as "operator workbench," "debug view," or "shows
telemetry" as an interface description. Name the screen, its controls, its data
source, and what the person sees after pressing the main button.

### Develop at least two real alternatives

The first version must include at least two genuinely developed breakdowns.
Do not write one recommendation and a paragraph of token alternatives. Give
each alternative the same basic treatment:

- its apps and packages, with every package categorized under `ui`, `lib`, or
  `datastore`;
- the plain jobs assigned to each piece;
- simple operation names, inputs, and outputs;
- who calls whom;
- an end-to-end example using one concrete record;
- what the real user sees on the first screen;
- the interface inventory and data mode for every piece;
- what each package Isolation Demo proves by itself;
- the finished-picture walkthrough;
- strengths, risks, and the reason someone might honestly choose it.

A useful alternative changes a meaningful boundary: for example, grouping work
by user journey versus grouping source-specific adapters separately. Renaming
the same boxes is not an alternative.

### End every alternative with the finished picture

After describing boundaries and interfaces, close each alternative with a short
section titled **"When this is built, this is what you get."** Write it from the
founder/operator's future point of view, as though the first useful version now
exists.

The section must say, in simple order:

1. What real starting data, customer, device, source, or scenario is working in
   the first useful version.
2. Which app the person opens and exactly what appears first.
3. The ordinary actions they take—start, continue, add, review, search, export,
   or whatever verbs fit the domain.
4. Which UI, lib, and datastore packages perform each important action, without
   turning the walkthrough into implementation jargon.
5. Where any AI-assisted judgment or Composite Agentic Gate actually runs, what
   it may propose, what independently checks it, and where an unsupported result
   stops for human attention.
6. How the person adds the second real source/input/customer/device after the
   first one works. Show a representative UI action, command, file path, or
   function shape when that makes the extension concrete.
7. The visible end state the founder receives—for example, several loaded
   sources feeding one searchable catalog—rather than merely saying the
   packages are integrated.

This is not a project schedule. It is the operating story of the completed
slice: "go here, do this, see that, resolve this, and end up with this useful
thing." A founder should be able to read only this closing section and decide
whether the alternative produces the product they meant.

Commands, routes, and function names in this section may be planning shapes
rather than frozen implementation syntax, but label them that way. Do not omit
the extension story. A slice that works only for one hard-coded fixture has not
painted a credible finished picture.

Keep the rejected alternatives in the slice-up plan. They are useful design memory. As the team chooses one direction, update the document to record the selected approach and the reasons for choosing it.

Do not create all product project documents until the slice-up plan has been reviewed and a direction has been selected.

Each slice-up philosophy should include:

- The principle it optimizes for.
- The exact app and package paths it creates.
- The exact job and data ownership of every piece.
- The short operations each customer calls and the data passed between them.
- The package-local Isolation Demo for each candidate package.
- The external events each product exposes to consumers.
- The internal telemetry or debug logs each product makes visible.
- The way the products assemble into the final application.
- The strengths, risks, and tradeoffs of that breakdown.
- The concrete walkthrough results a founder/developer would need in order to
  choose or reject it.

### Walk the data, then walk the user experience

Every alternative needs two separate walkthroughs.

The data walkthrough follows one concrete item from its first input to its saved
record and final use. At every step say:

1. which operation runs;
2. which package runs it;
3. what goes in and what comes out;
4. which store is read or changed;
5. what happens when the operation is uncertain or fails.

The user walkthrough starts at the real app's default screen with realistic
data, not a fixture picker or an internal identifier. It must prove that the
user can answer the central question from the founder vision. Internal hashes,
versions, events, and rollback controls belong in secondary diagnostics unless
the founder actually needs them for the ordinary job.

If these two walkthroughs cannot be told without switching meanings for a term
or guessing which product owns a step, the slice is not coherent yet.

### Isolation Demos make each package operable

Each lib and datastore package in a slice-up plan must include a concrete
package-local Isolation Demo description. It is a factory-floor test bench or
store inspector for the founder or developer, not another product package and
not a wall of internal machinery. A lib demo should put a representative input
on the left, the output on the right, and the reason for that output nearby. A
datastore demo should make saved records and their relationships browsable.

For each main operation, answer the atomic question directly. Examples:

- "Given this catalog page, which play links did `findPlayLinks` return?"
- "Given this play page, which source claims did `readPlayPage` return?"
- "Given this cast phrase, how did `interpretCast` represent it and what remains
  unknown?"

Fixtures are pieces of material pushed through the machine. They should make the
operation repeatable, but fixture selection, event streams, schemas, and IDs
must not become the apparent product. The Isolation Demo may expose deeper telemetry
behind a details control.

The Isolation Demo standard belongs here, in the harness, so it can be carried
to every project. Project-specific slice-up documents should apply this standard
rather than redefining it.

For each Isolation Demo, describe:

- The concrete runtime and platform: iOS app, iPhone app, iPad app, web app, CLI TUI, desktop app, local web server, or another explicit target.
- The project shape needed to run it: Xcode project, Swift package example app, app target inside a workspace, local web app package, command-line entry point, or other runnable form.
- The intended device or viewport: iPhone model class, iPad, desktop browser, terminal width, simulator, physical device, or responsive range.
- Orientation and layout assumptions: portrait, landscape, both, fixed-size, responsive, split view, or other constraints.
- Inputs: fixtures, generated data, live device inputs, uploaded files, simulated streams, or other materials the operator can feed into the product.
- Data mode and safe default: fixture, generated, real read-only, real write, or
  a clearly labeled switch between them.
- Controls: buttons, toggles, mode switches, seeded scenarios, reset actions, and failure simulations.
- Internal state: queues, timers, selected records, derived decisions, current mode, pending changes, or intermediate artifacts.
- Outputs: records, chunks, files, photos, transformed data, recommendations, reusable UI bricks, or other produced artifacts.
- External events: the events another package can subscribe to and rely on.
- Internal telemetry: the logs that explain what the product did and why.
- Walkthrough value: what a founder/developer should learn by operating this product directly.

Do not leave the Isolation Demo as an abstract idea. A package spec should make
it clear what the first package-local runnable target will be. For an iOS-first
package, that usually means an iPhone-runnable SwiftUI example or Xcode target
inside the package workspace. For a web-first package, that usually means a
package-local demo entry point and launch command. The details can change later,
but the first spec must choose a concrete starting point.

Before presenting the plan, perform a plain-language pass:

- shorten names that need repeated explanation;
- define unavoidable specialist terms once;
- replace claims of "ownership" with the actual data or action owned;
- replace broad phrases with input/action/output examples;
- verify that the founder-facing app is coherent even though its code is modular;
- state "this boundary is still unclear" anywhere the handoff is not understood.

## Re-Slice A Project Midstream

Sometimes the first slice-up is useful enough to get to a working app, but wrong
enough that continuing to iterate would put core product UI in the wrong package.
Treat that as a normal harness event, not as failure.

Do not overwrite the original slice-up plan when this happens. Preserve it as
design history, then create a dated plan under `docs/re-architectures/` that
captures:

- what the founder observed;
- which current packages own too much or too little;
- which UI or backend responsibilities are duplicated;
- the proposed replacement package boundaries;
- the old-to-new dependency graph;
- which packages are new, removed, renamed, or materially changed;
- which existing screens must remain during the migration;
- the strangler order for replacing old surfaces with new package-owned
  surfaces.

A re-architecture plan is allowed to select a new slice-up, but it should make
that selection explicit. If the human has not selected a direction yet, keep the
plan in proposed status and do not scaffold new packages without approval.

Every re-architecture plan should carry a machine-readable lifecycle marker near
the top of the file:

```text
Re-Architecture Status: proposed|active|succeeded|abandoned
```

It should also carry a small machine-readable scope so phase scripts can launch
explicit ordered agents instead of guessing from prose:

```text
Re-Architecture New Components:
- packages/new-product

Re-Architecture Refactor Components:
- packages/existing-product

Re-Architecture Phase-Out Components:
- packages/old-product

Re-Architecture Final App:
- apps/final-app

Re-Architecture Customer Relationships:
- apps/final-app -> packages/new-product as final-app
```

Use `New Components` for brand-new packages/apps that require scaffolding and
initial specs. Use `Refactor Components` for existing packages whose boundaries
or contracts materially change. Use `Phase-Out Components` for old packages or
surfaces that need bridge/strangler work while ownership moves elsewhere. Use
`Final App` for the production app that should run last.

Only one plan should be `proposed` or `active` at a time. Phase scripts should
auto-select the single open plan. If more than one plan is open, they should fail
with a clear message instead of guessing. A future plan can start only after the
current one is marked `succeeded` or `abandoned`.

Re-architecture phase scripts should print a short human checkpoint at the end of
each successful phase: what agents completed, why the phase break exists, what
the human should review, and the next command to run when ready.

### Re-Run Early Phases For The Changed Slice

After a re-slice is selected, rerun the harness phases for the changed
architecture slice rather than replaying the entire project from zero.

Use these rules:

- Phase 02 equivalent: scaffold only new packages and new customer documents.
  This is an IDE-agent setup step, not a background sub-agent shell phase.
- Phase 03 equivalent: run product-spec agents for new packages and existing
  packages whose boundaries materially changed. These agents should expand
  specs and customer understanding, but must leave implementation specs
  `Spec Status: unresolved`.
- Phase 04 equivalent: run customer-request agents only for new or changed
  consumer-to-producer relationships.
- Phase 05 equivalent: run producer-response agents for producers with new or
  changed customer requests. These agents may update specs to reflect accepted
  contracts, but must not mark implementation work resolved.
- Phase 06 equivalent: implement new packages and boundary changes in dependency
  order, leaving final app integration until the package surfaces compile and
  their Isolation Demos run. Phase 06 agents resolve specs only after the
  implementation and validation are complete.
- Phase 07 continues to handle feedback specs, rework, downstream request specs,
  and version-history notes after the re-architecture implementation begins.

After the re-architecture implementation is validated, run a completion phase
that reconciles the current high-level docs, especially the slice-up plan and
founder vision if the architecture changed product framing. That completion phase
should mark the re-architecture plan `succeeded`. If the plan is discarded, mark
it `abandoned` so a later re-architecture can start cleanly.

The re-architecture background phase runner should start at the Phase 03
equivalent, such as `phase-ra-03-product-specs.sh`. Phase RA-02 is completed by
the current IDE agent after the human approves the re-architecture plan. In later
shell-run phases, the run list should be explicit and inspectable before agents
launch.
Reusable shell helpers for selecting the active re-architecture plan and parsing
its machine-readable scope belong under `docs/ai-product-slice-harness/`, for
example `docs/ai-product-slice-harness/rearchitecture-common.sh`.

### Strangler Migration Rules

Prefer replacing one user-facing surface at a time. Existing app-owned screens
may stay temporarily while package-owned replacements are built and validated.

During the migration:

- New package agents should not opportunistically rewrite the final app unless
  the spec explicitly scopes that integration.
- Final app specs should act as consumer-integration requests after package
  surfaces stabilize.
- Old routes can remain behind debug flags or temporary navigation while the new
  package surfaces are proven.
- Each migrated surface should have validation results from the package Isolation Demo
  and from the final app integration.
- When a producer package changes a contract, create downstream request specs for
  consumers instead of silently editing them in the same pass.

The final app should be allowed to own app shell, high-level navigation,
settings, platform permissions, signing, deployment, and package composition. It
should not become the default owner for durable product UI just because no
package had that responsibility in the first slice-up.

## Organize The Repo As A Monorepo

When the work moves from planning into implementation, use this monorepo shape:

```text
apps/
packages/
  ui/
  lib/
  datastore/
```

Each substantial runnable product is an app workspace. Each reusable piece is a
package workspace in the category that says what it owns. Package-local
Isolation Demo targets do not become app workspaces.

Most internal packages should have two customers:

1. The final production application that imports the package.
2. Its package-local Isolation Demo customer, which operates the package independently.

The final production application usually has one primary customer: the end user. Its documentation should describe the real customer-facing product and how the internal packages are assembled to deliver it.

Each package should own its own planning surface:

- `docs/` for product-level explanation, goals, boundaries, and customer documentation.
- `docs/specs/` for detailed implementation specs, UI specs, checklists, and phase plans.
- `customers/` for the customers that consume this package.

Spec files under `docs/specs/` should be timestamp-prefixed so their natural sort order is their execution order. Use `YYYYMMDDHHMMSS-slug.md`, for example `20260613142030-feedback-improve-scenario-workbench.md`.

Each spec should start with machine-readable metadata:

```text
Spec Status: unresolved|resolved
Spec Type: initial-product-spec|feedback|work-order
Created: <ISO timestamp>
Product: <package-or-app-path>
```

Phase 07 only runs specs whose `Spec Status` is `unresolved`. Do not use
`Spec Status: proposed` for actionable package/app specs; proposed specs are not
picked up by the Phase 07 runner and become a graveyard. If a spec is intended
for implementation, correction, adoption, or downstream work, mark it
`unresolved` immediately. When an agent completes a feedback spec, it should
change the status to `resolved` and add a Resolution section. If blocked, it
should leave the status unresolved and add a Blocked section.

Phase 07 should support a dry run, such as `bash subagents/phase-07-iterate.sh --dry-run`, that skips launching agents and prints the unresolved specs it would process. The dry run may skip prerequisite phase gating because its purpose is only detection and run-order inspection. At the end of both dry and real runs, Phase 07 should print a status summary for every spec discovered by the `**/docs/specs/*.md` glob, grouped by the owning package/app path and counted by `Spec Status` value. This summary is intentionally glob-based so newly added packages and app spec inboxes are visible even if the execution queue still has explicit ordering.

Phase 07 should also support a serial mode, such as `bash subagents/phase-07-iterate.sh --serial` or `PHASE_RUN_MODE=serial`, for debugging or when the human wants deterministic one-at-a-time package execution. The default may remain parallel, but parallelism is only across different products.

Repeated iteration phases should use a per-invocation run id for logs, results, statuses, and watcher output. For example, Phase 07 can default `PHASE_RUN_ID` to a timestamp and name artifacts like `phase-07-iterate-<run-id>-<job>.status`. The watcher command printed by the runner should include that run id so it only displays the jobs from the current invocation, not every historical iteration job.

During Phase 07, an agent should normally edit only its own product and the spec it is resolving. The standard cross-product exception is creating timestamped unresolved request specs in a customer or consumer product's `docs/specs/` folder. That allows producer changes to cascade as explicit downstream work orders without multiple agents editing the same implementation files at once.

When human feedback changes a package contract, first classify which package is
the producer for each part of the request. Write the producer-owned work as one
or more unresolved specs in that package's `docs/specs/` folder. If the change
creates a new expectation for one of that package's customers, add a short Phase
07 addendum to the top-third producer-understanding section of the relevant
`customers/<customer>.md` document, linking the new spec. Then create unresolved
downstream request specs in affected consumer products, especially the final app,
so those consumers can decide how to adopt the new contract after the producer
work resolves. Do not silently implement consumer integration as part of a
producer package pass unless the spec explicitly scopes that integration edit.

The `customers/` folder should start with placeholders. Each customer document should have three major sections:

1. Producer's initial understanding of the customer.
2. Customer request written from the consuming product's perspective.
3. Producer response explaining how the package will meet the request.

The scaffolding agent should create only a light placeholder. The product-spec phase fills the first section from the producer's perspective. The customer-request phase fills the second section from the consumer's perspective. The producer-response phase fills the third section and updates the package spec.

Every package gets `customers/00-isolation-demo.md` in addition to documents for
production consumers. The `00-` prefix keeps this required human customer first
in directory listings. In Phase 04, its request is written from the perspective
of a founder/developer operating the package alone. This customer document does
not add a selected product, team, or Phase 03 agent.

## Plan Sub-Agent Orchestration

After a slice-up direction is chosen and package documentation exists, create a root-level sub-agent plan for the repository. The plan should be a Markdown document, such as `SUBAGENTS.md`, that describes the phased automation strategy for the project.

The sub-agent plan is not the same as application code. It is a coordination document that says which agents should run, in what order, from which package perspective, with what prompt shape, and where their outputs should be written.

The root of the repository should also contain simple shell scripts for executing the phases. The scripts should be small and inspectable. They may call a shared runner script, but the phase definitions should remain easy to read.

Reusable shell helpers belong under `docs/ai-product-slice-harness/`. Phase scripts should source those helpers instead of repeating runner boilerplate. A phase script should mostly show the work list: which products, which relationships, and which phase is running.

### Sub-Agent Phase Plan

The sub-agent plan should define numbered phases. The exact numbering can vary by project, but the pattern should be stable:

1. Phase 01: Human imports the harness and dictates founder vision; AI captures it and creates the root README.
2. Phase 02: AI creates the slice-up plan; human chooses the selected philosophy; AI records the choice and performs the one-time scaffold across all selected products.
3. Phase 03: A shell runner starts one product-spec agent per package to complete that package's spec and fill the top third of customer documents.
4. Phase 04: A shell runner starts one customer-request agent per consumer-to-producer relationship to fill the middle third of customer documents.
5. Phase 05: A shell runner starts one producer-response agent per package to fill the bottom third of customer documents and update specs.
6. Phase 06: Implementation agents build each package's first minimum viable product, including its Isolation Demo.
7. Phase 07: Iteration agents process unresolved timestamped feedback specs, package by package, with final application iteration last.
8. Later phases: Run review, integration, status, and iteration phases until the packages assemble cleanly into the final application.

The phase plan should make dependencies visible. It should list which product consumes which other product. The final production application will often consume most packages, but some relationships may be indirect. For example, the final app may consume a higher-level package that itself consumes a lower-level package.

Sub-agent phases should run in parallel when the work targets separate packages or separate worktrees. The preferred implementation pattern is one agent per package or one agent per consumer-to-producer relationship, with isolated working directories where possible. Sequential execution is still appropriate when multiple agents would edit the same file or when a phase is intentionally easier to inspect one relationship at a time.

### Product Spec Phase

After the selected packages are scaffolded, run one product-spec agent per package. This phase turns the stub spec into a complete initial plan for that package.

Each product-spec agent should read:

- The founder vision.
- The selected slice-up plan.
- Its package `README.md`.
- Its stub spec under `docs/specs/`.
- Its placeholder customer documents under `customers/`.

The agent should update only its own package documentation. It should expand the package spec to describe the product goals, boundaries, library surface, Isolation Demo, customer assumptions, likely interfaces, validation plan, and first implementation checklist.

The package spec must be specific about Isolation Demo implementation. It should
name the package-local runtime, device or viewport, project or target shape, and
launch command. If the project is iOS-first, explain whether the demo is an
iPhone-runnable example, SwiftUI example, Xcode target, or another package-local
runner.

During this phase, the package should fill the first section of each customer document with the producer's initial understanding of that customer. The later customer-request phase lets the consuming package write its own needs from its own perspective.

### Customer Request Phase

The first important sub-agent phase after package scaffolding is the customer-request phase.

For each consumer-to-producer relationship, run an agent from the perspective of the consuming package. That agent reads its own package documentation, reads the producing package documentation, and writes a customer request into the producing package's `customers/` folder.

The customer request should explain:

- Who the customer is.
- How the customer expects to import, embed, call, or display the producing package.
- What inputs the customer expects to pass.
- What outputs, events, UI bricks, state, or APIs the customer needs back.
- What constraints, timing assumptions, or failure behavior matter.
- What options or tradeoffs the producing package should consider.

The agent should edit only the intended customer document unless the phase explicitly says otherwise.

### Producer Response And Build Phases

After customer requests exist, run producer-response agents from the perspective of each producing package. A producer-response agent reads the package's customer documents and writes a response section explaining how the package will meet each customer's needs.

That response should become part of the package's planning surface. If the work is large, the agent should create or update a detailed spec under `docs/specs/` with goals, interfaces, Isolation Demo details, implementation checklist, and validation steps.

Later implementation agents can then build the package's first minimum viable product from those specs. The minimum viable product should include:

- The package's core library or reusable product behavior.
- Any reusable UI screens or bricks promised to customers.
- The package-local Isolation Demo that proves the package by itself.
- Event feeds, telemetry logs, and status views needed to inspect the product.
- Enough tests or validation steps to know the package works for its initial customer requests.

### Shell Scripts And Runner

Each numbered phase should have a small shell entry point, such as `subagents/phase-06-customer-requests.sh` or another clear naming convention chosen by the project.

The scripts should run agents in parallel when they operate on separate packages or separate worktrees. They may run sequentially when the phase edits shared files or when deterministic inspection matters more than speed.

The phase script should build prompts from the phase plan and the package relationship list. The prompt should be short because the repository already contains the detailed instructions. A customer-request prompt can be as simple as:

```text
You are running from inside <consumer-package>.
Read this package's docs and the docs for <producer-package>.
You are a customer of <producer-package>.
Write your customer request into <producer-package>/customers/<consumer-package>.md.
Edit only that customer document.
```

The project may choose the agent runtime. If the project uses Codex, the scripts should invoke Codex with the phase prompt, wait for completion, write logs, then move to the next relationship.

When implementation or iteration agents need Xcode or SwiftPM, the runner should allow project-controlled Codex sandbox settings. Keep `workspace-write` as the default sandbox, but allow the phase script or human to set:

- `CODEX_SANDBOX_MODE=workspace-write|danger-full-access` to choose the Codex shell sandbox.
- `CODEX_ADD_DIRS=<path[:path...]>` to add writable directories for known tool caches.

For iOS projects, Phase 06 and Phase 07 should usually add writable access for SwiftPM/Xcode caches such as `$HOME/Library/Caches/org.swift.swiftpm`, `$HOME/Library/Caches/com.apple.dt.Xcode`, `$HOME/Library/Developer/Xcode/DerivedData`, and `/private/tmp`. If those allowances are still insufficient, a human can intentionally rerun a narrow job with `CODEX_SANDBOX_MODE=danger-full-access`.

When a phase uses parallel worktrees, the phase script should name the worktree, branch, log file, and status file for each agent. The merge or collection step should be explicit so humans can inspect outputs before integrating them.

### Logs, Status, And Resuming

Every sub-agent run should produce committed artifacts that make the phase auditable:

- A log file for the agent runtime output.
- A status file or status section recording success, blocked, or failed.
- A short completion message from the agent.
- The files the agent was expected to edit.

Logs should be named so they identify the phase and relationship, such as `phase-06-final-ios-app-uses-hunt-session-engine.log`.

Status should be deterministic. Each run should write a status file whose first line is exactly one of these values:

- `succeeded`: the agent completed the requested edit or implementation.
- `blocked`: the agent understood the task but needs founder or developer input.
- `failed`: the run crashed or did not produce usable output.

The first line is the machine-readable gate used by later phases. Additional lines can include the human-readable label, log path, result path, and a short summary.

The shell wrapper writes the status file. The agent reports its intended outcome by writing a structured result drop file whose path is provided in the prompt. The wrapper validates that result file after the agent exits and uses it to write the final status file.

Each result file should use this format:

```text
STATUS: succeeded|blocked|failed
SUMMARY: <one-line summary>
DETAILS:
<details, especially if blocked or failed>
```

The wrapper should not scrape generic prose from the log. If the agent exits successfully but the result file says `STATUS: blocked` or `STATUS: failed`, the wrapper should use that reported status instead of blindly marking the run as `succeeded`. If the result file is missing or invalid, the wrapper should mark the run as `failed` and point to the log and result file.

Later phases should refuse to start unless all required status files from the prior phase exist and their first line is `succeeded`. For example, Phase 04 should not start if any Phase 03 product-spec agent is `blocked`, `failed`, or missing. Phase 05 should not start until every Phase 04 customer-request relationship has succeeded. Phase 06 should not start until every Phase 05 producer-response agent has succeeded and the human has intentionally cleared the implementation gate.

Phase scripts should make it easy to choose parallel or one-at-a-time execution. The default can be parallel, but each script should include a nearby commented serial option so a human can rerun or debug agents one at a time without rewriting the script.

Phase scripts should also support filtered reruns. A human should be able to rerun only one product or relationship after fixing context, instead of relaunching the whole phase. The standard helper supports this with `PHASE_ONLY=<run-label>`, where product labels are package/app basenames such as `final-ios-app`, and relationship labels use `<consumer>-uses-<producer>`.

The standard helper includes one persistent macOS-compatible watcher. Start it
once, before any shell phase:

```sh
make watch
```

It waits when nothing is running, automatically switches when a new phase
starts, refreshes once per second, prints current statuses, and tails the last
few lines of matching logs. It stays open after success so Phase 03 can flow
into 04 and 05, or Phase 06 and later Phase 07 runs, without Ctrl-C and a new
command. A named phase can still be pinned for debugging with
`make watch PHASE=phase-06-first-implementation`.

When a sub-agent is blocked, preserve its log and status. A later rerun should be able to read the previous log, understand where it stopped, and continue after the blocker is resolved.

If a blocked spec is resolved manually after the agent exits, update both layers
of state:

- Change the spec's `Spec Status` to `resolved` and add the manual validation or
  resolution notes to the spec.
- Update the corresponding `subagents/results/*.result` and
  `subagents/status/*.status` files from `blocked` to `succeeded`, with a summary
  that explains the manual validation. The watcher and phase-status scripts read
  these status artifacts; they do not recompute historical run status from spec
  headers.

## Downstream Request Specs

Sometimes one product finishes implementation or iteration and learns that one
of its consumers should reassess integration. The producing product should not
silently reach across the boundary and implement the consumer's app or package
behavior unless that was explicitly in scope.

Instead, create an unresolved downstream request spec in the receiving product's
`docs/specs/` folder. This acts like an inbox item for that product team.

Recommended header:

```text
Spec Status: unresolved
Spec Type: downstream-request
Created: <UTC timestamp>
Product: <receiving product path>
Requested By: <requesting product path>
Customer Relationship: <consumer consumes producer, or other relationship name>
```

The request should explain:

- What changed in the requesting product.
- Which customer document or consumer relationship is relevant.
- What the receiving product should reassess.
- Which behavior is requested, without over-constraining the receiving product's
  implementation.
- What validation would prove the integration works.

The receiving product owns the response. Its agent may implement the request,
split it into smaller specs, supersede it with a better app-level plan, or leave
it unresolved with a `Blocked` section. If the request changes the original
customer contract in a meaningful way, the receiving product should update the
relevant docs or explain the decision in the spec's `Resolution`.

Phase 06 and Phase 07 agents should do a brief boundary check before finishing:
look at the product's customers, consumers, and newly exposed behavior. If the
work creates a new expectation for another package or the final app, create or
suggest a downstream request spec for that receiving product.

## Build Multi-Use Packages

Most internal behavior should live under `packages/lib/` and durable authorities
under `packages/datastore/`. Ordinary product screens stay in the selected app,
while each package keeps its own Isolation Demo. Use `packages/ui/` only for a major,
independently valuable UI system explicitly selected in the slice-up. A package
should normally have at least two use cases:

1. It can be imported into the final application or another package.
2. Its interfaces can be exercised directly through its package-local Isolation
   Demo customer.

The Isolation Demo is both a demonstration and debugging tool. It lets us
operate that package on its own without requiring the final application.

The Isolation Demo is not a separate customer-facing product or team. Its value
is that we can play with every package interface, try different inputs, inspect
behavior, and prove the package independently.

## Design Each Piece As A Demonstrable Product

When the architect breaks down the founder vision, each product should be defined with:

- The specific value it creates.
- The input it accepts.
- The output it produces.
- The events or signals it emits.
- The behavior its Isolation Demo should make visible.
- The package-local runnable target used to operate and inspect it.
- The boundaries it does not cross.
- The way it can be used by another package or final application.

The Isolation Demo should expose what would normally be hidden inside the final
application: internal state, intelligent controls, transformations, emitted
events, and decisions.

This makes every package easier to debug, easier to explain, and easier to validate before it is integrated into the larger system.

For most packages, the Isolation Demo should include:

- An operator panel for feeding inputs, changing modes, and triggering actions.
- A primary product view or reusable UI brick when the package owns visual behavior.
- A state inspector that shows current data, queues, selections, timers, or derived decisions.
- An output view that shows produced artifacts, records, chunks, photos, suggestions, or results.
- A live event feed for externally consumable events.
- A telemetry or debug log for internal product activity.

The live event feed and internal telemetry are different. The event feed shows what another package can subscribe to and rely on. The telemetry log shows what the local observer needs in order to understand and debug the product.

## Example: Audio Recording System

Imagine the founder wants an audio recording app that durably records audio in chunks, analyzes quiet spots, creates useful snippets, and transcribes selected audio.

That vision can be broken into separate products:

### Audio Chunk Recorder

This package captures an incoming audio stream, splits it into raw chunks, stores or hands off those chunks, and broadcasts that new chunks are available.

Its Isolation Demo might let someone start recording, watch chunks appear in
real time, inspect chunk metadata, and see chunk-ready events as they fire.

It does not need to solve transcription, silence detection, final persistence, or the full user experience.

### Volume And Silence Analyzer

This package consumes audio chunks, whether from the real recorder package or from simulated test inputs. It analyzes volume levels, identifies quiet regions, and suggests good places to cut audio with minimal impact.

Its Isolation Demo might visualize waveform volume, mark quiet sections, and
show candidate cut points as chunks arrive.

It does not need to know how audio was recorded or how final snippets will be stored.

### Snippet And Transcription Processor

This package takes selected audio snippets or concatenated audio segments, sends them to a transcription service, and stores or returns transcription output.

Its Isolation Demo might accept an audio file or generated snippet, call the
transcription workflow, and display the resulting transcript and processing
status.

It does not need to manage recording or decide where silence occurs.

### Final Application

Once the independent products work, the final application imports them and wires them together. It provides the durable persistence, user-facing interface, navigation, storage model, and final experience.

The packages do not need full production persistence in their Isolation Demos.
They can use in-memory or dummy persistence when that is enough to prove their
own behavior.

## Working Sequence

The project flow follows the Project Bootstrap Sequence at the top of this document.

At a high level:

1. Human establishes the harness and founder vision.
2. AI captures the vision, creates the root README, and proposes slice-up philosophies.
3. Human chooses the product-boundary philosophy.
4. AI records the choice and performs the one-time cross-product scaffold.
5. Product-specific agents complete specs and the producer-understanding sections of customer documents.
6. Relationship-specific agents write customer requests.
7. Producer-specific agents respond to customer requests and update specs.
8. Implementation agents build package MVPs and package-local Isolation Demos in isolated worktrees where possible.
9. Human and AI review, integrate, and iterate until the final application is assembled.

## Guiding Principle

Every internal product should be useful enough to show off by itself and clean enough to import into something larger.

That gives us a system where each part has independent value, each team can prove what they built, and the final application is an assembly of already-understood products rather than a single opaque machine.
