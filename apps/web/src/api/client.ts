// API adapter for the v1 contract. Same-origin paths only: the Vite dev/preview
// server proxies /api and /health to VITE_API_BASE_URL. A failed request is an
// error for the UI to show; this module never substitutes fixture data.
import {
  AssessmentPackageSchema,
  ErrorEnvelopeSchema,
  GroundedReportSchema,
  JobSchema,
  ReadinessSchema,
  ReportSchema,
  isSameOriginApiPath,
  parseAssessment,
  type Assessment,
  type AssessmentPackage,
  type AssessmentRequest,
  type GroundedReport,
  type Job,
  type Readiness,
  type Report,
} from './contract';
import { checkBriefHtmlScope } from './briefHtml';

export type ApiErrorKind = 'network' | 'http' | 'invalid_response' | 'unsupported_version' | 'cancelled' | 'timeout';

export class ApiError extends Error {
  constructor(
    public kind: ApiErrorKind,
    message: string,
    public status: number | null = null,
    public code: string | null = null,
    public retryable = false,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type FetchLike = typeof fetch;

export type Lang = 'en' | 'ne';
export interface ReportScope {
  assessment_id: string;
  language: Lang;
  // The assessment's mode, when known; a report in another mode is rejected.
  mode?: Assessment['mode'];
}

// A 200 report/brief/answer must belong to exactly the requested assessment,
// mode and language before it is shown, exported or stored offline.
export function checkReportScope(v: { assessment_id: string; mode: string; language: string }, scope: ReportScope, what: string) {
  if (v.assessment_id !== scope.assessment_id) {
    throw new ApiError('invalid_response', `${what} belongs to ${v.assessment_id}, not ${scope.assessment_id}; discarded.`);
  }
  if (scope.mode && v.mode !== scope.mode) throw new ApiError('invalid_response', `${what} is ${v.mode} but the assessment is ${scope.mode}; discarded.`);
  if (v.language !== scope.language) throw new ApiError('invalid_response', `${what} is in ${v.language}, not the requested ${scope.language}; discarded.`);
}

export interface ClientOptions {
  fetchImpl?: FetchLike;
  // Deadline for a whole exchange: headers AND body.
  timeoutMs?: number;
  // Copilot model calls can take tens of seconds on a cold local model.
  copilotTimeoutMs?: number;
}

export interface Received<T> {
  value: T;
  received_at: string;
}

type Body<K extends 'text' | 'bytes'> = K extends 'text' ? string : ArrayBuffer;
interface Exchange<K extends 'text' | 'bytes'> {
  status: number;
  ok: boolean;
  contentType: string;
  body: Body<K>;
}

export function createClient({ fetchImpl, timeoutMs = 20_000, copilotTimeoutMs = 90_000 }: ClientOptions = {}) {
  const doFetch: FetchLike = fetchImpl ?? ((...args) => fetch(...args));

  // One deadline and one cancellation cover the request and the full body read.
  // The body is raced against the abort signal (and its stream cancelled), so a
  // body that stalls after the headers can never leave a caller waiting.
  async function exchange<K extends 'text' | 'bytes'>(
    path: string,
    init: RequestInit & { signal?: AbortSignal },
    accept: string,
    kind: K,
    deadlineMs = timeoutMs,
  ): Promise<Exchange<K>> {
    const ctl = new AbortController();
    const outer = init.signal;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      ctl.abort();
    }, deadlineMs);
    const onOuterAbort = () => ctl.abort();
    if (outer?.aborted) ctl.abort();
    outer?.addEventListener('abort', onOuterAbort);
    let rejectAbort: (e: unknown) => void = () => undefined;
    const aborted = new Promise<never>((_, reject) => (rejectAbort = reject));
    aborted.catch(() => undefined);
    const onAbort = () => rejectAbort(new DOMException('aborted', 'AbortError'));
    ctl.signal.addEventListener('abort', onAbort);
    let res: Response | null = null;
    const fail = (err: unknown, stage: 'request' | 'body'): ApiError => {
      if (outer?.aborted) return new ApiError('cancelled', 'Request cancelled by the user.');
      if (timedOut) {
        return new ApiError('timeout', stage === 'request' ? `No response within ${deadlineMs / 1000} s.` : `Response from ${path} stalled; gave up after ${deadlineMs / 1000} s.`, null, null, true);
      }
      return stage === 'request'
        ? new ApiError('network', `Network request failed: ${(err as Error).message}`, null, null, true)
        : new ApiError('network', `Download of ${path} was interrupted: ${(err as Error).message}`, null, null, true);
    };
    try {
      try {
        if (ctl.signal.aborted) throw new DOMException('aborted', 'AbortError');
        res = await Promise.race([
          doFetch(path, {
            ...init,
            signal: ctl.signal,
            headers: { Accept: accept, ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
          }),
          aborted,
        ]);
      } catch (err) {
        throw fail(err, 'request');
      }
      try {
        const read = (kind === 'text' ? res.text() : res.arrayBuffer()) as Promise<Body<K>>;
        read.catch(() => undefined);
        const body = await Promise.race([read, aborted]);
        return { status: res.status, ok: res.ok, contentType: res.headers.get('content-type') ?? '', body };
      } catch (err) {
        res.body?.cancel().catch(() => undefined);
        throw fail(err, 'body');
      }
    } finally {
      clearTimeout(timer);
      outer?.removeEventListener('abort', onOuterAbort);
      ctl.signal.removeEventListener('abort', onAbort);
    }
  }

  function errorFrom(status: number, text: string, path: string): ApiError {
    let body: unknown = null;
    try {
      body = JSON.parse(text);
    } catch {
      /* not JSON */
    }
    const env = ErrorEnvelopeSchema.safeParse(body);
    if (env.success) return new ApiError('http', env.data.error.message, status, env.data.error.code, env.data.error.retryable);
    return new ApiError('http', `HTTP ${status} from ${path}.`, status, null, status >= 500);
  }

  // Raw bytes for hashing: never re-serialised. Only same-origin API paths.
  async function bytes(path: string, signal?: AbortSignal): Promise<{ bytes: ArrayBuffer; contentType: string }> {
    if (!isSameOriginApiPath(path)) throw new ApiError('invalid_response', `Refusing to fetch non-API path ${path}.`);
    const r = await exchange(path, { signal }, '*/*', 'bytes');
    if (!r.ok) throw errorFrom(r.status, new TextDecoder().decode(r.body), path);
    return { bytes: r.body, contentType: r.contentType };
  }

  async function request(path: string, init: RequestInit & { signal?: AbortSignal } = {}, deadlineMs = timeoutMs): Promise<unknown> {
    const r = await exchange(path, init, 'application/json', 'text', deadlineMs);
    let body: unknown = null;
    if (r.body) {
      try {
        body = JSON.parse(r.body);
      } catch {
        if (!r.ok) throw errorFrom(r.status, r.body, path);
        throw new ApiError('invalid_response', `Response from ${path} was not JSON (HTTP ${r.status}).`, r.status);
      }
    }
    if (!r.ok) throw errorFrom(r.status, r.body, path);
    return body;
  }

  function parsedAssessment(body: unknown): Assessment {
    const parsed = parseAssessment(body);
    if (parsed.ok) return parsed.assessment;
    if (parsed.kind === 'unsupported_version') {
      throw new ApiError('unsupported_version', `Unsupported schema version: ${String(parsed.found)}.`);
    }
    throw new ApiError('invalid_response', `Assessment failed validation: ${parsed.issues.slice(0, 3).join('; ')}`);
  }

  const now = () => new Date().toISOString();

  return {
    async health(signal?: AbortSignal) {
      return request('/health', { signal }) as Promise<{ status: string; schema_version: string }>;
    },
    async readiness(signal?: AbortSignal): Promise<Readiness> {
      const r = ReadinessSchema.safeParse(await request('/api/v1/readiness', { signal }));
      if (!r.success) throw new ApiError('invalid_response', 'Readiness response did not match the contract.');
      return r.data;
    },
    // Computed synthetic training scene (populated layers + radar previews).
    async getGeographicDemo(signal?: AbortSignal): Promise<Received<Assessment>> {
      const value = parsedAssessment(await request('/api/v1/demo/geographic', { signal }));
      return { value, received_at: now() };
    },
    async getPackage(id: string, signal?: AbortSignal): Promise<AssessmentPackage> {
      const p = AssessmentPackageSchema.safeParse(await request(`/api/v1/assessments/${encodeURIComponent(id)}/package`, { signal }));
      if (!p.success) throw new ApiError('invalid_response', `Package manifest did not match the contract: ${p.error.issues[0]?.path.join('.')}`);
      if (p.data.assessment_id !== id) throw new ApiError('invalid_response', 'Package manifest names a different assessment.');
      return p.data;
    },
    bytes,
    async getBrief(id: string, language: Lang, signal?: AbortSignal, mode?: Assessment['mode']): Promise<Received<GroundedReport>> {
      const body = await request(`/api/v1/assessments/${encodeURIComponent(id)}/brief?language=${language}&format=json`, { signal });
      const r = GroundedReportSchema.safeParse(body);
      if (!r.success) throw new ApiError('invalid_response', 'Brief did not match the GroundedReport contract.');
      checkReportScope(r.data, { assessment_id: id, language, mode }, 'Brief');
      return { value: r.data, received_at: now() };
    },
    // Backend-rendered printable brief (exact bytes, for download/print).
    async briefHtml(id: string, language: 'en' | 'ne', signal?: AbortSignal, mode?: Assessment['mode']) {
      const result = await bytes(`/api/v1/assessments/${encodeURIComponent(id)}/brief?language=${language}&format=html`, signal);
      try {
        checkBriefHtmlScope(result.bytes, { assessment_id: id, language, mode });
      } catch (err) {
        throw new ApiError('invalid_response', (err as Error).message);
      }
      return result;
    },
    async askCopilot(id: string, question: string, language: Lang, signal?: AbortSignal, mode?: Assessment['mode']): Promise<Received<GroundedReport>> {
      const body = await request(
        `/api/v1/assessments/${encodeURIComponent(id)}/copilot`,
        { method: 'POST', body: JSON.stringify({ question, language }), signal },
        copilotTimeoutMs,
      );
      const r = GroundedReportSchema.safeParse(body);
      if (!r.success) throw new ApiError('invalid_response', 'Copilot answer did not match the GroundedReport contract; nothing is shown.');
      checkReportScope(r.data, { assessment_id: id, language, mode }, 'Copilot answer');
      return { value: r.data, received_at: now() };
    },
    async getDemo(signal?: AbortSignal): Promise<Received<Assessment>> {
      const value = parsedAssessment(await request('/api/v1/demo', { signal }));
      return { value, received_at: now() };
    },
    async getAssessment(id: string, signal?: AbortSignal): Promise<Received<Assessment>> {
      const value = parsedAssessment(await request(`/api/v1/assessments/${encodeURIComponent(id)}`, { signal }));
      return { value, received_at: now() };
    },
    async createAssessment(req: AssessmentRequest, signal?: AbortSignal): Promise<Job> {
      const body = await request('/api/v1/assessments', { method: 'POST', body: JSON.stringify(req), signal });
      const job = JobSchema.safeParse(body);
      if (!job.success) throw new ApiError('invalid_response', 'Assessment job response did not match the contract.');
      return job.data;
    },
    // Planned endpoints (API_CONTRACT.md). Until Codex ships them they return 404,
    // which surfaces as an error rather than a fabricated status.
    async getJob(jobId: string, signal?: AbortSignal): Promise<Job> {
      const body = await request(`/api/v1/jobs/${encodeURIComponent(jobId)}`, { signal });
      const job = JobSchema.safeParse(body);
      if (!job.success) throw new ApiError('invalid_response', 'Job status did not match the contract.');
      return job.data;
    },
    async cancelJob(jobId: string): Promise<void> {
      await request(`/api/v1/jobs/${encodeURIComponent(jobId)}/cancel`, { method: 'POST' });
    },
    async getReport(id: string, language: Lang, signal?: AbortSignal, mode?: Assessment['mode']): Promise<Received<Report>> {
      const body = await request(`/api/v1/assessments/${encodeURIComponent(id)}/report?language=${language}`, { signal });
      const report = ReportSchema.safeParse(body);
      if (!report.success) throw new ApiError('invalid_response', 'Report did not match the expected shape.');
      checkReportScope(report.data, { assessment_id: id, language, mode }, 'Report');
      return { value: report.data, received_at: now() };
    },
  };
}

export type ApiClient = ReturnType<typeof createClient>;

export const TERMINAL_JOB = new Set(['completed', 'failed', 'cancelled']);

export interface RunOptions {
  signal: AbortSignal;
  onJob?: (job: Job) => void;
  pollMs?: number;
  maxPolls?: number;
}

// Create a job, follow it to a terminal state and load the assessment. A user
// cancel aborts in-flight requests and asks the server to cancel a live job.
export async function runAssessment(client: ApiClient, req: AssessmentRequest, opts: RunOptions) {
  const { signal, onJob, pollMs = 1500, maxPolls = 400 } = opts;
  let job = await client.createAssessment(req, signal);
  onJob?.(job);
  let polls = 0;
  while (!TERMINAL_JOB.has(job.status)) {
    if (signal.aborted) {
      await client.cancelJob(job.job_id).catch(() => undefined);
      throw new ApiError('cancelled', 'Assessment cancelled by the user.');
    }
    if (++polls > maxPolls) throw new ApiError('timeout', 'Assessment job did not finish within the polling budget.');
    await sleep(pollMs, signal).catch(() => undefined);
    if (signal.aborted) continue;
    job = await client.getJob(job.job_id, signal);
    onJob?.(job);
  }
  if (job.status === 'cancelled') throw new ApiError('cancelled', 'The server reports the job was cancelled.');
  if (job.status === 'failed') {
    const env = ErrorEnvelopeSchema.safeParse({ error: job.error });
    throw new ApiError('http', env.success ? env.data.error.message : 'Assessment job failed.', null, env.success ? env.data.error.code : null);
  }
  if (!job.assessment_id) throw new ApiError('invalid_response', 'Completed job has no assessment_id.');
  return client.getAssessment(job.assessment_id, signal);
}

function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(t);
      reject(new Error('aborted'));
    });
  });
}

export function validateRequest(raw: { west: string; south: string; east: string; north: string; event_date: string }) {
  const errors: string[] = [];
  const nums = [raw.west, raw.south, raw.east, raw.north].map((v) => (v.trim() === '' ? NaN : Number(v)));
  const [w, s, e, n] = nums;
  if (nums.some((v) => !Number.isFinite(v))) errors.push('All four bounds must be numbers.');
  else {
    if (w < -180 || e > 180 || w > 180 || e < -180) errors.push('Longitude (west/east) must be between -180 and 180.');
    if (s < -90 || n > 90 || s > 90 || n < -90) errors.push('Latitude (south/north) must be between -90 and 90.');
    if (!(w < e)) errors.push('West must be less than east (bbox order is west, south, east, north).');
    if (!(s < n)) errors.push('South must be less than north (bbox order is west, south, east, north).');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw.event_date) || Number.isNaN(Date.parse(raw.event_date))) {
    errors.push('Flood date must be a calendar date (YYYY-MM-DD).');
  }
  return { errors, bbox: errors.length ? null : ([w, s, e, n] as [number, number, number, number]) };
}
