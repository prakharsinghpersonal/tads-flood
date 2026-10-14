import type { Assessment } from '../api/contract';
import { formatTime, imagerySources, type Selection } from '../domain/assessment';
import type { SceneLoad } from '../domain/scenes';

export type RadarView = 'off' | 'before' | 'after';

interface Props {
  assessment: Assessment;
  load: SceneLoad;
  view: RadarView;
  opacity: number;
  onView: (v: RadarView) => void;
  onOpacity: (v: number) => void;
  onSelect: (sel: Selection) => void;
}

export default function SceneCompare({ assessment, load, view, opacity, onView, onOpacity, onSelect }: Props) {
  const scenes = load.status === 'ready' ? load.scenes : [];
  const before = scenes.find((s) => s.asset.role === 'before_radar');
  const after = scenes.find((s) => s.asset.role === 'after_radar');
  const legacy = imagerySources(assessment);

  const sceneRow = (label: string, s: (typeof scenes)[number] | undefined, legacyIds: string[], legacyTimes: string[]) => (
    <li
      className={`scene ${s && ((view === 'before' && s.asset.role === 'before_radar') || (view === 'after' && s.asset.role === 'after_radar')) ? 'scene-active' : ''}`}
      aria-current={s && ((view === 'before' && s.asset.role === 'before_radar') || (view === 'after' && s.asset.role === 'after_radar')) ? 'true' : undefined}
    >
      <span className="scene-label">{label}</span>
      {s ? (
        <>
          <span className="scene-date" data-testid={`scene-date-${s.asset.role}`}>
            {s.asset.acquired_at ? formatTime(s.asset.acquired_at) : 'acquisition time unavailable'}
          </span>
          {s.asset.source_id ? (
            <button type="button" className="link small" onClick={() => onSelect({ kind: 'source', id: s.asset.source_id! })}>
              {s.asset.source_id}
            </button>
          ) : (
            <span className="small muted">source not recorded</span>
          )}
        </>
      ) : legacyIds.length ? (
        <>
          <span className="scene-date">{legacyTimes.join(', ')}</span>
          {legacyIds.map((id) => (
            <button key={id} type="button" className="link small" onClick={() => onSelect({ kind: 'source', id })}>
              {id}
            </button>
          ))}
        </>
      ) : (
        <span className="small muted">no scene</span>
      )}
    </li>
  );

  return (
    <section aria-labelledby="imagery-title" className="panel-section">
      <h2 id="imagery-title">Radar before / after</h2>
      <ul className="scene-list" data-testid="imagery-scenes">
        {sceneRow('Before event', before, legacy.before.map((s) => s.source_id), legacy.before.map((s) => formatTime(s.acquired_at)))}
        {sceneRow('After event', after, legacy.after.map((s) => s.source_id), legacy.after.map((s) => formatTime(s.acquired_at)))}
      </ul>

      {load.status === 'loading' && <p role="status" className="small">Downloading and verifying radar previews…</p>}
      {load.status === 'none' && (
        <p className="notice small" data-testid="imagery-unavailable">
          Imagery unavailable: {load.reason}
        </p>
      )}
      {load.status === 'error' && (
        <p className="error-box small" role="alert" data-testid="imagery-error">
          Imagery not shown: {load.message}
        </p>
      )}
      {load.status === 'ready' && (
        <>
          <div className="segmented" role="group" aria-label="Radar image on map">
            {(['before', 'after', 'off'] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                disabled={v === 'before' ? !before : v === 'after' ? !after : false}
                onClick={() => onView(v)}
              >
                {v === 'before' ? 'Before' : v === 'after' ? 'After' : 'Hide'}
              </button>
            ))}
          </div>
          <label className="field opacity">
            <span>Image opacity {Math.round(opacity * 100)}%</span>
            <input type="range" min={0.2} max={1} step={0.1} value={opacity} disabled={view === 'off'} onChange={(e) => onOpacity(Number(e.target.value))} />
          </label>
          <p className="small muted">
            {(before ?? after)?.asset.rendering}. Transparent cells are no-data and stay unknown. Bright/dark change is a candidate signal, not confirmed flooding.
          </p>
        </>
      )}
    </section>
  );
}
