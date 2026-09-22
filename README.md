# Remove BG — Railway final build

Self-hosted background remover for GitHub + Railway.

## What changed in this build

- No full-screen `Removing background...` blocker.
- Paste with `Ctrl+V` repeatedly while another image is processing.
- Every new image is added to the bottom queue immediately.
- Processing happens in order; completed images automatically enter Previous records.
- On `/result`, the newest completed result replaces the current image without reloading the page.
- Upload button, drag/drop, clipboard image paste and image URL are supported.
- Separate pages remain: `/`, `/result`, `/samples`.
- Default model is full `birefnet-general` rather than the Lite model.
- Color decontamination is enabled to reduce dark/colored edge halos.
- PNG output uses fast lossless compression for quicker response.
- The model is downloaded at Docker build and warmed when the service starts.

## Deploy

1. Extract this ZIP.
2. Delete the old files in your GitHub repository.
3. Upload **all extracted files** to the repository root.
4. Commit changes.
5. Railway will redeploy automatically.
6. No Railway Variables are required for the default setup.

## Optional Railway variables

- `REMBG_MODEL=birefnet-general` — default, higher quality.
- `REMBG_MODEL=birefnet-general-lite` — lower memory / faster, but lower quality.
- `MAX_UPLOAD_MB=25`
- `MAX_PIXELS=60000000`

If you override `REMBG_MODEL` in Railway, the Docker image only pre-downloads the default full model. Keep the default unless you specifically need the Lite fallback.
