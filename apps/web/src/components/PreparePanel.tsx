import { useEffect, useRef, useState } from 'react';
import { ApiError, runAssessment, validateRequest, type ApiClient, type Received } from '../api/client';
import { parseAssessment, type Assessment, type Job, type Readiness } from '../api/contract';
import uiFixture from '../fixtures/synthetic-ui-assessment.json';
import type { LoadedAssessment } from '../domain/assessment';

interface Props {
  client: ApiClient;
  online: boolean;
  onLoaded: (loaded: LoadedAssessment) => void;
}

const STAGES: Job['status'][] = ['queued', 'fetching', 'processing', 'analyzing', 'reporting', 'completed'];

type RunState =
  | { kind: 'idle' }
  | { kind: 'running'; job: Job | null; label: string }
  | { kind: 'cancelled' }
  | { kind: 'empty'; assessmentId: string }
  | { kind: 'error'; title: string; detail: string; retryable: boolean };

export function describeError(err: unknown): { title: string; detail: string; retryable: boolean } {
  if (!(err instanceof ApiError)) return { title: 'Unexpected error', detail: String(err), retryable: false };
  if (err.kind === 'network') return { title: 'API unreachable', detail: `${err.message} No results are shown.`, retryable: true };
  if (err.kind === 'timeout') return { title: 'API timed out', detail: err.message, retryable: true };
  if (err.kind === 'unsupported_version') return { title: 'Unsupported schema version', detail: err.message, retryable: false };
  if (err.kind === 'invalid_response') return { title: 'Invalid API response', detail: err.message, retryable: false };
  if (err.status === 401 || err.status === 403) return { title: 'Provider authorisation failed', detail: err.message, retryable: false };
  if (err.status === 429) return { title: 'Provider quota reached', detail: err.message, retryable: true };
  if (err.code === 'live_provider_unavailable') {
    return { title: 'Live providers unavailable', detail: `${err.message} No synthetic substitute is shown.`, retryable: err.retryable };
  }
  if (err.status === 422) return { title: 'Request rejected', detail: err.message, retryable: false };
  if (err.status === 404) return { title: 'Not found', detail: err.message, retryable: false };
  return { title: `Request failed${err.status ? ` (HTTP ${err.status})` : ''}`, detail: err.message, retryable: err.retryable };
}

export function isEmptyAssessment(a: Assessment) {
  const featureCount = Object.values(a.layers).reduce((n, fc) => n + fc.features.length, 0);
  return featureCount === 0 && a.settlements.length === 0;
}

export function loadBundledFixture(): LoadedAssessment {
  const parsed = parseAssessment(uiFixture);
  if (!parsed.ok) throw new Error('Bundled fixture failed validation');
  return { assessment: parsed.assessment, channel: 'bundled_fixture', received_at: new Date().toISOString(), warnings: parsed.warnings };
}

export default function PreparePanel({ client, online, onLoaded }: Props) {
  const [form, setForm] = useState({ west: '85.25', south: '27.85', east: '85.27', north: '27.87', event_date: '2026-08-26' });
  const [mode, setMode] = useState<'live' | 'synthetic'>('live');
  const [errors, setErrors] = useState<string[]>([]);
  const [state, setState] = useState<RunState>({ kind: 'idle' });
  const abortRef = useRef<AbortController | null>(null);
  const lastRun = useRef<(() => void) | null>(null);
  const [readiness, setReadiness] = useState<Readiness | 'unavailable' | null>(null);

  useEffect(() => {
    if (!online) return;
    const ctl = new AbortController();
    client
      .readiness(ctl.signal)
      .then(setReadiness)
      .catch(() => !ctl.signal.aborted && setReadiness('unavailable'));
    return () => ctl.abort();
  }, [client, online]);

  const accept = (r: Received<Assessment>) => {
    if (isEmptyAssessment(r.value)) {
      setState({ kind: 'empty', assessmentId: r.value.assessment_id });
      return;
    }
    setState({ kind: 'idle' });
    const parsed = parseAssessment(r.value);
    onLoaded({ assessment: r.value, channel: 'api', received_at: r.received_at, warnings: parsed.ok ? parsed.warnings : [] });
  };

  async function run(task: (signal: AbortSignal) => Promise<Received<Assessment>>, label: string) {
    lastRun.current = () => void run(task, label);
    abortRef.current?.abort();
    const ctl = new AbortController();
    abortRef.current = ctl;
    setState({ kind: 'running', job: null, label });
    try {
      accept(await task(ctl.signal));
    } catch (err) {
      if (ctl.signal.aborted || (err instanceof ApiError && err.kind === 'cancelled')) setState({ kind: 'cancelled' });
      else setState({ kind: 'error', ...describeError(err) });
    } finally {
      if (abortRef.current === ctl) abortRef.current = null;
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const v = validateRequest(form);
    setErrors(v.errors);
    if (!v.bbox) return;
    const req = { bbox: v.bbox, event_date: form.event_date, mode };
    void run(
      (signal) =>
        runAssessment(client, req, {
          signal,
          onJob: (job) => setState((s) => (s.kind === 'running' ? { ...s, job } : s)),
        }),
      mode === 'live' ? 'Live assessment' : 'Synthetic demo assessment',
    );
  }

  const running = state.kind === 'running';
  const field = (k: keyof typeof form, label: string, hint: string) => (
    <label className="field">
      <span>{label}</span>
      <input
        name={k}
        inputMode="decimal"
        value={form[k]}
        onChange={(e) => setForm({ ...form, [k]: e.target.value })}
        aria-describedby="bbox-hint"
        disabled={running}
      />
      <span className="small muted">{hint}</span>
    </label>
  );

  return (
    <section aria-labelledby="prepare-title" className="panel-section">
      <h2 id="prepare-title">Prepare assessment</h2>
      <form onSubmit={submit} noValidate>
        <fieldset disabled={running}>
          <legend>Area of interest (WGS84)</legend>
          <p id="bbox-hint" className="small muted">
            Order is west, south, east, north (longitude before latitude).
          </p>
          <div className="grid-2">
            {field('west', 'West (lon)', 'min longitude')}
            {field('south', 'South (lat)', 'min latitude')}
            {field('east', 'East (lon)', 'max longitude')}
            {field('north', 'North (lat)', 'max latitude')}
          </div>
          <label className="field">
            <span>Flood date</span>
            <input type="date" name="event_date" value={form.event_date} onChange={(e) => setForm({ ...form, event_date: e.target.value })} />
          </label>
          <fieldset className="radio-row">
            <legend>Data mode</legend>
            <label>
              <input type="radio" name="mode" value="live" checked={mode === 'live'} onChange={() => setMode('live')} /> Live (Sentinel + pre-event OSM)
            </label>
            <label>
              <input type="radio" name="mode" value="synthetic" checked={mode === 'synthetic'} onChange={() => setMode('synthetic')} /> Synthetic demo (labelled, not real)
            </label>
          </fieldset>
        </fieldset>
        {errors.length > 0 && (
          <ul className="form-errors" role="alert">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
        <div className="button-row">
          <button type="submit" className="primary" disabled={running || !online}>
            Run assessment
          </button>
          {running && (
            <button type="button" onClick={() => abortRef.current?.abort()}>
              Cancel
            </button>
          )}
        </div>
        {!online && <p className="small warn">Browser is offline. Live requests are unavailable; open a cached package instead.</p>}
      </form>

      <h3>Demo data</h3>
      <div className="button-row secondary-loads">
        <button type="button" className="primary" disabled={running || !online} onClick={() => void run((s) => client.getGeographicDemo(s), 'Computed synthetic demo')}>
          Load computed demo (synthetic)
        </button>
      </div>
      <p className="small muted">Runs the backend pipeline on synthetic radar and map data. Not a real flood finding.</p>
      <details className="more-loads">
        <summary>Other test data</summary>
        <div className="button-row">
          <button type="button" disabled={running || !online} onClick={() => void run((s) => client.getDemo(s), 'Legacy API fixture')}>
            Load legacy API fixture (no geometry)
          </button>
          <button type="button" disabled={running} onClick={() => onLoaded(loadBundledFixture())}>
            Open bundled UI fixture (no API)
          </button>
        </div>
      </details>
      {readiness && (
        <p className="small readiness" data-testid="readiness">
          {readiness === 'unavailable' ? (
            'Server readiness unknown (API unreachable).'
          ) : (
            <>
              Server configuration: satellite {readiness.satellite_configured ? 'configured' : 'not configured'}, historical OSM{' '}
              {readiness.historical_osm_configured ? 'configured' : 'not configured'}, AI {readiness.ai_configured ? 'configured' : 'not configured'}.
              Configured does not mean tested. Keys are set on the server only.
            </>
          )}
        </p>
      )}

      <div aria-live="polite" className="run-state">
        {state.kind === 'running' && (
          <div className="progress" role="status">
            <p>
              <strong>{state.label}</strong>: {state.job ? state.job.status : 'submitting request'}
              {state.job?.stage_message ? ` — ${state.job.stage_message}` : ''}
            </p>
            <ol className="stages">
              {STAGES.map((st) => {
                const cur = state.job ? STAGES.indexOf(state.job.status) : -1;
                const idx = STAGES.indexOf(st);
                return (
                  <li key={st} className={idx < cur ? 'done' : idx === cur ? 'current' : ''} aria-current={idx === cur ? 'step' : undefined}>
                    {st}
                  </li>
                );
              })}
            </ol>
          </div>
        )}
        {state.kind === 'cancelled' && <p className="notice">Cancelled. No results are shown.</p>}
        {state.kind === 'empty' && (
          <p className="notice" role="status">
            Assessment {state.assessmentId} completed with no features or settlements. Nothing to map; this is not evidence that the area is unaffected.
          </p>
        )}
        {state.kind === 'error' && (
          <div className="error-box" role="alert">
            <strong>{state.title}</strong>
            <p>{state.detail}</p>
            {state.retryable && (
              <button type="button" onClick={() => lastRun.current?.()}>
                Retry
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
