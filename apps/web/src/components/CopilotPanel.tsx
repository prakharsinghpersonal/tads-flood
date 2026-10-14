import { useRef, useState } from 'react';
import { ApiError, type Received } from '../api/client';
import type { GroundedReport } from '../api/contract';
import { formatTime, type Selection } from '../domain/assessment';
import { describeError } from './PreparePanel';
import { generatorLabel } from './ReportPanel';

type Lang = 'en' | 'ne';

interface Props {
  // Remounted (keyed) per assessment, so an answer never outlives its area.
  assessmentId: string;
  ask: ((question: string, lang: Lang, signal: AbortSignal) => Promise<Received<GroundedReport>>) | null;
  unavailable: string | null;
  onSelect: (sel: Selection) => void;
}

type State =
  | { kind: 'idle' }
  | { kind: 'asking'; question: string }
  | { kind: 'answer'; question: string; received: Received<GroundedReport> }
  | { kind: 'not_configured'; message: string }
  | { kind: 'error'; title: string; detail: string };

const EXAMPLES = ['Which mapped settlements may be isolated?', 'Which road edges are candidate cuts, and what is the evidence?', 'What data is missing or uncertain?'];

export default function CopilotPanel({ assessmentId, ask, unavailable, onSelect }: Props) {
  const [question, setQuestion] = useState('');
  const [lang, setLang] = useState<Lang>('en');
  const [state, setState] = useState<State>({ kind: 'idle' });
  const [formError, setFormError] = useState<string | null>(null);
  const seq = useRef(0);
  const abort = useRef<AbortController | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const q = question.trim();
    if (q.length < 1 || q.length > 2000) {
      setFormError('Ask a question of 1–2000 characters.');
      return;
    }
    if (!ask) return;
    setFormError(null);
    abort.current?.abort();
    const ctl = new AbortController();
    abort.current = ctl;
    const mine = ++seq.current;
    setState({ kind: 'asking', question: q });
    try {
      const received = await ask(q, lang, ctl.signal);
      if (mine !== seq.current) return; // a newer question superseded this one
      if (received.value.assessment_id !== assessmentId) {
        setState({ kind: 'error', title: 'Answer discarded', detail: 'The answer was for a different assessment.' });
        return;
      }
      setState({ kind: 'answer', question: q, received });
    } catch (err) {
      if (mine !== seq.current || ctl.signal.aborted) return;
      if (err instanceof ApiError && err.code === 'ai_not_configured') {
        setState({ kind: 'not_configured', message: err.message });
        return;
      }
      setState({ kind: 'error', ...describeError(err) });
    }
  }

  return (
    <section className="copilot" aria-labelledby="copilot-title" data-testid="copilot">
      <h3 id="copilot-title">Ask the copilot</h3>
      <p className="small muted">Answers come only from this assessment's computed facts, with citations. Numbers are inserted by the backend, not the model.</p>
      {!ask ? (
        <p className="notice small" data-testid="copilot-unavailable">
          {unavailable ?? 'Copilot unavailable.'}
        </p>
      ) : (
        <form onSubmit={submit}>
          <label className="field">
            <span>Question</span>
            <textarea value={question} maxLength={2000} rows={3} onChange={(e) => setQuestion(e.target.value)} />
          </label>
          <div className="chips" role="group" aria-label="Example questions">
            {EXAMPLES.map((ex) => (
              <button key={ex} type="button" className="chip chip-text" onClick={() => setQuestion(ex)}>
                {ex}
              </button>
            ))}
          </div>
          <div className="button-row">
            <label className="inline-select">
              <span>Answer language</span>
              <select value={lang} onChange={(e) => setLang(e.target.value as Lang)}>
                <option value="en">English</option>
                <option value="ne">नेपाली (Nepali, unreviewed)</option>
              </select>
            </label>
            <button type="submit" className="primary" disabled={state.kind === 'asking'}>
              Ask
            </button>
            {state.kind === 'asking' && (
              <button
                type="button"
                onClick={() => {
                  seq.current++;
                  abort.current?.abort();
                  setState({ kind: 'idle' });
                }}
              >
                Cancel
              </button>
            )}
          </div>
          {formError && (
            <p className="form-errors" role="alert">
              {formError}
            </p>
          )}
        </form>
      )}

      <div aria-live="polite">
        {state.kind === 'asking' && <p role="status">Asking about {assessmentId}…</p>}
        {state.kind === 'not_configured' && (
          <div className="notice" data-testid="copilot-not-configured">
            <strong>AI copilot is not configured on the server.</strong>
            <p className="small">{state.message} No answer was generated, and no template is shown in its place.</p>
          </div>
        )}
        {state.kind === 'error' && (
          <div className="error-box" role="alert">
            <strong>{state.title}</strong>
            <p>{state.detail}</p>
          </div>
        )}
        {state.kind === 'answer' && <Answer question={state.question} received={state.received} onSelect={onSelect} />}
      </div>
    </section>
  );
}

function Answer({ question, received, onSelect }: { question: string; received: Received<GroundedReport>; onSelect: (s: Selection) => void }) {
  const r = received.value;
  const gen = generatorLabel(r);
  return (
    <article className="card answer" data-testid="copilot-answer" lang={r.language}>
      <p className="small muted">Q: {question}</p>
      <p className="tag-row">
        <span className={`tag ${gen.ai ? 'tag-ai' : 'tag-template'}`} data-testid="copilot-generator">
          {gen.text}
        </span>
        {r.refused && (
          <span className="tag tag-refused" data-testid="copilot-refused">
            Refused
          </span>
        )}
        {r.language !== 'en' && !r.translation_reviewed && <span className="tag tag-draft">DRAFT — translation not reviewed</span>}
      </p>
      <p>{r.answer}</p>
      {!r.refused && r.claims.length > 0 && (
        <ul className="claims">
          {r.claims.map((c) => (
            <li key={c.claim_id}>
              {c.text}{' '}
              {c.evidence_ids.map((id) => (
                <button key={id} type="button" className="cite" onClick={() => onSelect({ kind: 'evidence', id })} aria-label={`Open evidence ${id}`}>
                  [{id}]
                </button>
              ))}
            </li>
          ))}
        </ul>
      )}
      <p className="small muted">Answered {formatTime(received.received_at)} for {r.assessment_id}.</p>
    </article>
  );
}
