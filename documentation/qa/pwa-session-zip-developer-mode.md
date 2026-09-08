# QA: Session zip import / export is developer-mode only

**Date:** 2026-09-08  
**Branch:** `cursor/dev-mode-session-zip-fdc7`  
**Viewport:** iPhone 12 Pro DevTools (390×844 CSS px)

## What was verified

1. **Developer mode off**
   - Home shows CAPTURE + sessions only. No LIBRARY card. No **Import session zip**.
   - Settings → App shows **Enable developer mode** unchecked. No Session archive block. No **Import session zip**.
   - Session Detail → Debug shows Chunks / Snips pills. No **Export session zip**. No debug-include checkbox.

2. **Developer mode on**
   - Home still has no import control (Settings-only).
   - Settings → App shows **Session archive** with **Import session zip** and developer-debugging helper copy.
   - Session Detail → Debug shows **Export session zip** plus **Include snips + transcripts (debug)**.

## Proof shots

- `documentation/qa/pwa-session-zip-dev-off-home.png` — Home, developer mode off
- `documentation/qa/pwa-session-zip-dev-off-settings.png` — Settings, developer mode off
- `documentation/qa/pwa-session-zip-dev-off-debug.png` — Session Detail Debug, developer mode off
- `documentation/qa/pwa-session-zip-dev-on-settings.png` — Settings import visible
- `documentation/qa/pwa-session-zip-dev-on-debug.png` — Session Detail export visible
