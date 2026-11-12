# Stats cache invalid state must not leak retention sentinel to UI

**Spec Status:** resolved (PR for sentinel + rebuild UX)

## Feedback

After O(1) `getStorageStats`, real iPhones upgraded from v3/v4 data showed `8388608 GB / 500 MB` in the DATA chip. Root cause: invalid stats cache returned `usedBytes: Number.MAX_SAFE_INTEGER` and PWA treated it as known.

## Requirements

1. Public `getStorageStats` exposes `usedBytesKnown` / `usedBytesStatus`; `usedBytes` is null when unknown.
2. Background rebuild on boot and on `getStorageStats` when invalid; repair session rows missing `sizeBytes`.
3. Retention keeps internal high sentinel via `cachedUsedBytes()` only.
4. PWA never formats sentinel; shows Calculating… while unknown/rebuilding.
