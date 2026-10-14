# Free access setup

Only server configuration belongs in `.env`; never paste secrets into chat or
put them in VITE_* settings. The project ignores `.env` in Git. The local template
is `/Users/prakharsingh/Documents/TADS_Project/tads-flood/.env`.

## 1. Copernicus Data Space: satellite and DEM processing

Create a free Copernicus Data Space account at https://dataspace.copernicus.eu/
and complete email verification. Open https://shapps.dataspace.copernicus.eu/dashboard/,
User Settings -> OAuth clients -> Create. Name the client TADS Flood. This is a
server application, so leave the SPA/frontend option off. Choose an expiry long
enough for judging. Copy the client ID and client secret (the secret is shown
once) into CDSE_CLIENT_ID and CDSE_CLIENT_SECRET in the ignored `.env`.

Official OAuth steps:
https://documentation.dataspace.copernicus.eu/APIs/SentinelHub/Overview/Authentication.html
Free general-user allowance currently includes 10,000 requests and 10,000
processing units per month for Sentinel Hub; fair-use and per-minute limits apply:
https://documentation.dataspace.copernicus.eu/Quotas.html
Do not use a separate paid Sentinel Hub trial account in place of CDSE credentials.
Our code uses the CDSE identity and processing endpoints.

## 2. HeiGIT / ohsome: historical OpenStreetMap

Sign up at https://account.heigit.org/signup and obtain the ohsome API key from
the account portal. Put it in OHSOME_API_KEY. The provider documents free-tier
keys; free quota is limited and larger quota requires contacting the provider.
https://docs.ohsome.org/ohsome-api/v2/migration_guide.html
This is the API for pre-event roads/buildings/facilities, not a current-OSM fallback.
The adapter sends the key as the documented Authorization header.

## 3. AI without a paid API

Ollama is already running on this Mac, with phi3:mini and llama3.1:8b installed.
Codex adds native structured-output support, confined to literal loopback origins.
No model download or API key is required for the local path. Configure:

    LLM_PROVIDER=ollama
    LLM_MODEL=llama3.1:8b
    LLM_BASE_URL=http://127.0.0.1:11434
    LLM_API_KEY=

Initial local check: llama3.1:8b selected the correct isolation summary fact on
the computed synthetic scene. phi3:mini refused that supported question; its
refusal is a recorded quality failure, so it is not the recommended model.
Broader actual model execution and relevance are checked separately; schema compliance
alone is not correctness. Nepali wording still requires fluent human review.
Ollama reference: https://docs.ollama.com/capabilities/structured-outputs
A Vercel website cannot access a model bound to this Mac's loopback interface.

Optional cloud alternative: create an API key at https://aistudio.google.com/apikey.
Google currently lists a free standard tier for gemini-2.5-flash-lite, subject to
account/region/rate limits. Stay on the free tier; no paid plan is needed for this
prototype. Compatibility must be verified with the issued key before claiming
successful cloud inference. Do not use confidential inputs on this free tier:
Google's pricing page says free-tier data may be used to improve its products.
https://ai.google.dev/gemini-api/docs/pricing
https://ai.google.dev/gemini-api/docs/api-key

## 4. Optional hosting account

Vercel Hobby is free for personal, noncommercial projects:
https://vercel.com/docs/plans/hobby
Sign up using the GitHub account that owns tads-flood. The frontend can be hosted
there. This API currently needs persistent state and background workers, so
frontend hosting alone does not supply a working backend. Codex prepares the
configuration; no deployment or paid hosting is automatically created.

## 5. Human review

A fluent Nepali speaker can review the generated draft for preserved names,
quantities, citations and uncertainty. Record reviewer/date/scope; never just
remove the DRAFT badge. The required official-reference event correspondence
also needs verification. No keys can replace those checks.

Once the Copernicus/ohsome values are saved, tell Codex only "credentials configured".
Codex can validate booleans and make bounded real requests without printing keys.
