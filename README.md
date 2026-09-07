# Remove Background — GitHub + Railway

Simple self-hosted background remover inspired by the fast workflow of remove.bg.

## Features

- Upload image
- Drag & drop
- Ctrl+V / Cmd+V paste from clipboard
- Automatic background removal immediately after an image is selected
- Transparent PNG preview
- Download PNG
- Copy PNG back to clipboard
- Server processes files in memory; this app does not intentionally save uploaded images
- Railway-ready Dockerfile

## Stack

- Flask
- rembg (CPU / ONNX Runtime)
- U2Net model
- Gunicorn
- Docker

## Deploy with GitHub + Railway

1. Create a new GitHub repository.
2. Upload every file/folder from this project to the repository root.
3. In Railway, choose **New Project → Deploy from GitHub repo**.
4. Select the repository.
5. Railway detects the root `Dockerfile` and builds it automatically.
6. In Railway service settings, create/generate a public domain.
7. Open the domain and test with an image.

No Railway Variables are required for the default setup.

### Optional Railway Variables

| Variable | Default | Meaning |
|---|---:|---|
| `MAX_UPLOAD_MB` | `15` | Maximum upload size in MB |
| `MAX_PIXELS` | `30000000` | Maximum image pixel count |
| `REMBG_MODEL` | `u2net` | rembg model name |

> The Docker image pre-downloads `u2net`. If you change `REMBG_MODEL`, that model may need to download at runtime unless you also update the Dockerfile.

## Local Docker test

```bash
docker build -t remove-bg-web .
docker run --rm -p 8080:8080 remove-bg-web
```

Then open `http://localhost:8080`.

## Notes

- Use one Gunicorn worker because the ONNX model consumes memory. Threads allow light concurrency without loading multiple model copies.
- Higher-quality/larger rembg models can require substantially more RAM and longer startup/build times.
