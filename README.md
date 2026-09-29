# FREE SMART Background Remover — GitHub + Railway

This version intentionally uses **no paid background-removal API**.

- No `REMOVE_BG_API_KEY`
- No remove.bg credits
- No Leonardo API
- No Canva API
- No pay-per-image charge

Railway only hosts the website and a small image-URL proxy. Background removal runs **inside the user's browser**. There is no paid AI endpoint.

## Engines

### Smart (recommended)
Smart first examines the image border.

- If the border is a nearly solid black/white background, it uses the built-in **Smart Graphic** alpha algorithm. This is useful for amount artwork, glowing text, logos, title graphics, and black-background graphics because it preserves coloured outlines/glow instead of asking a portrait segmentation model to guess.
- Otherwise it uses local ISNet AI in the browser.

### Graphic
Always uses the Smart Graphic solid-background removal algorithm. Very fast. Best when the background is black, white, or another mostly flat colour.

### Portrait
Always uses the local AI model.

## Quality

- **HD**: uses the large local model when WebGPU is available; on CPU it automatically uses the medium model so the browser does not become unusably slow.
- **Fast**: uses the quantized small model.

The first AI use downloads the model/WASM files. The browser then caches them, so later images are faster. The home page starts warming the selected model quietly in the background.

## Deploy

1. Extract this ZIP.
2. Delete the old files in your GitHub repository.
3. Upload all extracted files to the repository root.
4. Commit.
5. Railway automatically rebuilds using the included Dockerfile.
6. Delete the old `REMOVE_BG_API_KEY` Railway variable. It is not used.

No Railway variables are required.

Health check:

`/health`

returns:

```json
{"ok": true, "engine": "browser-local", "externalPaidApi": false}
```

## Pages

- `/` — Upload / Drop / Paste / URL
- `/processing` — separate processing page
- `/result` — Removed / Original / Compare / Copy / Download / Previous records
- `/samples` — sample images

Ctrl+V works on every page.

## Performance notes

For best browser AI performance, the Flask server sets the cross-origin isolation headers recommended by IMG.LY for SharedArrayBuffer/WASM threading. On supported browsers, WebGPU is used. If WebGPU is unavailable, the library falls back to CPU/WASM.

## Important accuracy note

A free local model cannot be guaranteed to produce pixel-identical output to remove.bg's proprietary commercial model. This build improves the common black-background graphic case by using a dedicated graphic algorithm instead of forcing every image through the same segmentation model.

## Open-source license note

This project uses `@imgly/background-removal`, which is distributed under the AGPL license. If you publicly deploy or modify an AGPL-covered application, review and comply with the AGPL source-sharing requirements. The package and model runtime assets are provided by IMG.LY; their own license/notice files govern those components.


## First-use model download

The browser library and neural-network assets are downloaded from the public IMG.LY/ESM distribution endpoints on first use. This is **not a paid API call** and there is no per-image credit. Browser caching makes later runs faster.
