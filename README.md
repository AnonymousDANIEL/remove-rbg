# Remove BG — Separate Pages Edition

Self-hosted background remover for GitHub + Railway.

## Pages
- `/` — upload / drop / paste / URL + quick samples
- `/result` — separate result screen with Removed / Original / Compare, Download, Copy and Previous records
- `/samples` — separate sample image page

## Deploy
1. Unzip this package.
2. Replace the files in your GitHub repository with all files from this folder.
3. Commit changes.
4. Railway will rebuild automatically from the Dockerfile.
5. No Railway Variables are required for the default setup.

## Notes
- Model: `birefnet-general-lite`
- Previous records are stored in the browser using IndexedDB, up to 24 recent images.
- Uploaded images are processed in memory and are not intentionally stored on the Railway server.
- Direct image URLs are fetched server-side with checks that reject local/private network targets.
