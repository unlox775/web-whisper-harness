# Founder vision — Web Whisper

This is the founder perspective for a ground-up rebuild. It is source material, not a requirements spec and not a map of the old internals. The existing public app at https://unlox775.github.io/web-whisper/ and the docs in unlox775/web-whisper are the behavioral and visual source of truth. Preserve the theme, visual identity, and overall look. Replace the architecture.

Target device: iPhone, used as a Progressive Web App (Add to Home Screen). Desktop/web can work later. It is backlog, not the default.

## Who it is for

Dave (and anyone like him) who needs to capture long stretches of spoken audio on a phone — lectures, meetings, dictation, notes — and later play them back and turn the useful parts into text.

The primary customer is the person holding the phone. A secondary customer is Dave-as-developer: when something goes wrong with capture, storage, or transcription, he needs a way to see what actually happened without that machinery sitting in the normal recording UI.

## The job

Make long-form recording on a phone trustworthy.

The product exists because browser recording is easy to start and easy to lose. Tabs background. iOS suspends audio. Encoded container fragments lie about time. If the recording is not durable while it is happening, it is not a recorder.

Web Whisper's job:

1. Start recording with one tap.
2. Keep the audio even if the page hiccups — encode and persist as you go, not at the end.
3. Stop, and have a session you can play.
4. Optionally send speech to Whisper (via Groq) and get text back.
5. If transcription is off or the key is missing, the app is still a working recorder. Do not pretend a missing key is a failed transcript.

## How it should feel

Calm, immediate, durable. A tape recorder that happens to live in the browser.

- Start should feel like the mic is live now, not like a setup wizard.
- While recording, duration should move. The person should believe audio is landing somewhere safe.
- After stop, the session is a card they can open and play. Playback is the proof the recording existed.
- Transcription is a power-up, not the identity of the app. No key: record and play. With a valid Groq key: snips can become text.
- Developer tools are behind a door (Settings → Developer mode, then bug/doctor affordances). The default UI is record, list, play, transcribe. Raw logs, hashes, timings, IndexedDB tables, and doctor JSON do not substitute for those jobs.

Visually: keep the current product's identity. The rebuild is not a redesign. Same overall chrome, color, typography, and density as the live PWA. Isolation Demos for packages may look like founder/dev operating surfaces. The final app should still look like Web Whisper.

## Core flows that define success

### Record
User taps **Start recording**. The app asks for the microphone if needed (iOS will re-prompt PWAs after cold start; that is a platform fact, not a product failure). Capture begins as PCM. About every four seconds the app encodes an MP3 chunk and writes it to durable local storage immediately. Duration is based on captured audio samples, not a wall clock. On **Stop**, any remainder flushes, the session is reconciled, and the session is ready to play — or it is honestly marked as having no playable audio.

Watchdogs exist because iOS sometimes grants the mic and then never delivers audio callbacks. If no audio arrives, stop and say the session completed without playable audio. Do not leave a zombie "recording" that is empty.

### Keep
Sessions, chunks, volume profiles, snips, and logs live on the device. Immediate persist is the product promise. There is a storage cap and a retention policy so the phone does not fill forever. The person can set the cap in Settings.

### Play
From the session list, open a session. Play the whole recording. In developer mode, play an individual chunk or snip. Playback is how you trust the recorder. If you cannot play it, you did not record it.

### Cut into snips
Quiet regions and volume over time are used to propose snips — the units that get sent to Whisper. Snip boundaries can be wrong; they are a product judgment surface, not a hidden implementation detail. The person should be able to hear a snip and understand why it exists.

### Transcribe
Settings holds a Groq API key. The app auto-checks the key and shows transcription enabled or disabled. Groq Whisper is inexpensive enough that Dave has used it hard without a bill; still say so with a disclaimer, and never require a key to record.

When transcription is disabled: after stop, the UI says recording complete, not transcription failed. When enabled: snip audio goes to Groq, text comes back, and copying that text should be fast (clipboard-first is the next product step: auto-copy plus a copy control on the session tile, especially on iOS where selecting text is miserable).

### Settings
- Groq API key (validate, retry if invalid)
- Storage cap
- Developer mode
- (Today also bitrate; keep as a setting if it still matters, not as a main-screen control)

### Diagnose (secondary)
Developer mode unlocks:

- Live chunk count and buffer size while recording
- Chunk and snip lists with per-item play/download
- Volume histogram with snip boundaries
- Developer console: IndexedDB tables and per-session structured logs
- Doctor: coverage, range access, per-chunk decode, snip scan, JSON export

These exist because the capture pipeline lied to us for months when we could not see data. They stay secondary. A founder walking the default app should never have to read a log line to record a meeting.

## Concrete examples

**Lecture on a phone.** Dave opens the installed PWA, taps Start, puts the phone on the table. Every ~4 seconds another MP3 chunk is on disk. He taps Stop. The session card plays the lecture. If he has a Groq key, snips transcribe and he can copy the text.

**No Groq key.** Same recording path. Session is playable. The app does not nag as if transcription failed. It is a recorder.

**iOS mic ghost.** He taps Start. The mic indicator flickers. No chunks appear. After a timeout the app stops itself and the session is "completed without playable audio." He can delete it. The logs (if developer mode is on) show microphone acquired, PCM capture started, then no callback. That failure must remain diagnosable. It is a known iOS issue, not something to paper over with a spinner.

**Developer hunting a bad snip.** Developer mode on, open the session, doctor + histogram. See whether volume profiles exist, whether chunk times cover the session, whether a snip is out of range. Fix the data, not the CSS.

## Domain lexicon (plain names)

Use these in later slice-up work. They are planning names, not frozen APIs.

- **Session** — one start-to-stop recording the user can list and open.
- **Chunk** — a durable ~4s (or remainder) MP3 piece of that session, persisted immediately.
- **Volume profile** — how loud a chunk was over time; feeds snips and the histogram.
- **Snip** — a proposed speech segment, playable, optionally transcribed.
- **Transcript** — Groq Whisper text attached to a snip or rolled up for a session.
- **Capture** — the live microphone-to-chunks job.
- **Playback** — hear a session, chunk, or snip.
- **Doctor** — explicit diagnostic pass over a stored session (not the default UI).

## What success looks like on day one of the rebuild

The rebuilt final app, on iPhone device mode against the new architecture:

- Looks like the current Web Whisper.
- Can start, persist chunks while recording, stop, and play a session.
- Settings still gate Groq and developer mode.
- Transcription optional; disabled mode is a successful recorder.
- Diagnostics exist and do not own the home screen.

## Remember for later, do not overbuild now

From the current roadmap and lessons, in founder language:

- iOS background recording is not reliable as a PWA. A native wrapper is the real fix. Remember it; do not pretend the first harness slice is an App Store app.
- Full-session download in the normal detail view (not only developer mode).
- Clipboard-first transcripts.
- Cross-browser matrix (iOS Safari/Chrome first).
- Capture should stay PCM-first with sample-based time. Encoded containers are not a timeline. That lesson is load-bearing even if the module names all change.
- No cloud upload/telemetry pipeline yet. Local durability is the product.

## What this vision is not

- Not a mandate to keep ScriptProcessor, lamejs, IndexedDB schema, or `manifestService`.
- Not a redesign, parchment theme, or desktop-first layout.
- Not "build a generic AI dictation platform."
- Not a dump of debug telemetry into the recording screen.

## Sources (behavior, not architecture to copy)

- Live PWA: https://unlox775.github.io/web-whisper/
- Repo: https://github.com/unlox775/web-whisper
- `README.md`, `documentation/README.md`, `documentation/architecture.md`, `documentation/capture-flow.md`, `documentation/roadmap.md`, `documentation/knownissues.md`, `documentation/debugging.md`, `documentation/lessonslearned.md`
