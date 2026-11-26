# Poem Motion Studio — release notes, budgets, rollback

Route: `/admin/poem-motion-studio` (Admin only). All rendering/encoding runs in the browser (WebCodecs + mediabunny, lazy-loaded
inside the route). Vercel never encodes video. Collection `motionprojects` is additive and separate from `writings`.

## Measured (desktop Chrome, local production build, 11 s Reel) — not a device claim
| Metric | Result |
| --- | --- |
| Editor ready | ~0.3 s |
| Preview | ~61 fps |
| Reel export 1080x1920 30 fps | ~2.3 s (≈5x realtime) |
| Longest main-thread stall during export | 12 ms (yields every 6 frames) |
| JS heap after export | ~11 MB (+ final MP4 buffer) |
Worker/OffscreenCanvas: **not adopted** — export is already off the critical path and the editor stays responsive. Revisit only if
real phones show >100 ms stalls. Budgets: export ≤ 2x realtime, stall ≤ 50 ms, decoded photo ≤ 2048 px.

## Safety properties
- Writing records are never modified. Projects keep `sourceWritingId`, `sourceHash`, `sourceVersion`.
- Photos stay on the device unless explicitly saved (existing `/api/upload-image`, Cloudinary). Audio is never uploaded.
- Editors can edit/delete only their own projects; admins any (`createdBy`).
- No MP4 in MongoDB. Devices without H.264 get an image-sequence ZIP, never a WebM named .mp4.

## Rollback
1. Vercel dashboard → `portfolio-admin-dashboard` → Deployments → promote the previous production deployment (instant), or
2. `git revert -m 1 <merge commit>` on `main` and push (no force-push).
The `motionprojects` collection may be left in place (unused, harmless) or dropped by the owner.

## Not verified
Real iPhone Safari / Android Chrome devices; Preview/production runs against real data; real AAC on devices lacking an AAC encoder.
