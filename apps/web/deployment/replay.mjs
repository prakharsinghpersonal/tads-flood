// A recorded synthetic API only. This profile never invokes providers/models.
import data from './replay-data.json' with { type: 'json' };

const headers = { 'Cache-Control': 'no-store', 'X-TADS-Mode': 'synthetic-replay' };
const error = (status, code, message) => Response.json({ error: { code, message, retryable: false } }, { status, headers });

export async function handle(request) {
  const url = new URL(request.url);
  const path = url.searchParams.get('__tads_route') ?? url.pathname;
  if (!(path === '/health' || path.startsWith('/api/v1/')) || path.includes('..') || path.includes('//')) {
    return error(400, 'invalid_request', 'Unknown replay route.');
  }
  if (request.method !== 'GET') {
    if (path.endsWith('/copilot')) return error(503, 'ai_not_configured', 'The public replay does not call a model. Run the Python API with a configured model.');
    if (path === '/api/v1/assessments') return error(503, 'live_provider_unavailable', 'The public site is a read-only synthetic replay. Use the Python API for a live assessment.');
    return error(405, 'read_only_replay', 'This hosting profile serves read-only synthetic results.');
  }
  if (path === '/api/v1/readiness') return Response.json({ satellite_configured: false, historical_osm_configured: false,
    ai_configured: false, live_configured: false, note: data.limits.join(' ') }, { headers });
  url.searchParams.delete('__tads_route');
  url.searchParams.sort();
  const query = url.searchParams.toString();
  const key = path + (query ? '?' + query : '');
  if (!Object.hasOwn(data.routes, key)) return error(404, 'assessment_not_found', 'This result is not in the synthetic replay.');
  const saved = data.routes[key];
  return new Response(Buffer.from(saved.body_base64, 'base64'), {
    status: saved.status, headers: { ...headers, 'Content-Type': saved.content_type },
  });
}
