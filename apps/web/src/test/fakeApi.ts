// Deterministic backend double built from responses recorded from Codex's API
// (synthetic geographic demo). The snapshot is served as its exact file bytes,
// which differ from JSON.stringify of the parsed object.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { vi } from 'vitest';
import { sha256Bytes } from '../domain/scenes';

const dir = resolve(__dirname, '../fixtures');
export const SNAPSHOT_BYTES = new Uint8Array(readFileSync(resolve(dir, 'api-geographic-snapshot.json')));
export const SNAPSHOT = JSON.parse(new TextDecoder().decode(SNAPSHOT_BYTES));
export const GEO_ID: string = SNAPSHOT.assessment_id;
const RECORDED_PACKAGE = JSON.parse(readFileSync(resolve(dir, 'api-geographic-package.json'), 'utf8'));
export const BRIEF_NE = JSON.parse(readFileSync(resolve(dir, 'api-geographic-brief-ne.json'), 'utf8'));

// Stand-in PNG bytes (the signature plus a role marker); hashes are computed
// over exactly these bytes so the package manifest is self-consistent.
export const PNG = {
  before_radar: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 1, 1]),
  after_radar: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 2, 2, 2]),
};

export const BRIEF_EN = {
  ...BRIEF_NE,
  language: 'en',
  translation_reviewed: true,
  answer: '1 mapped settlement may be isolated if candidate-exposed road segments are impassable.',
  claims: [{ claim_id: 'summary/potentially_isolated', text: '1 mapped settlement may be isolated.', evidence_ids: ['exposure-001', 'network-001'] }],
};
export const REPORT_EN = {
  assessment_id: GEO_ID,
  mode: 'synthetic',
  generator: 'deterministic_template',
  ai_ready: false,
  language: 'en',
  facts: BRIEF_NE.facts,
  claims: BRIEF_EN.claims,
  limitations: ['Synthetic.'],
};

export function testBriefHtml(id = GEO_ID, mode = 'synthetic', language = 'en') {
  return `<!doctype html><html lang="${language}"><head><meta name="tads-assessment-id" content="${id}"><meta name="tads-mode" content="${mode}"><meta name="tads-language" content="${language}"><title>Test brief</title></head><body>Test brief</body></html>`;
}

export async function packageManifest(overrides: { beforeSha?: string } = {}) {
  return {
    ...RECORDED_PACKAGE,
    assessment: SNAPSHOT,
    assessment_sha256: await sha256Bytes(SNAPSHOT_BYTES),
    assets: RECORDED_PACKAGE.assets.map((a: { role: 'before_radar' | 'after_radar' }) => ({ ...a, sha256: a.role === 'before_radar' && overrides.beforeSha ? overrides.beforeSha : '' })),
  };
}

export type Reply = { status: number; body?: unknown; bytes?: Uint8Array; stream?: ReadableStream<Uint8Array>; contentType?: string } | 'network-error';
export type Router = (url: string, init?: RequestInit) => Reply | undefined | Promise<Reply | undefined>;

const err = (status: number, code: string, message: string) => ({ status, body: { error: { code, message, retryable: false } } });

export async function geographicApi(extra?: Router) {
  const pkg = await packageManifest();
  for (const a of pkg.assets) a.sha256 = await sha256Bytes(PNG[a.role as keyof typeof PNG]);
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const base: Router = (url) => {
    if (url === '/api/v1/readiness') return { status: 200, body: { satellite_configured: false, historical_osm_configured: false, ai_configured: false, live_configured: false, note: 'n' } };
    if (url === '/api/v1/demo/geographic') return { status: 200, body: SNAPSHOT };
    if (url === `/api/v1/assessments/${GEO_ID}`) return { status: 200, body: SNAPSHOT };
    if (url === `/api/v1/assessments/${GEO_ID}/package`) return { status: 200, body: pkg };
    if (url === `/api/v1/assessments/${GEO_ID}/snapshot`) return { status: 200, bytes: SNAPSHOT_BYTES, contentType: 'application/json' };
    if (url === `/api/v1/assessments/${GEO_ID}/imagery/before`) return { status: 200, bytes: PNG.before_radar, contentType: 'image/png' };
    if (url === `/api/v1/assessments/${GEO_ID}/imagery/after`) return { status: 200, bytes: PNG.after_radar, contentType: 'image/png' };
    if (url.startsWith(`/api/v1/assessments/${GEO_ID}/brief?language=en&format=json`)) return { status: 200, body: BRIEF_EN };
    if (url.startsWith(`/api/v1/assessments/${GEO_ID}/brief?language=ne&format=json`)) return { status: 200, body: BRIEF_NE };
    if (url.includes('/brief?') && url.includes('format=html')) return { status: 200, bytes: new TextEncoder().encode(testBriefHtml(GEO_ID, 'synthetic', url.includes('language=ne') ? 'ne' : 'en')), contentType: 'text/html' };
    if (url === `/api/v1/assessments/${GEO_ID}/report?language=en`) return { status: 200, body: REPORT_EN };
    if (url === `/api/v1/assessments/${GEO_ID}/report?language=ne`) return err(501, 'language_not_ready', 'Reviewed Nepali/AI generation is not implemented.');
    if (url === `/api/v1/assessments/${GEO_ID}/copilot`) return err(503, 'ai_not_configured', 'Configure a server-side model, endpoint and API key.');
    return err(404, 'not_found', `no route ${url}`);
  };
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    if (init?.signal?.aborted) throw new DOMException('aborted', 'AbortError');
    const r = (extra && (await extra(url, init))) ?? (await base(url, init))!;
    if (r === 'network-error') throw new TypeError('Failed to fetch');
    const payload = r.stream ?? r.bytes ?? (r.body === undefined ? '' : JSON.stringify(r.body));
    return new Response(payload as BodyInit, { status: r.status, headers: { 'content-type': r.contentType ?? 'application/json' } });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls, pkg };
}
