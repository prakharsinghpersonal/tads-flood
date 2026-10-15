import type { Assessment } from './contract';

// Parse as an inert document. Never attach downloaded HTML to the workspace.
// Metadata is additive; older backend briefs carry the same scope in the header.
export function checkBriefHtmlScope(bytes: ArrayBuffer, scope: {
  assessment_id: string;
  language: 'en' | 'ne';
  mode?: Assessment['mode'];
}) {
  const doc = new DOMParser().parseFromString(new TextDecoder().decode(bytes), 'text/html');
  if (doc.documentElement.lang !== scope.language) throw new Error('HTML brief language disagrees with the request.');
  const fields = ['assessment-id', 'mode', 'language'] as const;
  const rows = fields.map((field) => doc.querySelectorAll(`meta[name="tads-${field}"]`));
  let id: string | null;
  let mode: string | null;
  let language: string | null;
  if (rows.some((row) => row.length > 0)) {
    if (rows.some((row) => row.length !== 1)) throw new Error('HTML brief has incomplete or duplicate scope metadata.');
    [id, mode, language] = rows.map((row) => row[0].getAttribute('content'));
  } else {
    const header = doc.querySelector('body > header');
    const label = header?.querySelector('small')?.textContent?.split(' · Event:')[0].trim();
    id = label?.startsWith('Assessment: ') ? label.slice('Assessment: '.length) : null;
    mode = header?.querySelector('.mode')?.textContent?.trim().toLowerCase() ?? null;
    language = doc.documentElement.lang;
  }
  if (id !== scope.assessment_id) throw new Error('HTML brief assessment disagrees with the request.');
  if (language !== scope.language) throw new Error('HTML brief language disagrees with the request.');
  if ((mode !== 'live' && mode !== 'synthetic') || (scope.mode && mode !== scope.mode)) {
    throw new Error('HTML brief mode disagrees with the assessment.');
  }
}
