import { useEffect, useMemo, useRef } from 'react';
import type { Evidence, Source } from '../api/contract';
import {
  CHANNEL_LABEL,
  STATUS_EXPLAINER,
  edgeLabel,
  featureLabel,
  STATUS_LABEL,
  evidenceById,
  formatTime,
  indexFeatures,
  prop,
  settlementName,
  shortHash,
  sourceById,
  stringList,
  type LoadedAssessment,
  type Selection,
} from '../domain/assessment';

interface Props {
  loaded: LoadedAssessment;
  selection: Selection;
  reviewed: Set<string>;
  onToggleReviewed: (key: string) => void;
  onSelect: (sel: Selection) => void;
  onClose: () => void;
  onOpenBrief?: () => void;
}

const KIND_LABEL: Record<Evidence['kind'], string> = {
  measured: 'Measured',
  inferred: 'Inferred',
  synthetic: 'Synthetic',
};

function selectionKey(sel: Selection) {
  return sel.kind === 'feature' ? `feature:${sel.id}` : `${sel.kind}:${sel.id}`;
}

export default function EvidenceInspector({ loaded, selection, reviewed, onToggleReviewed, onSelect, onClose, onOpenBrief }: Props) {
  const { assessment: a } = loaded;
  const heading = useRef<HTMLHeadingElement>(null);
  const evidence = useMemo(() => evidenceById(a), [a]);
  const sources = useMemo(() => sourceById(a), [a]);
  const features = useMemo(() => indexFeatures(a), [a]);
  const key = selectionKey(selection);

  useEffect(() => {
    heading.current?.focus();
  }, [key]);

  const edgeName = (id: string) => edgeLabel(features.get(id)?.feature, id);
  const facilityName = (id: string | null) => (id ? featureLabel(features.get(id)?.feature, id) : null);
  const edgeButton = (id: string, tone?: 'cut') => {
    const exists = features.has(id);
    return (
      <li key={id}>
        <button
          type="button"
          className={`chip chip-edge ${tone === 'cut' ? 'chip-cut' : ''}`}
          onClick={() => onSelect({ kind: 'feature', layer: 'roads', id })}
          disabled={!exists}
          title={exists ? `Show ${id} on the map` : 'No geometry for this edge in the assessment'}
        >
          <span className="chip-label">{exists ? edgeName(id) : 'No geometry'}</span>
          <code className="chip-id">{id}</code>
        </button>
      </li>
    );
  };

  let title = '';
  let body: React.ReactNode = null;
  let evidenceIds: string[] = [];

  if (selection.kind === 'settlement') {
    const s = a.settlements.find((x) => x.settlement_id === selection.id);
    if (!s) {
      title = selection.id;
      body = <p>This settlement has a map feature but no connectivity result in the assessment.</p>;
    } else {
      title = settlementName(a, s);
      evidenceIds = s.evidence_ids;
      const access = s.any_facility_access === null ? 'Unknown' : s.any_facility_access ? 'A mapped route remains (passability not verified)' : 'No mapped route found';
      const cutNames = s.candidate_cut_edge_ids.map((id) => `the ${edgeName(id).split(' · ')[0].toLowerCase()}`);
      const cutPhrase = cutNames.length > 1 ? `${cutNames.slice(0, -1).join(', ')} and ${cutNames.at(-1)}` : (cutNames[0] ?? '');
      const before = facilityName(s.baseline_facility_id);
      const after = facilityName(s.post_event_facility_id);
      body = (
        <>
          <p className={`status status-${s.status}`} data-testid="inspector-status">
            <strong>{STATUS_LABEL[s.status]}</strong> — {STATUS_EXPLAINER[s.status]}
          </p>
          <div className="decision" data-testid="decision">
            <h3>What this means</h3>
            <p>
              {s.status === 'potentially_isolated' &&
                `${cutNames.length ? `If ${cutPhrase} ${cutNames.length > 1 ? 'are' : 'is'} impassable, ` : ''}no mapped route to ${before ?? 'a facility'} or any other facility remains. Open a cut below to check its sources.`}
              {s.status === 'connected' &&
                (s.candidate_cut_edge_ids.length
                  ? `The usual route crosses ${cutPhrase}, but another mapped route to ${after ?? 'a facility'} remains. That route is not verified as passable or safe.`
                  : `A mapped route to ${after ?? 'a facility'} remains with no candidate exposure. That is not a safety assessment.`)}
              {s.status === 'preexisting_disconnected' && 'No mapped route existed before the event. This is a map gap or a pre-existing condition, not flood impact.'}
              {s.status === 'unknown_network' && 'Coverage or mapped connectivity is incomplete. Current facility access is unknown; do not treat it as safe.'}
            </p>
          </div>
          <dl className="kv">
            <dt>Nearest facility before</dt>
            <dd>{before ?? 'No mapped facility reachable before the event'}</dd>
            <dt>Facility after</dt>
            <dd>{after ?? 'None reachable on the mapped network'}</dd>
            <dt>Any facility after</dt>
            <dd>{access}</dd>
          </dl>
          <h4>Candidate cut edges</h4>
          {s.candidate_cut_edge_ids.length ? (
            <>
              <ul className="chips" aria-label="Candidate cut edges">{s.candidate_cut_edge_ids.map((id) => edgeButton(id, 'cut'))}</ul>
              <p className="muted small">Inferred from candidate exposure, not a verified closure. Open one to see its sources.</p>
            </>
          ) : (
            <p className="muted small">None.</p>
          )}
          <details className="more">
            <summary>
              Route edges (before: {s.baseline_route_edge_ids.length}, after: {s.post_event_route_edge_ids.length})
            </summary>
            <h4>Pre-event route</h4>
            {s.baseline_route_edge_ids.length ? <ul className="chips" aria-label="Pre-event route edges">{s.baseline_route_edge_ids.map((id) => edgeButton(id))}</ul> : <p className="muted small">No pre-event route.</p>}
            <h4>Post-event route</h4>
            {s.post_event_route_edge_ids.length ? <ul className="chips" aria-label="Post-event route edges">{s.post_event_route_edge_ids.map((id) => edgeButton(id))}</ul> : <p className="muted small">No post-event route available.</p>}
            <dl className="kv small">
              <dt>Settlement ID</dt>
              <dd>{s.settlement_id}</dd>
              <dt>Facility IDs</dt>
              <dd>
                {s.baseline_facility_id ?? 'none'} → {s.post_event_facility_id ?? 'none'}
              </dd>
              <dt>Backend reason</dt>
              <dd>{s.reason}</dd>
            </dl>
          </details>
        </>
      );
    }
  } else if (selection.kind === 'feature') {
    const ref = features.get(selection.id);
    title = ref?.layer === 'roads' ? edgeName(selection.id) : String(prop(ref?.feature, 'name') ?? selection.id);
    evidenceIds = stringList(prop(ref?.feature, 'evidence_ids'));
    const srcId = prop(ref?.feature, 'source_id');
    const status = prop(ref?.feature, 'status');
    const score = prop(ref?.feature, 'flood_score');
    const usedBy = a.settlements.filter(
      (s) => s.baseline_route_edge_ids.includes(selection.id) || s.post_event_route_edge_ids.includes(selection.id),
    );
    const isFacility = prop(ref?.feature, 'kind') === 'facility' || typeof prop(ref?.feature, 'amenity') === 'string';
    const servedBaseline = a.settlements.filter((s) => s.baseline_facility_id === selection.id);
    const servedPost = a.settlements.filter((s) => s.post_event_facility_id === selection.id);
    const srcRec = typeof srcId === 'string' ? sources.get(srcId) : undefined;
    const cutFor = a.settlements.filter((s) => s.candidate_cut_edge_ids.includes(selection.id));
    const lengthM = prop(ref?.feature, 'length_m');
    const exposedM = prop(ref?.feature, 'exposed_length_m');
    body = ref ? (
      <>
        <dl className="kv">
          {isFacility ? (
            <>
              <dt>Facility</dt>
              <dd data-testid="inspector-status">{String(prop(ref.feature, 'amenity') ?? 'facility')} (from pre-event map data)</dd>
            </>
          ) : (
            <>
              <dt>Status</dt>
              <dd data-testid="inspector-status">
                {status === 'unknown'
                  ? 'unknown coverage — not known to be passable or blocked'
                  : status === 'candidate_blocked'
                    ? 'candidate blocked — inferred, not a verified closure'
                    : typeof status === 'string'
                      ? status.replace(/_/g, ' ')
                      : 'not provided'}
              </dd>
            </>
          )}
          {cutFor.length > 0 && (
            <>
              <dt>Consequence</dt>
              <dd data-testid="edge-consequence">
                Candidate cut on the route of {cutFor.map((x) => settlementName(a, x)).join(', ')}
                {cutFor.some((x) => x.status === 'potentially_isolated') ? '; no mapped alternate route remains for ' + cutFor.filter((x) => x.status === 'potentially_isolated').map((x) => settlementName(a, x)).join(', ') : '; another mapped route remains'}.
              </dd>
            </>
          )}
          <dt>Source</dt>
          <dd>
            {typeof srcId === 'string' ? (
              <>
                <button type="button" className="link" onClick={() => onSelect({ kind: 'source', id: srcId })}>
                  {srcId}
                </button>
                {srcRec && <span className="small"> · acquired {formatTime(srcRec.acquired_at)}</span>}
              </>
            ) : (
              'not provided'
            )}
          </dd>
          {ref.layer === 'roads' && typeof lengthM === 'number' && (
            <>
              <dt>Length</dt>
              <dd>
                {Math.round(lengthM)} m{typeof exposedM === 'number' ? `, ${Math.round(exposedM)} m inside candidate exposure` : ''}
              </dd>
            </>
          )}
          {typeof score === 'number' && (
            <>
              <dt>flood_score</dt>
              <dd>{score.toFixed(2)} (heuristic score, not a probability)</dd>
            </>
          )}
        </dl>
        <details className="more">
          <summary>IDs and method</summary>
          <dl className="kv small">
            <dt>Feature ID</dt>
            <dd>{ref.id}</dd>
            <dt>Layer</dt>
            <dd>{ref.layer}</dd>
            {ref.layer === 'roads' && (
              <>
                <dt>candidate_blocked</dt>
                <dd>{String(prop(ref.feature, 'candidate_blocked') ?? 'not provided')}</dd>
              </>
            )}
            <dt>Method version</dt>
            <dd>{String(prop(ref.feature, 'method_version') ?? 'not provided')}</dd>
          </dl>
        </details>
        {isFacility && (
          <>
            <h4>Nearest facility before the event for</h4>
            {servedBaseline.length ? (
              <ul className="chips">
                {servedBaseline.map((s) => (
                  <li key={s.settlement_id}>
                    <button type="button" className="chip" onClick={() => onSelect({ kind: 'settlement', id: s.settlement_id })}>
                      {settlementName(a, s)}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted small">No settlement.</p>
            )}
            <h4>Still reachable after the event from</h4>
            {servedPost.length ? (
              <ul className="chips">
                {servedPost.map((s) => (
                  <li key={s.settlement_id}>
                    <button type="button" className="chip" onClick={() => onSelect({ kind: 'settlement', id: s.settlement_id })}>
                      {settlementName(a, s)}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted small">No settlement has a post-event route to it.</p>
            )}
          </>
        )}
        {usedBy.length > 0 && (
          <>
            <h4>Used by settlement routes</h4>
            <ul className="chips">
              {usedBy.map((s) => (
                <li key={s.settlement_id}>
                  <button type="button" className="chip" onClick={() => onSelect({ kind: 'settlement', id: s.settlement_id })}>
                    {settlementName(a, s)}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </>
    ) : (
      <p>Feature {selection.id} is referenced but has no geometry in this assessment.</p>
    );
  } else if (selection.kind === 'evidence') {
    title = `Evidence ${selection.id}`;
    evidenceIds = [selection.id];
  } else {
    title = `Source ${selection.id}`;
    const src = sources.get(selection.id);
    body = src ? <SourceCard source={src} /> : <p>Unknown source ID {selection.id}.</p>;
  }

  return (
    <aside className="inspector" aria-labelledby="inspector-title" data-testid="inspector">
      <div className="inspector-head">
        <h2 id="inspector-title" ref={heading} tabIndex={-1}>
          {title}
        </h2>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close evidence inspector">
          ×
        </button>
      </div>
      <div className="inspector-body">
        {body}
        {(selection.kind !== 'source' || evidenceIds.length > 0) && (
          <section aria-label="Evidence records">
            <h3>Evidence</h3>
            {evidenceIds.length === 0 && <p className="muted">No evidence IDs attached to this item.</p>}
            {evidenceIds.map((id) => {
              const ev = evidence.get(id);
              return ev ? (
                <EvidenceCard key={id} evidence={ev} sources={sources} onSelectSource={(sid) => onSelect({ kind: 'source', id: sid })} />
              ) : (
                <p key={id} className="warn">
                  Evidence {id} is referenced but missing from the assessment.
                </p>
              );
            })}
          </section>
        )}
        <details className="more timestamps">
          <summary>Timestamps and delivery</summary>
          <dl className="kv">
            <dt>Event date</dt>
            <dd>{a.event_date}</dd>
            <dt>Assessment generated</dt>
            <dd>{formatTime(a.generated_at)}</dd>
            <dt>Received by this browser</dt>
            <dd>
              {formatTime(loaded.received_at)} ({CHANNEL_LABEL[loaded.channel]})
            </dd>
          </dl>
        </details>
        {onOpenBrief && (
          <button type="button" className="primary full" onClick={onOpenBrief}>
            Open cited brief
          </button>
        )}
        <label className="review">
          <input type="checkbox" checked={reviewed.has(key)} onChange={() => onToggleReviewed(key)} />
          Flag as reviewed by me. Reviewing does not change the status or mark anything safe.
        </label>
      </div>
    </aside>
  );
}

function EvidenceCard({ evidence, sources, onSelectSource }: { evidence: Evidence; sources: Map<string, Source>; onSelectSource: (id: string) => void }) {
  return (
    <article className="card" data-testid={`evidence-${evidence.evidence_id}`}>
      <header>
        <span className={`tag tag-${evidence.kind}`}>{KIND_LABEL[evidence.kind]}</span> <code>{evidence.evidence_id}</code>
      </header>
      <p>{evidence.description}</p>
      <p className="small muted">Method {evidence.method_version}</p>
      <ul className="source-list">
        {evidence.source_ids.map((sid) => {
          const s = sources.get(sid);
          return (
            <li key={sid}>
              <button type="button" className="link" onClick={() => onSelectSource(sid)}>
                {sid}
              </button>{' '}
              {s ? (
                <span className="small">
                  {s.kind} · acquired {formatTime(s.acquired_at)}
                </span>
              ) : (
                <span className="warn small">unknown source</span>
              )}
            </li>
          );
        })}
      </ul>
    </article>
  );
}

export function SourceCard({ source }: { source: Source }) {
  return (
    <dl className="kv" data-testid={`source-${source.source_id}`}>
      <dt>Kind</dt>
      <dd>{source.kind}</dd>
      <dt>Acquired</dt>
      <dd>{formatTime(source.acquired_at)}</dd>
      <dt>Usage</dt>
      <dd>{source.usage}</dd>
      <dt>URI</dt>
      <dd className="break">{source.uri}</dd>
      <dt>License</dt>
      <dd>{source.license}</dd>
      <dt>SHA-256</dt>
      <dd>
        <code title={source.sha256}>{shortHash(source.sha256)}</code>
      </dd>
    </dl>
  );
}
