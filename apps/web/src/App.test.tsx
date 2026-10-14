import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { createClient } from './api/client';
import uiFixture from './fixtures/synthetic-ui-assessment.json';
import { GEO_ID, SNAPSHOT, geographicApi, type Router } from './test/fakeApi';
import { resetDbForTests } from './offline/packageStore';

// MapLibre needs WebGL, which jsdom lacks. The stub records what the map was
// asked to draw; Playwright covers the real map.
const mapProps = vi.hoisted(() => ({ current: null as null | Record<string, unknown> }));
vi.mock('./map/MapView', () => ({
  default: (props: Record<string, unknown>) => {
    mapProps.current = props;
    return <div data-testid="map" />;
  },
}));

const shared = JSON.parse(readFileSync(resolve(__dirname, '../../../fixtures/synthetic/assessment.json'), 'utf8'));
const radar = () => mapProps.current?.radar as { images: Array<{ asset: { role: string; acquired_at: string }; url: string }>; view: string; opacity: number };

// Routes for the legacy fixture-backed flows (bundled UI fixture served by API).
const legacy: Router = (url) => {
  if (url === '/api/v1/assessments') return { status: 200, body: { job_id: 'j1', status: 'completed', assessment_id: 'synthetic-ui-geometry-001', mode: 'synthetic' } };
  if (url === '/api/v1/assessments/synthetic-ui-geometry-001') return { status: 200, body: uiFixture };
  if (url === '/api/v1/assessments/synthetic-ui-geometry-001/package') return { status: 404, body: { error: { code: 'assessment_not_found', message: 'no package', retryable: false } } };
  if (url === '/api/v1/demo') return { status: 200, body: shared };
  return undefined;
};

async function setup(extra?: Router) {
  const api = await geographicApi(async (url, init) => (extra && (await extra(url, init))) ?? legacy(url, init));
  const user = userEvent.setup();
  render(<App client={createClient({ fetchImpl: api.fetchImpl })} />);
  return { user, ...api };
}

async function openOther(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(screen.getByText('Other test data'));
  await user.click(screen.getByRole('button', { name }));
}

beforeEach(() => {
  mapProps.current = null;
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true });
});

describe('assessment workspace', () => {
  it('U01: computed API demo loads populated layers with provenance badges', async () => {
    const { user } = await setup();
    await user.click(screen.getByRole('button', { name: 'Load computed demo (synthetic)' }));
    expect(await screen.findByTestId('mode-badge')).toHaveTextContent('SYNTHETIC');
    expect(screen.getByTestId('channel-badge')).toHaveTextContent('Received from API');
    const a = mapProps.current?.assessment as typeof SNAPSHOT;
    expect(a.assessment_id).toBe(GEO_ID);
    expect(a.layers.roads.features.length).toBeGreaterThan(0);
    expect(a.layers.flood.features.length).toBeGreaterThan(0);
  });

  it('U01: legacy API fixture and bundled fixture remain separate, labelled paths', async () => {
    const { user } = await setup();
    await openOther(user, 'Load legacy API fixture (no geometry)');
    expect(await screen.findByTestId('mode-badge')).toHaveTextContent('SYNTHETIC');
    expect((mapProps.current?.assessment as { assessment_id: string }).assessment_id).toBe('synthetic-training-001');
    await user.click(screen.getByRole('button', { name: 'New assessment' }));
    await openOther(user, 'Open bundled UI fixture (no API)');
    expect(screen.getByTestId('channel-badge')).toHaveTextContent('Bundled UI fixture');
  });

  it('shows readiness as configuration only', async () => {
    await setup();
    expect(await screen.findByTestId('readiness')).toHaveTextContent('AI not configured');
    expect(screen.getByTestId('readiness')).toHaveTextContent('Configured does not mean tested');
    expect(document.querySelector('input[type=password], input[name*=key i]')).toBeNull();
  });

  it('readiness can report a configured local model without claiming it was tested', async () => {
    await setup((url) =>
      url === '/api/v1/readiness'
        ? { status: 200, body: { satellite_configured: true, historical_osm_configured: true, ai_configured: true, live_configured: true } }
        : undefined,
    );
    const r = await screen.findByTestId('readiness');
    expect(r).toHaveTextContent('satellite configured, historical OSM configured, AI configured');
    expect(r).toHaveTextContent('Configured does not mean tested');
  });

  it('a LIVE assessment (constructed, not a recording) shows LIVE, real attributions and no synthetic banner', async () => {
    const live = structuredClone(SNAPSHOT);
    live.mode = 'live';
    live.assessment_id = 'live-constructed-001';
    live.sources = live.sources.map((src: Record<string, string>) => ({
      ...src,
      kind: src.source_id.includes('radar') ? 'sentinel_1' : src.source_id.startsWith('osm') ? 'osm' : 'dem',
      uri: `/api/v1/assessments/live-constructed-001/sources/${src.source_id}`,
    }));
    const { user } = await setup((url) => {
      if (url === '/api/v1/demo/geographic') return { status: 200, body: live };
      if (url.startsWith('/api/v1/assessments/live-constructed-001/')) return { status: 404, body: { error: { code: 'not_found', message: 'n', retryable: false } } };
      return undefined;
    });
    await user.click(screen.getByRole('button', { name: 'Load computed demo (synthetic)' }));
    expect(await screen.findByTestId('mode-badge')).toHaveTextContent('LIVE');
    expect(screen.queryByText(/Synthetic data\. Invented geometry/)).toBeNull();
    expect(await screen.findByTestId('imagery-unavailable')).toBeInTheDocument();
  });

  it('validates bbox order', async () => {
    const { user } = await setup();
    const west = screen.getByRole('textbox', { name: /West/ });
    await user.clear(west);
    await user.type(west, '85.30');
    await user.click(screen.getByRole('button', { name: 'Run assessment' }));
    expect(screen.getByRole('alert')).toHaveTextContent('West must be less than east');
  });

  it('U04: live provider failure is explicit, with no fixture substitution', async () => {
    const { user } = await setup((url) =>
      url === '/api/v1/assessments'
        ? { status: 503, body: { error: { code: 'live_provider_unavailable', message: 'Live satellite/OSM providers are not connected.', retryable: false } } }
        : undefined,
    );
    await user.click(screen.getByRole('button', { name: 'Run assessment' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Live providers unavailable');
    expect(alert).toHaveTextContent('No synthetic substitute is shown');
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
    expect(mapProps.current).toBeNull();
  });

  it('U04: network failure is recoverable via retry', async () => {
    let fail = true;
    const { user } = await setup((url) => (fail && url === '/api/v1/assessments' ? 'network-error' : undefined));
    await user.click(screen.getByRole('button', { name: 'Run assessment' }));
    expect(await screen.findByText('API unreachable')).toBeInTheDocument();
    fail = false;
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByTestId('mode-badge')).toHaveTextContent('SYNTHETIC');
  });

  it('U04: cancel stops the request and shows no results', async () => {
    const { user } = await setup((url, init) =>
      url === '/api/v1/assessments'
        ? new Promise((_, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))))
        : undefined,
    );
    await user.click(screen.getByRole('button', { name: 'Run assessment' }));
    expect(await screen.findByText(/submitting request/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(await screen.findByText('Cancelled. No results are shown.')).toBeInTheDocument();
    expect(mapProps.current).toBeNull();
  });

  it('U04: an empty completed assessment is a stated state, not a clean bill', async () => {
    const empty = { ...shared, settlements: [], summary: { ...shared.summary, potentially_isolated_count: 0 } };
    const { user } = await setup((url) => (url === '/api/v1/demo' ? { status: 200, body: empty } : undefined));
    await openOther(user, 'Load legacy API fixture (no geometry)');
    expect(await screen.findByText(/completed with no features or settlements/)).toHaveTextContent('not evidence that the area is unaffected');
  });

  it('refuses an unsupported schema version', async () => {
    const { user } = await setup((url) => (url === '/api/v1/demo/geographic' ? { status: 200, body: { ...SNAPSHOT, schema_version: '9.0.0' } } : undefined));
    await user.click(screen.getByRole('button', { name: 'Load computed demo (synthetic)' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Unsupported schema version');
  });

  it('U02: computed demo selection highlights the exact route and cut edge IDs', async () => {
    const { user } = await setup();
    await user.click(screen.getByRole('button', { name: 'Load computed demo (synthetic)' }));
    await user.click(await screen.findByTestId('settlement-training-village-west'));
    expect(mapProps.current?.highlight).toEqual({
      baseline: ['training-road-west:0:1', 'training-bridge:0:0', 'training-road-east:0:0', 'training-road-east:0:1'],
      post: [],
      cut: ['training-road-west:0:1', 'training-bridge:0:0'],
      selected: ['training-village-west'],
    });
    const inspector = screen.getByTestId('inspector');
    expect(within(inspector).getByTestId('inspector-status')).toHaveTextContent('Potentially isolated');
    expect(within(inspector).queryByText(/mark safe/i)).toBeNull();
    expect(within(inspector).getByTestId('decision')).toHaveTextContent(
      'If the secondary road and the bridge are impassable, no mapped route to Training hospital or any other facility remains.',
    );
    await user.click(within(inspector).getByRole('button', { name: 'Open cited brief' }));
    expect(screen.getByRole('tab', { name: 'Report' })).toHaveAttribute('aria-selected', 'true');
  });

  it('facility points open facility evidence, not an absent settlement result', async () => {
    const { user } = await setup();
    await user.click(screen.getByRole('button', { name: 'Load computed demo (synthetic)' }));
    await user.click(await screen.findByTestId('facility-training-hospital'));
    const inspector = screen.getByTestId('inspector');
    expect(within(inspector).getByRole('heading', { level: 2 })).toHaveTextContent('Training hospital');
    expect(within(inspector).getByTestId('inspector-status')).toHaveTextContent('hospital');
    expect(inspector).toHaveTextContent('Nearest facility before the event for');
    expect(within(inspector).getByRole('button', { name: 'Training settlement West' })).toBeInTheDocument();
    expect(within(inspector).getByTestId('evidence-exposure-001')).toBeInTheDocument();
    expect(inspector).not.toHaveTextContent('no connectivity result');
  });

  it('unknown-coverage roads are listed and described as unknown, not passable', async () => {
    const withUnknown = structuredClone(SNAPSHOT);
    withUnknown.layers.roads.features[0].properties.status = 'unknown';
    const { user } = await setup((url) => (url === '/api/v1/demo/geographic' || url === `/api/v1/assessments/${GEO_ID}` ? { status: 200, body: withUnknown } : undefined));
    await user.click(screen.getByRole('button', { name: 'Load computed demo (synthetic)' }));
    const id = withUnknown.layers.roads.features[0].id;
    await user.click(await screen.findByRole('button', { name: new RegExp(`unknown.*${id}`) }));
    expect(within(screen.getByTestId('inspector')).getByTestId('inspector-status')).toHaveTextContent('unknown coverage — not known to be passable or blocked');
  });

  it('U03: radar comparison uses verified PNG bytes, manifest corners and both dates', async () => {
    const { user, pkg } = await setup();
    await user.click(screen.getByRole('button', { name: 'Load computed demo (synthetic)' }));
    await waitFor(() => expect(radar().images).toHaveLength(2));
    expect(screen.getByTestId('scene-date-before_radar')).toHaveTextContent('2026-08-20 00:00Z');
    expect(screen.getByTestId('scene-date-after_radar')).toHaveTextContent('2026-09-01 00:00Z');
    const after = radar().images.find((i) => i.asset.role === 'after_radar')!;
    expect(after.url).toMatch(/^blob:/);
    expect((after.asset as unknown as { coordinates: unknown }).coordinates).toEqual(pkg.assets[1].coordinates);
    expect(radar().view).toBe('after');
    const radarControl = screen.getByTestId('radar-control');
    expect(within(radarControl).getByRole('button', { name: /^After/ })).toHaveTextContent('2026-09-01');
    await user.click(within(radarControl).getByRole('button', { name: /^Before/ }));
    expect(radar().view).toBe('before');
    expect(screen.getByTestId('scene-date-after_radar')).toHaveTextContent('2026-09-01');
    await user.click(within(radarControl).getByRole('button', { name: 'Hide' }));
    expect(radar().view).toBe('off');
    expect(within(radarControl).getByTestId('radar-state')).toHaveTextContent('hidden');
  });

  it('readable cut labels keep exact IDs; a remaining route is never called safe', async () => {
    const { user } = await setup();
    await user.click(screen.getByRole('button', { name: 'Load computed demo (synthetic)' }));
    await user.click(await screen.findByTestId('settlement-training-village-west'));
    const cuts = within(screen.getByTestId('inspector')).getByRole('list', { name: 'Candidate cut edges' });
    const bridge = within(cuts).getByRole('button', { name: /Bridge · 240 m, 229 m exposed.*training-bridge:0:0/ });
    expect(bridge).toBeInTheDocument();
    await user.click(bridge);
    const edge = screen.getByTestId('inspector');
    expect(within(edge).getByRole('heading', { level: 2 })).toHaveTextContent('Bridge · 240 m, 229 m exposed');
    expect(within(edge).getByTestId('edge-consequence')).toHaveTextContent('no mapped alternate route remains for Training settlement West');
    expect(edge).toHaveTextContent('osm-2026-08-25 · acquired 2026-08-25');
    expect(mapProps.current?.highlight).toMatchObject({ selected: ['training-bridge:0:0'] });
    await user.click(screen.getByTestId('settlement-training-village-east'));
    const inspector = screen.getByTestId('inspector');
    expect(within(inspector).getByTestId('inspector-status')).toHaveTextContent('Mapped route remains');
    expect(inspector).toHaveTextContent('not a safety');
    expect(inspector.textContent).not.toMatch(/\bis safe\b|\bsafe route\b/i);
  });

  it('shows an explicit no-facility state when the area maps no facility', async () => {
    const noFac = structuredClone(SNAPSHOT);
    noFac.layers.settlements.features = noFac.layers.settlements.features.filter((f: { properties: { kind: string } }) => f.properties.kind !== 'facility');
    noFac.settlements = noFac.settlements.map((x: Record<string, unknown>) => ({ ...x, status: 'unknown_network', baseline_facility_id: null, post_event_facility_id: null, baseline_route_edge_ids: [], post_event_route_edge_ids: [], candidate_cut_edge_ids: [], any_facility_access: null }));
    noFac.summary = { ...noFac.summary, potentially_isolated_count: 0, unknown_network_count: 3 };
    const { user } = await setup((url) => (url === '/api/v1/demo/geographic' ? { status: 200, body: noFac } : undefined));
    await user.click(screen.getByRole('button', { name: 'Load computed demo (synthetic)' }));
    expect(await screen.findByTestId('no-facility')).toHaveTextContent('No hospital or clinic is mapped');
  });

  it('U03: no package or empty asset list shows imagery unavailable, never a substitute', async () => {
    const { user } = await setup((url) => (url.endsWith('/package') ? { status: 404, body: { error: { code: 'assessment_not_found', message: 'none', retryable: false } } } : undefined));
    await user.click(screen.getByRole('button', { name: 'Load computed demo (synthetic)' }));
    expect(await screen.findByTestId('imagery-unavailable')).toHaveTextContent('no package');
    expect(radar().images).toEqual([]);
    expect(within(screen.getByTestId('radar-control')).getByTestId('radar-state')).toHaveTextContent('unavailable');
    expect(within(screen.getByTestId('radar-control')).queryByRole('button', { name: /^Before/ })).toBeNull();
  });

  it('U03: a PNG that fails its hash is not drawn', async () => {
    const { user } = await setup((url) => (url.endsWith('/imagery/before') ? { status: 200, bytes: new Uint8Array([0, 1]) } : undefined));
    await user.click(screen.getByRole('button', { name: 'Load computed demo (synthetic)' }));
    expect(await screen.findByTestId('imagery-error')).toHaveTextContent('SHA-256');
    expect(radar().images).toEqual([]);
  });

  it('revokes old image object URLs when the assessment changes', async () => {
    const revoke = vi.spyOn(URL, 'revokeObjectURL');
    const { user } = await setup();
    await user.click(screen.getByRole('button', { name: 'Load computed demo (synthetic)' }));
    await waitFor(() => expect(radar().images).toHaveLength(2));
    const urls = radar().images.map((i) => i.url);
    await user.click(screen.getByRole('button', { name: 'New assessment' }));
    await openOther(user, 'Open bundled UI fixture (no API)');
    await waitFor(() => expect(radar().images).toEqual([]));
    for (const u of urls) expect(revoke).toHaveBeenCalledWith(u);
    revoke.mockRestore();
  });

  it('U05: preexisting/unknown statuses keep separate labels (bundled fixture)', async () => {
    const { user } = await setup();
    await openOther(user, 'Open bundled UI fixture (no API)');
    await user.click(screen.getByTestId('settlement-training-settlement-c'));
    expect(within(screen.getByTestId('inspector')).getByTestId('inspector-status')).toHaveTextContent('Disconnected before event');
    await user.click(screen.getByTestId('settlement-training-settlement-d'));
    expect(within(screen.getByTestId('inspector')).getByTestId('inspector-status')).toHaveTextContent('Unknown network');
  });

  it('X01: tabs, list selection and inspector close work from the keyboard', async () => {
    const { user } = await setup();
    await openOther(user, 'Open bundled UI fixture (no API)');
    screen.getByTestId('settlement-training-settlement-a').focus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('heading', { level: 2, name: 'Settlement A (synthetic)' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByTestId('inspector')).toBeNull();
    screen.getByRole('tab', { name: 'Assessment' }).focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Report' })).toHaveFocus();
  });
});

describe('brief and copilot', () => {
  async function toReport(extra?: Router) {
    const ctx = await setup(extra);
    await ctx.user.click(screen.getByRole('button', { name: 'Load computed demo (synthetic)' }));
    await screen.findByTestId('mode-badge');
    await ctx.user.click(screen.getByRole('tab', { name: 'Report' }));
    return ctx;
  }

  it('U06: brief shows backend facts, template label and cited evidence', async () => {
    const { user } = await toReport();
    const rep = await screen.findByTestId('report');
    expect(within(rep).getByTestId('report-generator')).toHaveTextContent('Deterministic template — not AI');
    const row = rep.querySelector('[data-fact="potentially_isolated_count"]')!;
    expect(row).toHaveTextContent('1');
    expect(row).toHaveTextContent('yes');
    expect(screen.getByTestId('reviewed-status')).toHaveTextContent('Reviewed English report: available');
    await user.click(within(rep).getAllByRole('button', { name: 'Open evidence exposure-001' })[0]);
    expect(screen.getByRole('heading', { level: 2, name: 'Evidence exposure-001' })).toHaveFocus();
  });

  it('Nepali brief carries a visible draft badge; reviewed Nepali stays not ready', async () => {
    const { user } = await toReport();
    await user.click(await screen.findByRole('button', { name: /Nepali/ }));
    expect(await screen.findByTestId('draft-badge')).toHaveTextContent('DRAFT — translation not reviewed');
    expect(screen.getByTestId('report')).toHaveAttribute('lang', 'ne');
    await waitFor(() => expect(screen.getByTestId('reviewed-status')).toHaveTextContent('not ready — fluent review pending'));
  });

  it('copilot sends the selected assessment, question and language; 503 no-key is shown honestly', async () => {
    const { user, calls } = await toReport();
    await user.type(await screen.findByRole('textbox', { name: 'Question' }), 'Which settlements may be isolated?');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Answer language' }), 'ne');
    await user.click(screen.getByRole('button', { name: 'Ask' }));
    expect(await screen.findByTestId('copilot-not-configured')).toHaveTextContent('No answer was generated');
    const call = calls.find((c) => c.url.endsWith('/copilot'))!;
    expect(call.url).toBe(`/api/v1/assessments/${GEO_ID}/copilot`);
    expect(JSON.parse(String(call.init!.body))).toEqual({ question: 'Which settlements may be isolated?', language: 'ne' });
    expect(screen.queryByTestId('copilot-answer')).toBeNull();
  });

  const answer = (over: Record<string, unknown> = {}) => ({
    assessment_id: GEO_ID,
    mode: 'synthetic',
    generator: 'llm_fact_selection',
    ai_ready: true,
    language: 'en',
    facts: { potentially_isolated_count: 1 },
    claims: [{ claim_id: 'c1', text: 'Training settlement West may be isolated.', evidence_ids: ['network-001'] }],
    limitations: [],
    model: 'llama3.1:8b',
    refused: false,
    answer: '1 mapped settlement may be isolated.',
    translation_reviewed: true,
    ...over,
  });

  it('copilot AI answer shows generator/model and opens citations', async () => {
    const { user } = await toReport((url) => (url.endsWith('/copilot') ? { status: 200, body: answer() } : undefined));
    await user.type(await screen.findByRole('textbox', { name: 'Question' }), 'Which settlements?');
    await user.click(screen.getByRole('button', { name: 'Ask' }));
    const ans = await screen.findByTestId('copilot-answer');
    expect(within(ans).getByTestId('copilot-generator')).toHaveTextContent('AI: llm_fact_selection · llama3.1:8b');
    await user.click(within(ans).getByRole('button', { name: 'Open evidence network-001' }));
    expect(screen.getByRole('heading', { level: 2, name: 'Evidence network-001' })).toBeInTheDocument();
  });

  it('copilot refusal is labelled and shows no claims', async () => {
    const { user } = await toReport((url) =>
      url.endsWith('/copilot') ? { status: 200, body: answer({ refused: true, answer: 'Casualty estimates are not supported.', claims: [] }) } : undefined,
    );
    await user.type(await screen.findByRole('textbox', { name: 'Question' }), 'How many people died?');
    await user.click(screen.getByRole('button', { name: 'Ask' }));
    const ans = await screen.findByTestId('copilot-answer');
    expect(within(ans).getByTestId('copilot-refused')).toHaveTextContent('Refused');
    expect(ans).toHaveTextContent('Casualty estimates are not supported.');
  });

  it('malformed copilot output is rejected, not displayed', async () => {
    const { user } = await toReport((url) => (url.endsWith('/copilot') ? { status: 200, body: { answer: '<b>99 isolated</b>' } } : undefined));
    await user.type(await screen.findByRole('textbox', { name: 'Question' }), 'x');
    await user.click(screen.getByRole('button', { name: 'Ask' }));
    expect(await screen.findByText('Invalid API response')).toBeInTheDocument();
    expect(screen.queryByText(/99 isolated/)).toBeNull();
  });

  it('an answer for another assessment is discarded', async () => {
    const { user } = await toReport((url) => (url.endsWith('/copilot') ? { status: 200, body: answer({ assessment_id: 'other-area' }) } : undefined));
    await user.type(await screen.findByRole('textbox', { name: 'Question' }), 'x');
    await user.click(screen.getByRole('button', { name: 'Ask' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(`belongs to other-area, not ${GEO_ID}; discarded`);
    expect(screen.queryByTestId('copilot-answer')).toBeNull();
  });

  it('a stale answer never appears after switching to another assessment', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const { user } = await toReport(async (url) => {
      if (!url.endsWith('/copilot')) return undefined;
      await gate;
      return { status: 200, body: answer() };
    });
    await user.type(await screen.findByRole('textbox', { name: 'Question' }), 'x');
    await user.click(screen.getByRole('button', { name: 'Ask' }));
    await user.click(screen.getByRole('tab', { name: 'Assessment' }));
    await user.click(screen.getByRole('button', { name: 'New assessment' }));
    await openOther(user, 'Open bundled UI fixture (no API)');
    release();
    await user.click(screen.getByRole('tab', { name: 'Report' }));
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByTestId('copilot-answer')).toBeNull();
    expect(screen.getByText(/has no backend brief/)).toBeInTheDocument();
  });

  it('T10: switching area aborts the pending copilot request', async () => {
    const { user, calls } = await toReport((url, init) =>
      url.endsWith('/copilot') ? new Promise((_, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))) : undefined,
    );
    await user.type(await screen.findByRole('textbox', { name: 'Question' }), 'x');
    await user.click(screen.getByRole('button', { name: 'Ask' }));
    await screen.findByText(/Asking about/);
    const pending = calls.find((c) => c.url.endsWith('/copilot'))!;
    expect(pending.init!.signal!.aborted).toBe(false);
    await user.click(screen.getByRole('tab', { name: 'Assessment' }));
    expect(pending.init!.signal!.aborted).toBe(true);
  });

  it('T10: an HTML export pending when the language changes is never downloaded', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    const { user } = await toReport(async (url) => {
      if (!url.includes('format=html')) return undefined;
      await gate;
      return { status: 200, bytes: new TextEncoder().encode('<!doctype html><title>old</title>'), contentType: 'text/html' };
    });
    await screen.findByTestId('report');
    await user.click(screen.getByRole('button', { name: 'Download brief (HTML)' }));
    expect(await screen.findByRole('button', { name: 'Preparing HTML…' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: /Nepali/ }));
    release();
    await new Promise((r) => setTimeout(r, 30));
    expect(click).not.toHaveBeenCalled();
    click.mockRestore();
  });

  it('T10: an HTML export completes normally for the current area and language', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe(`${GEO_ID}-en-brief.html`);
    });
    const { user } = await toReport();
    await screen.findByTestId('report');
    await user.click(screen.getByRole('button', { name: 'Download brief (HTML)' }));
    await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
    click.mockRestore();
  });

  it('T10/T04: a package save can be cancelled mid-download and saves nothing', async () => {
    const { user, calls } = await setup((url, init) =>
      url.endsWith('/imagery/after')
        ? new Promise((_, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))))
        : undefined,
    );
    indexedDB.deleteDatabase('tads-flood');
    await user.click(screen.getByRole('button', { name: 'Load computed demo (synthetic)' }));
    await screen.findByTestId('mode-badge');
    await user.click(screen.getByRole('tab', { name: 'Offline & mission' }));
    await user.click(await screen.findByRole('button', { name: 'Save current assessment as offline package' }));
    await user.click(await screen.findByRole('button', { name: 'Cancel save' }));
    expect(await screen.findByText('Save cancelled. Nothing was saved.')).toBeInTheDocument();
    // The last request for that image is the package save's (the map's own
    // scene download is separate and is not cancelled by a save).
    expect(calls.filter((c) => c.url.endsWith('/imagery/after')).at(-1)!.init!.signal!.aborted).toBe(true);
    expect(screen.queryByTestId('package-item')).toBeNull();
  });

  it('source/OSM strings render as text, never HTML', async () => {
    const evil = structuredClone(SNAPSHOT);
    evil.settlements[0].reason = '<img src=x onerror="window.__pwned=1">';
    const { user } = await setup((url) => (url === '/api/v1/demo/geographic' ? { status: 200, body: evil } : undefined));
    await user.click(screen.getByRole('button', { name: 'Load computed demo (synthetic)' }));
    await user.click(await screen.findByTestId('settlement-training-village-west'));
    expect(screen.getByTestId('inspector')).toHaveTextContent('<img src=x');
    expect(screen.getByTestId('inspector').querySelector('img')).toBeNull();
  });
});

describe('offline panel', () => {
  it('keeps the simulation collapsed and off the map until requested', async () => {
    const { user } = await setup();
    await openOther(user, 'Open bundled UI fixture (no API)');
    await user.click(screen.getByRole('tab', { name: 'Offline & mission' }));
    await user.click(screen.getByRole('button', { name: 'Save current assessment as offline package' }));
    const toggle = await screen.findByText('Simulated inspection (optional)');
    expect(screen.queryByRole('button', { name: 'Start simulation' })).toBeNull();
    expect(mapProps.current?.mission).toBeNull();
    await user.click(toggle);
    await user.click(await screen.findByRole('button', { name: 'Start simulation' }));
    expect(screen.getByTestId('mission-internet')).toHaveTextContent('Internet: online');
    expect(screen.getByTestId('link-badge')).toHaveTextContent('Drone radio link: connected');
    await waitFor(() => expect(mapProps.current?.mission).not.toBeNull());
  });
});

describe('offline start', () => {
  it('O08: offline without a package shows an explicit missing-package screen', async () => {
    await resetDbForTests();
    await new Promise((resolve, reject) => {
      const req = indexedDB.deleteDatabase('tads-flood');
      req.onsuccess = resolve;
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('Test database still has an open connection'));
    });
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
    await setup();
    await waitFor(() => expect(screen.getByTestId('offline-no-package')).toHaveTextContent('No offline package exists in this browser'));
    expect(screen.getByTestId('internet-badge')).toHaveTextContent('offline');
    expect(screen.getByRole('button', { name: 'Run assessment' })).toBeDisabled();
  });
});
