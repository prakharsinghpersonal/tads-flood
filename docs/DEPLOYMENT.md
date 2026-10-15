# Deployment profiles

## Free Vercel demonstration

The Vercel profile serves the UI plus a read-only synthetic replay exported from
the actual Python pipeline. Both radar images, source details, EN/NE briefs,
hashed packages and offline reload work. Live provider/model calls are explicitly
unavailable in this profile; it never substitutes synthetic data for a live job.
All responses carry X-TADS-Mode: synthetic-replay, and the assessment stays SYNTHETIC.

Import the public repository into Vercel Hobby using your GitHub account. Choose
the implementation branch (currently PKS/data-engine), set Root Directory to
apps/web, Framework to Vite, Node.js to 22, install npm ci, build npm run build,
and output dist. apps/web/vercel.json includes the API/health rewrites. No source
or model credentials are required or should be added to this frontend project.
Do not accidentally deploy the older main planning branch before final integration.

The included Node function uses native Request/Response and serves only known
exported routes. It cannot fetch URLs, start jobs or invoke a model. Regenerate
its data deliberately with python scripts/export_hosted_replay.py. The local
checks are node scripts/check_hosted_replay.mjs and
python scripts/check_integration.py --hosted-replay. Actual Vercel publication
and a deployed-domain check remain human-authorized final steps.

Official references:
https://vercel.com/docs/plans/hobby
https://vercel.com/docs/functions/runtimes/node-js
https://vercel.com/docs/routing/rewrites

## Full live API

The Python API needs one persistent process, writable persistent storage and
background workers. It is not deployed as an ephemeral Vercel function. A Vercel
frontend can proxy /api/v1 and /health to a separately hosted HTTPS API while
preserving same-origin URLs, but that API needs its own hosting/runtime.

Dockerfile and scripts/serve.py are prepared for a container/VM. Configure secrets
in the API host, mount /data, and use one process. The container was not built on
this Mac because Docker's daemon is unavailable; do not claim it is deployed or
container-verified. The Python application and its actual source pipeline have
been verified locally independently of container packaging.

    docker build -t tads-flood-api .
    docker run --rm --env-file .env -e TADS_DATA_ROOT=/data -p 8000:8000 -v tads-flood-data:/data tads-flood-api

Ollama on this Mac is a local free model option. A public cloud API cannot reach
this Mac's loopback address. A deployed model needs a configured cloud endpoint
or a model running beside the API. Google currently offers a Gemini free tier;
see FREE_ACCESS_SETUP.md. No paid service is created automatically.

For judging, the reproducible local full-stack setup remains the primary
end-to-end implementation. A hosted synthetic replay is an accessible product
demo, not proof of live mapping accuracy or unfamiliar-area processing.
