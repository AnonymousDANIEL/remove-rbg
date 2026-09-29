# Remove BG — Official remove.bg API

This build does **not** use rembg, U2Net or BiRefNet. The cutout result comes from the official remove.bg Background Removal API.

## Required Railway variable

Railway → your service → **Variables**:

```text
REMOVE_BG_API_KEY=YOUR_REMOVE_BG_API_KEY
```

Do not put the API key in GitHub.

## Flow

- `/` Upload / Drag & Drop / Ctrl+V / URL
- `/processing` separate processing screen
- `/result` Removed / Original / Compare / Copy / Download
- Previous records are stored in the current browser with IndexedDB
- Ctrl+V also works on Processing and Result pages

## Quality modes

### Best — default

Sends:

```text
size=auto
type=auto (unless you choose a subject)
type_level=2
format=png
```

`size=auto` asks remove.bg for the highest available output up to the API's normal auto limit, based on input size and account credits.

### Free Preview

Sends:

```text
size=preview
```

remove.bg currently advertises 50 free low-resolution API calls per month. Use this mode when you want to test without intentionally requesting high-resolution output.

## Graphic mode

For glowing amount images, title cards, logos and graphics such as `RM1,475`, choose **Graphic** before Upload/Paste. This sends:

```text
type=graphic
```

For normal photos leave Subject on **Auto**, which remove.bg recommends.

## Official API limits used by this build

- JPG / PNG / WebP
- up to 22 MB per uploaded file
- input resolution up to 50 MP
- transparent PNG output

## Optional Railway variables

```text
JOB_WORKERS=4
JOB_TTL_SECONDS=1800
API_TIMEOUT_SECONDS=90
MAX_UPLOAD_MB=22
```

## Deploy

1. Extract the ZIP.
2. Delete the old files in your GitHub repo.
3. Upload **all extracted files** to the repository root.
4. Commit changes.
5. Railway automatically redeploys.
6. Add `REMOVE_BG_API_KEY` in Railway Variables.
7. Open `/health`. It should show `"apiConfigured": true`.

## Important: December 1, 2026

remove.bg currently states that its Background Removal API moves to Leonardo.Ai starting **December 1, 2026**. This package intentionally uses the current official endpoint:

```text
https://api.remove.bg/v1.0/removebg
```

If the old endpoint is retired on/after that date, the backend will need the Leonardo migration update.
