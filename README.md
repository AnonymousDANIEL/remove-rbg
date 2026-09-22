# Remove BG — Instant Processing Page / Fast Railway build

This version changes the flow to:

1. Upload / Paste / URL on `/`
2. The upload is accepted and a job ID is returned immediately
3. Browser moves to `/processing` while AI inference runs in a background worker
4. When finished, browser automatically opens `/result`
5. Result is saved into browser IndexedDB as Previous records

## Why this version feels faster

The previous build used `birefnet-general` for every image. That is a heavier model on CPU.

This build defaults to:
- **Fast**: `birefnet-general-lite`
- **HD**: `birefnet-general`

Fast is pre-downloaded during Docker build and warmed when the app starts.
HD is optional and can be slower on the first use if the full model is not already cached.

## Railway region — important for Malaysia

If your Railway service is currently in **US East**, change it to **Southeast Asia / Singapore**:

Railway service → Settings → Scale / Regions → Southeast Asia (Singapore)

This reduces upload/download latency for Malaysia. It does not make the AI itself magically GPU-fast, but it removes the unnecessary Malaysia → Virginia round trip.

## Upload to GitHub

Extract the ZIP and upload all files to the repository root. Do not upload the ZIP itself.

No Railway Variables are required.

Optional Variables:

- `FAST_MODEL=birefnet-general-lite`
- `HD_MODEL=birefnet-general`
- `JOB_WORKERS=1`
- `MAX_UPLOAD_MB=25`
- `MAX_PIXELS=60000000`
- `JOB_TTL_SECONDS=1800`
- `WARM_MODEL=1`

For small Railway instances keep `JOB_WORKERS=1` to avoid RAM/CPU spikes.

## Important quality note

remove.bg / Canva runs proprietary commercial models and infrastructure, so a self-hosted CPU `rembg` service cannot guarantee identical pixels or identical speed on every image.

The default Fast mode is intended for quick daily use. Use HD only when the edge quality matters enough to accept longer CPU inference.
