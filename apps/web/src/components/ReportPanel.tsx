import { useEffect, useState } from 'react';
import type { Received } from '../api/client';
import type { GroundedReport, Report } from '../api/contract';
import { CHANNEL_LABEL, MODE_LABEL, formatTime, type LoadedAssessment, type Selection } from '../domain/assessment';
import { attributionFor } from '../map/mapStyle';
import CopilotPanel from './CopilotPanel';
import { describeError } from './PreparePanel';

type Lang = 'en' | 'ne';

// Where report content comes from. All of it is backend output (live API or the
// exact bytes cached in a package); the browser never composes report text.
export interface ReportSource {
  brief: (lang: Lang, signal: AbortSignal) => Promise<Received<GroundedReport>>;
  reviewed: (lang: Lang, signal: AbortSignal) => Promise<Received<Report>>;
  briefHtml: (lang: Lang, signal: AbortSignal) => Promise<Blob>;
  copilot: ((question: string, lang: Lang, signal: AbortSignal) => Promise<Received<GroundedReport>>) | null;
  copilotUnavailable: string | null;
}

interface Props {
  loaded: LoadedAssessment;
  source: ReportSource | null;
  onSelect: (sel: Selection) => void;
}

export const FACT_LABEL: Record<string, string> = {
  potentially_isolated_count: 'Potentially isolated settlements',
  unknown_network_count: 'Settlements with unknown road access',
  exposed_asset_count: 'Exposed assets',
  candidate_flood_area_m2: 'Candidate flood area (m²)',
};

type Load<T> = { kind: 'loading' } | { kind: 'ready'; value: Received<T> } | { kind: 'error'; title: string; detail: string; code: string | null };

function useLoad<T>(fn: ((signal: AbortSignal) => Promise<Received<T>>) | null, deps: unknown[]): Load<T> {
  const [state, setState] = useState<Load<T>>({ kind: 'loading' });
  useEffect(() => {
    if (!fn) return;
    const ctl = new AbortController();
    setState({ kind: 'loading' });
    fn(ctl.signal)
      .then((value) => !ctl.signal.aborted && setState({ kind: 'ready', value }))
      .catch((err) => {
        if (ctl.signal.aborted) return;
        const d = describeError(err);
        setState({ kind: 'error', title: d.title, detail: d.detail, code: (err as { code?: string }).code ?? null });
      });
    return () => ctl.abort();
  }, deps);
  return state;
}

export function generatorLabel(r: Pick<GroundedReport, 'generator' | 'ai_ready'> & { model?: string | null }) {
  if (r.generator === 'deterministic_template' || !r.ai_ready) return { ai: false, text: 'Deterministic template — not AI' };
  return { ai: true, text: `AI: ${r.generator}${r.model ? ` · ${r.model}` : ''}` };
}

function download(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function ReportPanel({ loaded, source, onSelect }: Props) {
  const [lang, setLang] = useState<Lang>('en');
  const a = loaded.assessment;
  const brief = useLoad<GroundedReport>(source ? (s) => source.brief(lang, s) : null, [source, lang]);
  const reviewed = useLoad<Report>(source ? (s) => source.reviewed(lang, s) : null, [source, lang]);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  if (!source) {
    return (
      <section className="panel-section" aria-labelledby="report-title">
        <h2 id="report-title">Situation brief</h2>
        <p className="notice">
          Briefs come from the backend. This assessment came from the {CHANNEL_LABEL[loaded.channel].toLowerCase()}, which has no backend brief, so none is shown.
        </p>
      </section>
    );
  }

  async function saveHtml() {
    setDownloadError(null);
    try {
      download(`${a.assessment_id}-${lang}-brief.html`, await source!.briefHtml(lang, new AbortController().signal));
    } catch (err) {
      setDownloadError(describeError(err).detail);
    }
  }

  return (
    <section className="panel-section report" aria-labelledby="report-title">
      <h2 id="report-title">Situation brief</h2>
      <div className="segmented" role="group" aria-label="Brief language">
        <button type="button" aria-pressed={lang === 'en'} onClick={() => setLang('en')}>
          English
        </button>
        <button type="button" aria-pressed={lang === 'ne'} onClick={() => setLang('ne')} lang="ne">
          नेपाली (Nepali)
        </button>
      </div>

      {brief.kind === 'loading' && <p role="status">Loading brief…</p>}
      {brief.kind === 'error' && (
        <div className="error-box" role="alert">
          <strong>{brief.code === 'no_report_source' ? 'No backend brief in this package' : `Brief unavailable: ${brief.title}`}</strong>
          <p>{brief.detail}</p>
        </div>
      )}
      {brief.kind === 'ready' && <BriefBody received={brief.value} loaded={loaded} onSelect={onSelect} />}

      <p className="small reviewed-status" data-testid="reviewed-status">
        Reviewed {lang === 'ne' ? 'Nepali' : 'English'} report:{' '}
        {reviewed.kind === 'loading'
          ? 'checking…'
          : reviewed.kind === 'ready'
            ? 'available'
            : reviewed.code === 'language_not_ready'
              ? 'not ready — fluent review pending (language_not_ready)'
              : `unavailable (${reviewed.code ?? reviewed.title})`}
      </p>

      {brief.kind === 'ready' && (
        <div className="button-row no-print">
          <button type="button" onClick={() => window.print()}>
            Print brief
          </button>
          <button type="button" onClick={() => void saveHtml()}>
            Download brief (HTML)
          </button>
          <button
            type="button"
            onClick={() => download(`${a.assessment_id}-${lang}-brief.json`, new Blob([JSON.stringify(brief.value.value, null, 2)], { type: 'application/json' }))}
          >
            Download brief JSON
          </button>
        </div>
      )}
      {downloadError && (
        <p className="error-box small" role="alert">
          {downloadError}
        </p>
      )}

      <CopilotPanel key={a.assessment_id} assessmentId={a.assessment_id} ask={source.copilot} unavailable={source.copilotUnavailable} onSelect={onSelect} />
    </section>
  );
}

function BriefBody({ received, loaded, onSelect }: { received: Received<GroundedReport>; loaded: LoadedAssessment; onSelect: (s: Selection) => void }) {
  const r = received.value;
  const a = loaded.assessment;
  const gen = generatorLabel(r);
  const mismatch = r.assessment_id !== a.assessment_id || r.mode !== a.mode;
  if (mismatch) {
    return (
      <p className="error-box" role="alert">
        Brief belongs to {r.assessment_id} ({r.mode}) but the workspace shows {a.assessment_id} ({a.mode}). Not shown.
      </p>
    );
  }
  return (
    <div id="report-print" data-testid="report" lang={r.language}>
      <p className="print-only">
        <strong>TADS Flood situation brief</strong> · {MODE_LABEL[a.mode]} · {a.assessment_id}
      </p>
      <p className="tag-row">
        <span className={`tag ${gen.ai ? 'tag-ai' : 'tag-template'}`} data-testid="report-generator">
          {gen.text}
        </span>
        <span className={`tag tag-mode-${r.mode}`}>{MODE_LABEL[r.mode]}</span>
        {!r.translation_reviewed && r.language !== 'en' && (
          <span className="tag tag-draft" data-testid="draft-badge">
            DRAFT — translation not reviewed
          </span>
        )}
      </p>
      {r.answer && <p className="brief-answer">{r.answer}</p>}
      <table className="facts-table">
        <thead>
          <tr>
            <th scope="col">Fact</th>
            <th scope="col">Value</th>
            <th scope="col">Same as map summary</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(r.facts).map(([k, v]) => {
            const summary = (a.summary as Record<string, unknown>)[k];
            const agree = summary === undefined ? 'not in summary' : summary === v ? 'yes' : `NO (map: ${String(summary)})`;
            return (
              <tr key={k} data-fact={k}>
                <th scope="row">{FACT_LABEL[k] ?? k}</th>
                <td>{typeof v === 'number' && k.endsWith('_m2') ? Math.round(v).toLocaleString('en') : (v ?? 'not computed')}</td>
                <td className={agree.startsWith('NO') ? 'warn' : ''}>{agree}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <h3>Findings</h3>
      <ul className="claims">
        {r.claims.map((c) => (
          <li key={c.claim_id}>
            {c.text}{' '}
            {c.evidence_ids.length ? (
              c.evidence_ids.map((id) => (
                <button key={id} type="button" className="cite" onClick={() => onSelect({ kind: 'evidence', id })} aria-label={`Open evidence ${id}`}>
                  [{id}]
                </button>
              ))
            ) : (
              <span className="warn small">(no evidence ID — unsupported claim)</span>
            )}
          </li>
        ))}
      </ul>
      <h3>Data availability</h3>
      <p className="small">
        Coverage {a.quality.status}, valid fraction {(a.quality.valid_fraction * 100).toFixed(0)}%. Sources:{' '}
        {a.sources.map((s) => `${s.source_id} (${formatTime(s.acquired_at)})`).join('; ')}.
      </p>
      <h3>Limitations</h3>
      <ul className="small">
        {r.limitations.map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ul>
      <p className="small muted">
        Received {formatTime(received.received_at)} via {CHANNEL_LABEL[loaded.channel].toLowerCase()}. Attribution: {attributionFor(a)}.
      </p>
    </div>
  );
}
