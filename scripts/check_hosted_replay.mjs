import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { handle } from '../apps/web/deployment/replay.mjs';

const get = (path, method = 'GET') => handle(new Request('http://replay.test' + path, { method }));
const sha = async (response) => createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex');
const demo = await (await get('/api/v1/demo/geographic')).json();
assert.equal(demo.mode, 'synthetic');
const base = '/api/v1/assessments/' + demo.assessment_id;
const pkg = await (await get(base + '/package')).json();
assert.equal(await sha(await get(pkg.assessment_uri)), pkg.assessment_sha256);
for (const asset of pkg.assets) assert.equal(await sha(await get(asset.uri)), asset.sha256);
assert.equal((await get(base + '/report?language=ne')).status, 501);
assert.equal((await (await get(base + '/brief?format=json&language=ne')).json()).translation_reviewed, false);
assert.equal((await (await get('/api/v1/readiness')).json()).live_configured, false);
assert.equal((await get('/api/v1/assessments', 'POST')).status, 503);
assert.equal((await get(base + '/copilot', 'POST')).status, 503);
assert.equal((await get('/api/v1/demo/geographic', 'POST')).status, 405);
assert.equal((await get('/api/v1/unknown')).status, 404);
// Exercise the Vercel rewrite shape and forwarded brief query.
assert.equal((await (await get('/api/replay?__tads_route=/api/v1/demo/geographic')).json()).assessment_id, demo.assessment_id);
assert.equal((await (await get('/api/replay?__tads_route=' + base + '/brief&format=json&language=en')).json()).language, 'en');
console.log('Hosted synthetic replay: exact hashes, typed briefs, explicit failures and rewrite routes pass.');
