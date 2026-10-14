import { formatTime } from '../domain/assessment';
import type { SceneLoad } from '../domain/scenes';
import type { RadarView } from './SceneCompare';

interface Props {
  load: SceneLoad;
  view: RadarView;
  onView: (v: RadarView) => void;
}

const shortDate = (iso: string | null | undefined) => (iso ? formatTime(iso).slice(0, 10) : 'date n/a');

// Primary on-map control. "Hidden" (user choice) and "unavailable" (no verified
// image) are different states and are worded differently.
export default function MapRadarControl({ load, view, onView }: Props) {
  const scenes = load.status === 'ready' ? load.scenes : [];
  const before = scenes.find((s) => s.asset.role === 'before_radar');
  const after = scenes.find((s) => s.asset.role === 'after_radar');

  return (
    <div className="map-overlay radar-control" data-testid="radar-control">
      <div className="radar-head">
        <span className="radar-title">Radar</span>
        {load.status === 'loading' && <span className="small">verifying images…</span>}
        {load.status === 'none' && <span className="small" data-testid="radar-state">unavailable</span>}
        {load.status === 'error' && <span className="small warn" data-testid="radar-state">not shown (failed check)</span>}
        {load.status === 'ready' && view === 'off' && <span className="small" data-testid="radar-state">hidden</span>}
      </div>
      {load.status === 'ready' && (
        <div className="segmented radar-buttons" role="group" aria-label="Radar image on map">
          <button type="button" aria-pressed={view === 'before'} disabled={!before} onClick={() => onView('before')}>
            Before <span className="radar-date">{shortDate(before?.asset.acquired_at)}</span>
          </button>
          <button type="button" aria-pressed={view === 'after'} disabled={!after} onClick={() => onView('after')}>
            After <span className="radar-date">{shortDate(after?.asset.acquired_at)}</span>
          </button>
          <button type="button" aria-pressed={view === 'off'} onClick={() => onView('off')}>
            Hide
          </button>
        </div>
      )}
      <details className="legend">
        <summary>Legend</summary>
        <ul>
          <li>
            <span className="lg lg-radar" aria-hidden="true" /> Radar backscatter (VV): darker = smoother surface, a possible water signal
          </li>
          <li>
            <span className="lg lg-nodata" aria-hidden="true" /> Transparent = no radar data (unknown)
          </li>
          <li>
            <span className="lg lg-flood" aria-hidden="true" /> Candidate flood (heuristic, not a probability)
          </li>
          <li>
            <span className="lg lg-cut" aria-hidden="true" /> Candidate cut edge (not a verified closure)
          </li>
          <li>
            <span className="lg lg-unknown" aria-hidden="true" /> Road with unknown coverage
          </li>
          <li>
            <span className="lg lg-facility" aria-hidden="true" /> Facility (hospital/clinic)
          </li>
        </ul>
      </details>
    </div>
  );
}
