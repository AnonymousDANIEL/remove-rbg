# Remove BG — Railway Final (Global Paste)

Self-hosted background remover for GitHub + Railway.

## Main flow

- `/` — upload home
- `/result` — separate result page
- `/samples` — separate samples page

## Paste behavior

Ctrl+V works globally on **every page**, including the result page. Copy a new image from a browser, Windows clipboard, screenshot tool, or another app and press Ctrl+V. The newest image is processed immediately, becomes the current result, and older results stay in Previous records.

Clipboard handling supports image file clipboard items, PNG/JPG/WebP clipboard data, copied image HTML/URLs, and plain image URLs when pasted outside a text input.

## Result page

- Removed / Original / Compare
- complete uncropped image display
- Download PNG
- Copy image
- right-click result image
- Previous records stored locally in IndexedDB
- New image opens the file picker directly from the result page
- Ctrl+V processes a new image directly from the result page

## Railway

No variables are required for the default setup. Railway detects the Dockerfile automatically.

Optional variables:

- `REMBG_MODEL=birefnet-general-lite`
- `MAX_UPLOAD_MB=20`
- `MAX_PIXELS=50000000`
- `URL_TIMEOUT=20`

The model is downloaded during Docker build.
