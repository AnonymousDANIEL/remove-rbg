# Remove BG — GitHub + Railway Final Build

Self-hosted background remover designed for Railway. It supports uploads, drag & drop, clipboard paste, public image URLs, local history, copy/download, right-click saving, and a remove.bg-style sample results gallery with draggable before/after comparison.

## Features

- Upload image
- Drag & drop
- Ctrl+V image paste
- Clipboard button
- Public image URL input
- Automatic transparent PNG output
- Direct right-click on result image
- Copy PNG to clipboard
- Download PNG
- Original / Removed / Compare views
- Recent results stored locally in IndexedDB (up to 24 items)
- Delete one / clear all history
- Sample image strip
- Full sample gallery with lazy before/after generation
- Sample results cached in the browser
- SSRF protection for URL fetching
- No server-side image history storage
- `/health` endpoint for Railway

## AI model

Default: `birefnet-general-lite` via rembg. The Dockerfile pre-downloads this model during build so normal requests do not need to download it later.

Optional Railway variable:

```text
REMBG_MODEL=birefnet-general-lite
```

You normally do not need to add any variables.

## Deploy

1. Extract the ZIP.
2. Upload **all files inside the folder** to the root of your GitHub repository. Do not upload the ZIP itself.
3. Connect that GitHub repository to Railway.
4. Railway detects the root `Dockerfile` and builds it.
5. Under Railway Networking, generate a public domain.
6. Open the domain.

## Files

```text
app.py
app.js
index.html
style.css
requirements.txt
Dockerfile
railway.toml
README.md
.gitignore
.dockerignore
```

## Notes

- The first Docker build is larger because the AI model is downloaded into the image.
- Browser history and sample cache are local to that browser/device. Clearing site data removes them.
- Uploaded images are processed in memory and are not intentionally persisted by this application.
- Sample photos are loaded from Unsplash for demonstration.
