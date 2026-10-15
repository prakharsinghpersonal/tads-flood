import { useEffect, useMemo, useState } from 'react';
import { formatTime } from '../domain/assessment';
import type { MissionOverlayData } from '../map/MapView';
import { clearMission, loadMission, saveMission, type StoredPackage } from '../offline/packageStore';
import {
  CommandUnavailable,
  acquisition,
  boundsWithin,
  createSim,
  overlay,
  queueCommand,
  reviewExpired,
  setGnss,
  setLink,
  stationBeliefs,
  step,
  type ExplorePref,
  type SimState,
} from './sim';

interface Props {
  pkg: StoredPackage;
  online: boolean;
  onOverlay: (o: MissionOverlayData | null) => void;
}

const STATUS_TEXT: Record<string, string> = {
  queued: 'Local pending — not sent',
  sent: 'Sent — awaiting acknowledgement',
  acknowledged: 'Acknowledged',
  expired: 'Expired — review needed',
  failed: 'Failed',
};

function stepsBetween(a: string, b: string, stepSeconds: number) {
  return Math.round((Date.parse(b) - Date.parse(a)) / 1000 / stepSeconds);
}

export default function MissionPanel({ pkg, online, onOverlay }: Props) {
  const a = pkg.loaded.assessment;
  const [sim, setSim] = useState<SimState | null>(null);
  const [restored, setRestored] = useState<'loading' | 'restored' | 'none'>('loading');
  const [bounds, setBounds] = useState(a.bbox.map(String));
  const [explore, setExplore] = useState<ExplorePref>('medium');
  const [error, setError] = useState<string | null>(null);
  const [tile, setTile] = useState('');
  const [actor, setActor] = useState('drone-1');

  useEffect(() => {
    let cancelled = false;
    loadMission(pkg.manifest.package_id)
      .then((s) => {
        if (cancelled) return;
        setSim(s);
        setRestored(s ? 'restored' : 'none');
      })
      .catch(() => setRestored('none'));
    return () => {
      cancelled = true;
    };
  }, [pkg.manifest.package_id]);

  useEffect(() => {
    onOverlay(sim ? overlay(sim) : null);
    if (sim) void saveMission(pkg.manifest.package_id, sim);
  }, [sim, pkg.manifest.package_id, onOverlay]);

  useEffect(() => () => onOverlay(null), [onOverlay]);

  const beliefs = useMemo(() => (sim ? stationBeliefs(sim) : null), [sim]);

  function act(fn: (s: SimState) => SimState) {
    if (!sim) return;
    try {
      setError(null);
      setSim(fn(sim));
    } catch (err) {
      setError(err instanceof CommandUnavailable ? err.message : `Simulation error: ${(err as Error).message}`);
    }
  }

  function start() {
    const b = bounds.map(Number) as [number, number, number, number];
    if (b.some((x) => !Number.isFinite(x)) || !boundsWithin(b, a.bbox)) {
      setError('Inspection bounds must be numbers with positive area inside the assessment AOI.');
      return;
    }
    try {
      setError(null);
      setSim(createSim(a, b, { explore }));
      setRestored('none');
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function reset() {
    await clearMission(pkg.manifest.package_id);
    setSim(null);
  }

  const header = (
    <>
      <h2 id="mission-title">
        Simulated inspection <span className="badge badge-sim">SIMULATION</span>
      </h2>
      <p className="small">
        A TADS-inspired planning simulation over the cached prior. Not real telemetry, no flight control, no arm or launch. Simulated observations stay in this panel and never change the assessment or its report.
      </p>
    </>
  );

  if (restored === 'loading') {
    return (
      <section className="panel-section mission" aria-labelledby="mission-title">
        {header}
        <p role="status">Restoring mission state…</p>
      </section>
    );
  }

  if (!sim) {
    return (
      <section className="panel-section mission" aria-labelledby="mission-title">
        {header}
        <fieldset>
          <legend>Inspection bounds (inside AOI; west, south, east, north)</legend>
          <div className="grid-2">
            {['West', 'South', 'East', 'North'].map((label, i) => (
              <label key={label} className="field">
                <span>{label}</span>
                <input inputMode="decimal" value={bounds[i]} onChange={(e) => setBounds(bounds.map((v, j) => (j === i ? e.target.value : v)))} />
              </label>
            ))}
          </div>
        </fieldset>
        <label className="field">
          <span>Exploration preference</span>
          <select value={explore} onChange={(e) => setExplore(e.target.value as ExplorePref)}>
            <option value="low">Low — favour high-hazard prior tiles</option>
            <option value="medium">Medium</option>
            <option value="high">High — favour tiles where the prior is least tested</option>
          </select>
        </label>
        {error && (
          <p className="error-box" role="alert">
            {error}
          </p>
        )}
        <button type="button" className="primary" onClick={start}>
          Start simulation
        </button>
      </section>
    );
  }

  const linkUp = sim.link === 'connected';
  const received = Object.values(sim.station.received).sort((x, y) => y.event_at.localeCompare(x.event_at));
  const nextTerms = sim.drones[0] ? acquisition(sim, sim.drones[0]).sort((x, y) => y.score - x.score).slice(0, 3) : [];

  return (
    <section className="panel-section mission" aria-labelledby="mission-title" data-testid="mission">
      {header}
      {restored === 'restored' && <p className="small notice">Mission state restored from this browser.</p>}
      <p className="small muted">
        Seed {sim.config.seed} · step {sim.step} · sim clock {formatTime(sim.clock)} · prior: {sim.prior_source} · exploration {sim.config.explore}
      </p>

      <div className="link-row">
        <span className={`badge ${online ? 'badge-ok' : 'badge-off'}`} data-testid="mission-internet">
          Internet: {online ? 'online' : 'offline'}
        </span>
        <span className={`badge ${linkUp ? 'badge-ok' : 'badge-off'}`} data-testid="link-badge">
          Drone radio link: {linkUp ? 'connected' : 'lost'}
        </span>
        <button type="button" aria-pressed={!linkUp} onClick={() => act((s) => setLink(s, linkUp ? 'lost' : 'connected'))}>
          {linkUp ? 'Simulate radio loss' : 'Restore radio link'}
        </button>
      </div>
      {!linkUp && (
        <p className="warn small" role="status">
          Radio link lost at {formatTime(sim.link_lost_at)}. Showing last-known telemetry only; onboard events are not visible until contact returns.
        </p>
      )}

      <div className="button-row">
        <button type="button" onClick={() => act(step)}>
          Advance 1 step
        </button>
        <button type="button" onClick={() => act((s) => [0, 1, 2, 3, 4].reduce((x) => step(x), s))}>
          Advance 5 steps
        </button>
      </div>

      <h3>Last-known telemetry</h3>
      <table className="telemetry">
        <thead>
          <tr>
            <th scope="col">Actor</th>
            <th scope="col">Tile</th>
            <th scope="col">Battery</th>
            <th scope="col">Status</th>
            <th scope="col">Observed</th>
            <th scope="col">Received</th>
            <th scope="col">Scenario</th>
          </tr>
        </thead>
        <tbody>
          {Object.values(sim.station.telemetry).map((t) => {
            const behind = stepsBetween(t.telemetry_at, sim.clock, sim.config.step_seconds);
            const drone = sim.drones.find((d) => d.actor_id === t.actor_id)!;
            return (
              <tr key={t.actor_id} data-testid={`telemetry-${t.actor_id}`}>
                <th scope="row">{t.actor_id}</th>
                <td>
                  {t.tile_id}
                  {!t.position_reliable && <span className="warn small"> (position unreliable)</span>}
                </td>
                <td>{t.battery}%</td>
                <td>{t.status}</td>
                <td>
                  {formatTime(t.telemetry_at)}
                  {behind > 0 && <span className="warn small"> · {behind} step(s) old</span>}
                </td>
                <td>{formatTime(t.received_at)}</td>
                <td>
                  <label className="small">
                    <input type="checkbox" checked={!drone.gnss_ok} onChange={() => act((s) => setGnss(s, t.actor_id, !drone.gnss_ok))} /> GNSS loss
                  </label>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="small muted">Low-battery return and position-loss hold/land are simulation policy, not tested flight-controller behaviour.</p>

      <h3>Requests</h3>
      <div className="grid-2">
        <label className="field">
          <span>Actor</span>
          <select value={actor} onChange={(e) => setActor(e.target.value)}>
            {sim.drones.map((d) => (
              <option key={d.actor_id}>{d.actor_id}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Tile to inspect</span>
          <select value={tile} onChange={(e) => setTile(e.target.value)}>
            <option value="">Choose tile…</option>
            {sim.tiles.map((t) => (
              <option key={t.tile_id} value={t.tile_id}>
                {t.tile_id} (prior {t.hazard_prior.toFixed(2)})
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="button-row">
        <button type="button" disabled={!tile} onClick={() => act((s) => queueCommand(s, 'inspect_tile', actor, tile))}>
          {linkUp ? 'Request inspection' : 'Queue inspection locally'}
        </button>
        <button type="button" disabled={!linkUp} onClick={() => act((s) => queueCommand(s, 'return_to_launch', actor, null))} aria-describedby={linkUp ? undefined : 'rtl-why'}>
          Return to launch
        </button>
      </div>
      {!linkUp && (
        <p id="rtl-why" className="small muted">
          Return to launch is unavailable without a radio link.
        </p>
      )}
      {error && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}
      {sim.station.commands.length > 0 && (
        <ul className="commands" data-testid="commands">
          {[...sim.station.commands].reverse().map((c) => (
            <li key={c.command_id} className={`cmd cmd-${c.status}`}>
              <code>{c.command_id}</code> {c.type.replace(/_/g, ' ')} {c.target ?? ''} → {c.actor_id}: <strong>{STATUS_TEXT[c.status]}</strong>
              <span className="small muted">
                {' '}
                created {formatTime(c.created_at)}, expires {formatTime(c.expires_at)}
                {c.acknowledged_at && `, acknowledged ${formatTime(c.acknowledged_at)}`}
              </span>
              {c.status === 'expired' && c.review === 'needed' && (
                <span className="button-row inline">
                  <button type="button" onClick={() => act((s) => reviewExpired(s, c.command_id, 'reissue'))}>
                    Reissue
                  </button>
                  <button type="button" onClick={() => act((s) => reviewExpired(s, c.command_id, 'dismiss'))}>
                    Dismiss
                  </button>
                </span>
              )}
              {c.review && c.review !== 'needed' && <span className="small"> ({c.review})</span>}
            </li>
          ))}
        </ul>
      )}

      <h3>Received simulated observations ({received.length})</h3>
      <p className="small muted">Only events the station has received. Event time is when the simulated drone observed; received time is when it reached this station.</p>
      {received.length === 0 ? (
        <p className="muted">None received yet.</p>
      ) : (
        <table className="events" data-testid="received-events">
          <thead>
            <tr>
              <th scope="col">Event</th>
              <th scope="col">Tile</th>
              <th scope="col">Observation</th>
              <th scope="col">Event time</th>
              <th scope="col">Received</th>
            </tr>
          </thead>
          <tbody>
            {received.slice(0, 12).map((e) => (
              <tr key={e.event_id}>
                <td>
                  <code>{e.event_id}</code>
                </td>
                <td>{e.tile_id}</td>
                <td>{e.kind === 'water_observed' ? 'water (simulated)' : 'dry (simulated)'}</td>
                <td>{formatTime(e.event_at)}</td>
                <td>{formatTime(e.received_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <details>
        <summary>Trust in the prior and next acquisition (drone-1 onboard view)</summary>
        <p className="small">
          Trust starts uninformed (Beta 1,1) and moves only with received observations. It is a reliability estimate for the prior on a tile, not a flood probability.
        </p>
        <table className="small">
          <thead>
            <tr>
              <th scope="col">Tile</th>
              <th scope="col">Hazard prior</th>
              <th scope="col">Uncertainty</th>
              <th scope="col">Novelty</th>
              <th scope="col">Separation</th>
              <th scope="col">Score</th>
              <th scope="col">Station trust</th>
            </tr>
          </thead>
          <tbody>
            {nextTerms.map((t) => (
              <tr key={t.tile_id}>
                <td>{t.tile_id}</td>
                <td>{t.hazard.toFixed(2)}</td>
                <td>{t.uncertainty.toFixed(2)}</td>
                <td>{t.novelty.toFixed(2)}</td>
                <td>{t.separation.toFixed(2)}</td>
                <td>{t.score.toFixed(2)}</td>
                <td>
                  {beliefs![t.tile_id].mean.toFixed(2)} ± {beliefs![t.tile_id].std.toFixed(2)} (n={beliefs![t.tile_id].observations})
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>

      {sim.notes.length > 0 && (
        <>
          <h3>Simulation policy log</h3>
          <ul className="small">
            {sim.notes.slice(-5).map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </>
      )}

      <div className="button-row">
        <button
          type="button"
          onClick={() => {
            const blob = new Blob(
              [JSON.stringify({ namespace: 'simulation', assessment_id: sim.assessment_id, received_events: received, commands: sim.station.commands, notes: sim.notes }, null, 2)],
              { type: 'application/json' },
            );
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `simulated-inspection-${sim.assessment_id}.json`;
            link.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          }}
        >
          Download simulated log
        </button>
        <button type="button" onClick={() => void reset()}>
          Reset simulation
        </button>
      </div>
    </section>
  );
}
