# Free Background Remover — Railway Local AI

This is the stable server-side build.

- No remove.bg API
- No Leonardo API
- No Canva API
- No API key
- No credits
- No npm / Node build
- No browser AI CDN

Modes:
- Smart: detects flat black/white graphic backgrounds and uses a fast edge-preserving transparency algorithm.
- Graphic: forces the fast graphic algorithm.
- Portrait: forces local AI.

Quality:
- Fast: u2netp
- HD: birefnet-general-lite

The first AI image can be slower because rembg downloads the selected model into the Railway container. After the model is cached in the running container, later images are faster.

Health endpoint:
`/health`

Expected:
`{"ok":true,"engine":"railway-local-ai","externalPaidApi":false,"paidApiKeyRequired":false}`
