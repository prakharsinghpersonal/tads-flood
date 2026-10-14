import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { createClient } from './api/client';
import uiFixture from './fixtures/synthetic-ui-assessment.json';

// MapLibre needs WebGL, which jsdom lacks. The stub records what the map was
// asked to draw so tests can assert on highlight state; Playwright covers the
// real map.
const mapProps = vi.hoisted(() => ({ current: null as null | Record<string, unknown> }));
vi.mock('./map/MapView', () => ({
  default: (props: Record<string, unknown>) => {
    mapProps.current = props;
    return <div data-testid="map" />;
  },
}));

const shared = JSON.parse(readFileSync(resolve(__dirname, '../../../fixtures/synthetic/assessment.json'), 'utf8'));
const report = JSON.parse(
  JSON.stringify({
    assessment_id: 'synthetic-ui-geometry-001',
    mode: 'synthetic',
    generator: 'deterministic_template',
    ai_ready: false,
    language: 'en',
    facts: { potentially_isolated_count: 1, unknown_network_count: 1 },
    claims: [{ claim_id: 'training-settlement-a', text: 'Settlement A may lose access.', evidence_ids: ['synthetic-exposure-001'] }],
    limitations: ['Synthetic.'],
  }),
);

type Route = (url: string, init?: RequestInit) => { status: number; body: unknown } | Promise<never>;
function fakeFetch(route: Route) {
  return vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const r = await route(String(url), init);
    return new Response(r.body === undefined ? '' : JSON.stringify(r.body), { status: r.status });
  }) as unknown as typeof fetch;
}

function setup(route: Route) {
  const client = createClient({ fetchImpl: fakeFetch(route) });
  const user = userEvent.setup();
  render(<App client={client} />);
  return { user };
}

const apiRoutes: Route = (url) => {
  if (url === '/api/v1/assessments') return { status: 200, body: { job_id: 'j1', status: 'completed', assessment_id: 'synthetic-ui-geometry-001', mode: 'synthetic' } };
  if (url.startsWith('/api/v1/assessments/synthetic-ui-geometry-001/report?language=en')) return { status: 200, body: report };
  if (url.includes('language=ne')) return { status: 501, body: { error: { code: 'language_not_ready', message: 'Reviewed Nepali/AI generation is not implemented.', retryable: false } } };
  if (url === '/api/v1/assessments/synthetic-ui-geometry-001') return { status: 200, body: uiFixture };
  if (url === '/api/v1/demo') return { status: 200, body: shared };
  return { status: 404, body: { error: { code: 'not_found', message: 'nope', retryable: false } } };
};

beforeEach(() => {
  mapProps.current = null;
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true });
});

describe('assessment workspace', () => {
  it('U01: shows an unambiguous provenance badge for an API synthetic demo', async () => {
    const { user } = setup(apiRoutes);
    await user.click(screen.getByRole('button', { name: 'Load API synthetic demo' }));
    expect(await screen.findByTestId('mode-badge')).toHaveTextContent('SYNTHETIC');
    expect(screen.getByTestId('channel-badge')).toHaveTextContent('Received from API');
    expect(screen.getByRole('note')).toHaveTextContent(/Synthetic data/);
    expect((mapProps.current?.assessment as { bbox: number[] }).bbox).toEqual([85.25, 27.85, 85.27, 27.87]);
  });

  it('validates bbox order and refuses live requests while offline', async () => {
    const { user } = setup(apiRoutes);
    const west = screen.getByRole('textbox', { name: /West/ });
    await user.clear(west);
    await user.type(west, '85.30');
    await user.click(screen.getByRole('button', { name: 'Run assessment' }));
    expect(screen.getByRole('alert')).toHaveTextContent('West must be less than east');
  });

  it('U04: live provider failure is an explicit error with no fixture substitution', async () => {
    const { user } = setup(() => ({
      status: 503,
      body: { error: { code: 'live_provider_unavailable', message: 'Live satellite/OSM providers are not connected.', retryable: false } },
    }));
    await user.click(screen.getByRole('button', { name: 'Run assessment' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Live providers unavailable');
    expect(alert).toHaveTextContent('No synthetic substitute is shown');
    expect(screen.queryByTestId('mode-badge')).toBeNull();
    expect(mapProps.current).toBeNull();
  });

  it('U04: network failure is recoverable via retry', async () => {
    let fail = true;
    const { user } = setup((url, init) => {
      if (fail) return Promise.reject(new TypeError('Failed to fetch'));
      return apiRoutes(url, init);
    });
    await user.click(screen.getByRole('button', { name: 'Run assessment' }));
    expect(await screen.findByText('API unreachable')).toBeInTheDocument();
    fail = false;
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByTestId('mode-badge')).toHaveTextContent('SYNTHETIC');
  });

  it('U04: cancel stops the request and shows no results', async () => {
    const { user } = setup((_url, init) => new Promise((_, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))));
    await user.click(screen.getByRole('button', { name: 'Run assessment' }));
    expect(await screen.findByRole('status')).toHaveTextContent('submitting request');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(await screen.findByText('Cancelled. No results are shown.')).toBeInTheDocument();
    expect(mapProps.current).toBeNull();
  });

  it('U04: an empty completed assessment is a stated state, not a clean bill', async () => {
    const empty = { ...shared, settlements: [], summary: { ...shared.summary, potentially_isolated_count: 0 } };
    const { user } = setup((url) => (url === '/api/v1/demo' ? { status: 200, body: empty } : { status: 404, body: {} }));
    await user.click(screen.getByRole('button', { name: 'Load API synthetic demo' }));
    expect(await screen.findByText(/completed with no features or settlements/)).toHaveTextContent('not evidence that the area is unaffected');
  });

  it('refuses an unsupported schema version', async () => {
    const { user } = setup(() => ({ status: 200, body: { ...shared, schema_version: '9.0.0' } }));
    await user.click(screen.getByRole('button', { name: 'Load API synthetic demo' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Unsupported schema version');
  });

  it('U02/U05: selecting settlements highlights exact route/cut and labels statuses distinctly', async () => {
    const { user } = setup(apiRoutes);
    await user.click(screen.getByRole('button', { name: 'Run assessment' }));
    await user.click(await screen.findByTestId('settlement-training-settlement-a'));
    expect(mapProps.current?.highlight).toEqual({
      baseline: ['road-a', 'bridge-a', 'road-h1'],
      post: [],
      cut: ['bridge-a'],
      selected: ['training-settlement-a'],
    });
    const inspector = screen.getByTestId('inspector');
    expect(within(inspector).getByTestId('inspector-status')).toHaveTextContent('Potentially isolated');
    expect(within(inspector).getByTestId('inspector-status')).toHaveTextContent('Not a verified closure');
    expect(within(inspector).getByTestId('evidence-synthetic-exposure-001')).toHaveTextContent('Synthetic');
    expect(within(inspector).queryByText(/mark safe/i)).toBeNull();

    await user.click(within(within(inspector).getByRole('list', { name: 'Candidate cut edges' })).getByRole('button', { name: 'bridge-a' }));
    expect(screen.getByRole('heading', { level: 2, name: 'bridge-a' })).toHaveFocus();
    expect(screen.getByTestId('inspector')).toHaveTextContent('candidate, not verified closure');

    await user.click(screen.getByTestId('settlement-training-settlement-c'));
    expect(within(screen.getByTestId('inspector')).getByTestId('inspector-status')).toHaveTextContent('Disconnected before event');
    expect(screen.getByTestId('inspector')).toHaveTextContent('not new flood impact');
    await user.click(screen.getByTestId('settlement-training-settlement-d'));
    expect(within(screen.getByTestId('inspector')).getByTestId('inspector-status')).toHaveTextContent('Unknown network');
    expect(screen.getByTestId('inspector')).toHaveTextContent('Access to any facility after eventUnknown');
  });

  it('U02: connected settlement exposes alternate post-event route', async () => {
    const { user } = setup(apiRoutes);
    await user.click(screen.getByRole('button', { name: 'Run assessment' }));
    await user.click(await screen.findByTestId('settlement-training-settlement-b'));
    expect(mapProps.current?.highlight).toMatchObject({ baseline: ['road-c', 'road-h2'], post: ['road-d', 'road-k'], cut: ['road-c'] });
  });

  it('U03: before/after toggle lists scene IDs with acquisition dates', async () => {
    const { user } = setup(apiRoutes);
    await user.click(screen.getByRole('button', { name: 'Run assessment' }));
    const scenes = await screen.findByTestId('imagery-scenes');
    expect(scenes).toHaveTextContent('synthetic-s1-after');
    expect(scenes).toHaveTextContent('2026-08-26 00:21Z');
    await user.click(screen.getByRole('button', { name: 'Before event' }));
    expect(screen.getByTestId('imagery-scenes')).toHaveTextContent('synthetic-s1-before');
    await user.click(screen.getByRole('checkbox', { name: /Candidate flood/ }));
    expect((mapProps.current?.visible as Record<string, boolean>).flood).toBe(false);
  });

  it('U06: report uses backend quantities, flags template generator and opens cited evidence', async () => {
    const { user } = setup(apiRoutes);
    await user.click(screen.getByRole('button', { name: 'Run assessment' }));
    await screen.findByTestId('mode-badge');
    await user.click(screen.getByRole('tab', { name: 'Report' }));
    const rep = await screen.findByTestId('report');
    expect(within(rep).getByTestId('report-generator')).toHaveTextContent('Deterministic template — not the AI copilot');
    const row = rep.querySelector('[data-fact="potentially_isolated_count"]')!;
    expect(row).toHaveTextContent('1');
    expect(row).toHaveTextContent('yes');
    await user.click(within(rep).getByRole('button', { name: 'Open evidence synthetic-exposure-001' }));
    expect(screen.getByRole('heading', { level: 2, name: 'Evidence synthetic-exposure-001' })).toHaveFocus();

    await user.click(screen.getByRole('button', { name: /Nepali/ }));
    expect(await screen.findByText('Nepali report not available yet')).toBeInTheDocument();
  });

  it('U06: bundled fixture has no browser-composed report', async () => {
    const { user } = setup(apiRoutes);
    await user.click(screen.getByRole('button', { name: 'Open bundled UI fixture (no API)' }));
    expect(screen.getByTestId('channel-badge')).toHaveTextContent('Bundled UI fixture');
    await user.click(screen.getByRole('tab', { name: 'Report' }));
    expect(screen.getByText(/does not compose its own totals/)).toBeInTheDocument();
  });

  it('X01: tabs, list selection and inspector close work from the keyboard', async () => {
    const { user } = setup(apiRoutes);
    await user.click(screen.getByRole('button', { name: 'Open bundled UI fixture (no API)' }));
    const settlement = screen.getByTestId('settlement-training-settlement-a');
    settlement.focus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('heading', { level: 2, name: 'Settlement A (synthetic)' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByTestId('inspector')).toBeNull();
    screen.getByRole('tab', { name: 'Assessment' }).focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Report' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Report' })).toHaveFocus();
  });
});

describe('offline start', () => {
  it('O08: offline without a package shows an explicit missing-package screen', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
    indexedDB.deleteDatabase('tads-flood');
    setup(apiRoutes);
    await waitFor(() => expect(screen.getByTestId('offline-no-package')).toHaveTextContent('No offline package exists in this browser'));
    expect(screen.getByTestId('internet-badge')).toHaveTextContent('offline');
    expect(screen.getByRole('button', { name: 'Run assessment' })).toBeDisabled();
  });
});
