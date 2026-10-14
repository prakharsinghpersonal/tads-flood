import { useMemo } from 'react';
import type { SettlementStatus } from '../api/contract';
import {
  STATUS_EXPLAINER,
  STATUS_LABEL,
  STATUS_ORDER,
  formatArea,
  indexFeatures,
  prop,
  settlementName,
  type LoadedAssessment,
  type Selection,
} from '../domain/assessment';
import type { SceneLoad } from '../domain/scenes';
import type { ToggleLayer } from '../map/MapView';
import SceneCompare, { type RadarView } from './SceneCompare';

interface Props {
  loaded: LoadedAssessment;
  selection: Selection | null;
  visible: Record<ToggleLayer, boolean>;
  onToggle: (layer: ToggleLayer) => void;
  onSelect: (sel: Selection) => void;
  scenes: SceneLoad;
  radarView: RadarView;
  radarOpacity: number;
  onRadarView: (v: RadarView) => void;
  onRadarOpacity: (v: number) => void;
}

const TOGGLES: Array<[ToggleLayer, string, string]> = [
  ['flood', 'Candidate flood', 'swatch-flood'],
  ['debris', 'Candidate disturbance / debris', 'swatch-debris'],
  ['roads', 'Roads and exposed edges', 'swatch-road'],
  ['buildings', 'Exposed assets', 'swatch-building'],
  ['settlements', 'Settlement access', 'swatch-settlement'],
  ['uncertainty', 'Uncertainty / no data', 'swatch-unknown'],
];

export default function AssessmentPanel({ loaded, selection, visible, onToggle, onSelect, scenes, radarView, radarOpacity, onRadarView, onRadarOpacity }: Props) {
  const a = loaded.assessment;
  const features = useMemo(() => indexFeatures(a), [a]);
  const facilities = [...features.values()].filter((f) => f.layer === 'settlements' && prop(f.feature, 'kind') === 'facility');
  const grouped = STATUS_ORDER.map((status) => ({
    status,
    items: a.settlements.filter((s) => s.status === status),
  })).filter((g) => g.items.length > 0);
  const exposed = [...features.values()].filter((f) => {
    const st = prop(f.feature, 'status');
    return (f.layer === 'buildings' || f.layer === 'roads') && (st === 'exposed' || st === 'candidate_blocked' || st === 'unknown');
  });
  const selectedId = selection && selection.kind !== 'evidence' && selection.kind !== 'source' ? selection.id : null;

  return (
    <div className="assessment-panel">
      <section aria-labelledby="summary-title" className="panel-section">
        <h2 id="summary-title">Summary</h2>
        <p className="small muted">
          Backend figures from <code>{a.assessment_id}</code> · event {a.event_date} · method {a.quality.method_version}
        </p>
        <dl className="facts" data-testid="summary-facts">
          <div>
            <dt>Potentially isolated</dt>
            <dd data-fact="potentially_isolated_count">{a.summary.potentially_isolated_count}</dd>
          </div>
          <div>
            <dt>Unknown network</dt>
            <dd data-fact="unknown_network_count">{a.summary.unknown_network_count}</dd>
          </div>
          <div>
            <dt>Exposed assets</dt>
            <dd data-fact="exposed_asset_count">{a.summary.exposed_asset_count ?? 'not computed'}</dd>
          </div>
          <div>
            <dt>Candidate flood area</dt>
            <dd data-fact="candidate_flood_area_m2">{formatArea(a.summary.candidate_flood_area_m2)}</dd>
          </div>
        </dl>
        <p className={`quality quality-${a.quality.status}`}>
          Data coverage: <strong>{(a.quality.valid_fraction * 100).toFixed(0)}%</strong> of the area ({a.quality.status}). Anything outside coverage is unknown, not unaffected.
        </p>
        {loaded.warnings.map((w) => (
          <p key={w} className="warn small" role="note">
            {w}
          </p>
        ))}
        {a.quality.warnings.length > 0 && (
          <details className="method-notes">
            <summary>Method notes ({a.quality.warnings.length})</summary>
            <ul className="small">
              {a.quality.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <SceneCompare
        assessment={a}
        load={scenes}
        view={radarView}
        opacity={radarOpacity}
        onView={onRadarView}
        onOpacity={onRadarOpacity}
        onSelect={onSelect}
      />

      <section aria-labelledby="layers-title" className="panel-section">
        <h2 id="layers-title">Layers</h2>
        <ul className="toggles">
          {TOGGLES.map(([key, label, swatch]) => (
            <li key={key}>
              <label>
                <input type="checkbox" checked={visible[key]} onChange={() => onToggle(key)} />
                <span className={`swatch ${swatch}`} aria-hidden="true" />
                {label}
              </label>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="settlements-title" className="panel-section">
        <h2 id="settlements-title">Settlement access</h2>
        {grouped.length === 0 && <p className="muted">No settlement connectivity results in this assessment.</p>}
        {grouped.map((g) => (
          <div key={g.status} className="status-group">
            <h3 className={`status-heading status-${g.status}`}>
              {STATUS_LABEL[g.status as SettlementStatus]} ({g.items.length})
            </h3>
            <p className="small muted">{STATUS_EXPLAINER[g.status as SettlementStatus]}</p>
            <ul className="select-list">
              {g.items.map((s) => (
                <li key={s.settlement_id}>
                  <button
                    type="button"
                    aria-pressed={selectedId === s.settlement_id}
                    onClick={() => onSelect({ kind: 'settlement', id: s.settlement_id })}
                    data-testid={`settlement-${s.settlement_id}`}
                  >
                    <span className={`dot status-${s.status}`} aria-hidden="true" />
                    {settlementName(a, s)}
                    {s.candidate_cut_edge_ids.length > 0 && <span className="small muted"> · cut: {s.candidate_cut_edge_ids.join(', ')}</span>}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      {facilities.length > 0 && (
        <section aria-labelledby="facilities-title" className="panel-section">
          <h2 id="facilities-title">Facilities</h2>
          <ul className="select-list">
            {facilities.map((f) => (
              <li key={f.id}>
                <button type="button" aria-pressed={selectedId === f.id} onClick={() => onSelect({ kind: 'feature', layer: 'settlements', id: f.id })} data-testid={`facility-${f.id}`}>
                  <span className="facility-mark" aria-hidden="true" />
                  {String(prop(f.feature, 'name') ?? f.id)} <span className="small muted">({String(prop(f.feature, 'amenity') ?? 'facility')})</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="assets-title" className="panel-section">
        <h2 id="assets-title">Exposed assets and road edges</h2>
        {exposed.length === 0 ? (
          <p className="muted">No exposed features with geometry in this assessment.</p>
        ) : (
          <ul className="select-list">
            {exposed.map((f) => (
              <li key={f.id}>
                <button type="button" aria-pressed={selectedId === f.id} onClick={() => onSelect({ kind: 'feature', layer: f.layer, id: f.id })}>
                  {f.id} <span className="small muted">({f.layer}, {String(prop(f.feature, 'status')).replace(/_/g, ' ')})</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="limits-title" className="panel-section">
        <h2 id="limits-title">Limitations</h2>
        <ul className="small">
          {a.limitations.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
