# Remove Background — Railway Final

A simple self-hosted background remover built with Flask + rembg for Railway.

## GitHub upload

Unzip this package, then upload **all files inside this folder directly to the root of your GitHub repository**.

Your repository root should look like:

```text
Dockerfile
app.py
index.html
style.css
requirements.txt
railway.toml
.gitignore
.dockerignore
README.md
```

There is intentionally **no templates/ or static/ folder** in this final package. This avoids the common GitHub web-upload problem where nested folders get flattened or omitted.

## Railway

1. Connect the GitHub repository to Railway.
2. Railway detects `Dockerfile` automatically.
3. No variables are required for the default setup.
4. Generate a public domain under Railway Networking.

Optional variables:

- `MAX_UPLOAD_MB=15`
- `MAX_PIXELS=30000000`
- `REMBG_MODEL=u2net`

Health endpoint: `/health`

## Features

- Upload image
- Drag & drop
- Ctrl/Cmd + V paste image
- Automatic background removal
- Original/result preview
- Transparent PNG output
- Download PNG
- Copy PNG where browser clipboard support allows it
