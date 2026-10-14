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

export interface ClientOptions {
  fetchImpl?: FetchLike;
  timeoutMs?: number;
}

export interface Received<T> {
  value: T;
  received_at: string;
}

export function createClient({ fetchImpl, timeoutMs = 20_000 }: ClientOptions = {}) {
  const doFetch: FetchLike = fetchImpl ?? ((...args) => fetch(...args));

  async function send(path: string, init: RequestInit & { signal?: AbortSignal } = {}, accept = 'application/json'): Promise<Response> {
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(), timeoutMs);
    const outer = init.signal;
    const onOuterAbort = () => timeout.abort();
    outer?.addEventListener('abort', onOuterAbort);
    let res: Response;
    try {
      res = await doFetch(path, {
        ...init,
        signal: timeout.signal,
        headers: { Accept: accept, ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
      });
    } catch (err) {
      if (outer?.aborted) throw new ApiError('cancelled', 'Request cancelled by the user.');
      if (timeout.signal.aborted) throw new ApiError('timeout', `No response within ${timeoutMs / 1000} s.`, null, null, true);
      throw new ApiError('network', `Network request failed: ${(err as Error).message}`, null, null, true);
    } finally {
      clearTimeout(timer);
      outer?.removeEventListener('abort', onOuterAbort);
    }
    return res;
  }

  async function errorFrom(res: Response, path: string): Promise<ApiError> {
    let body: unknown = null;
    try {
      body = JSON.parse(await res.text());
    } catch {
      /* not JSON */
    }
    const env = ErrorEnvelopeSchema.safeParse(body);
    if (env.success) return new ApiError('http', env.data.error.message, res.status, env.data.error.code, env.data.error.retryable);
    return new ApiError('http', `HTTP ${res.status} from ${path}.`, res.status, null, res.status >= 500);
  }

  // Raw bytes for hashing: never re-serialised. Only same-origin API paths.
  async function bytes(path: string, signal?: AbortSignal): Promise<{ bytes: ArrayBuffer; contentType: string }> {
    if (!isSameOriginApiPath(path)) throw new ApiError('invalid_response', `Refusing to fetch non-API path ${path}.`);
    const res = await send(path, { signal }, '*/*');
    if (!res.ok) throw await errorFrom(res, path);
    try {
      return { bytes: await res.arrayBuffer(), contentType: res.headers.get('content-type') ?? '' };
    } catch (err) {
      throw new ApiError('network', `Download of ${path} was interrupted: ${(err as Error).message}`, null, null, true);
    }
  }

  async function request(path: string, init: RequestInit & { signal?: AbortSignal } = {}): Promise<unknown> {
    const res = await send(path, init);
    let body: unknown = null;
    const text = await res.text();
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        throw new ApiError('invalid_response', `Response from ${path} was not JSON (HTTP ${res.status}).`, res.status);
      }
    }
    if (!res.ok) {
      const env = ErrorEnvelopeSchema.safeParse(body);
      if (env.success) {
        const e = env.data.error;
        throw new ApiError('http', e.message, res.status, e.code, e.retryable);
      }
      throw new ApiError('http', `HTTP ${res.status} from ${path}.`, res.status, null, res.status >= 500);
    }
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
    async getBrief(id: string, language: 'en' | 'ne', signal?: AbortSignal): Promise<Received<GroundedReport>> {
      const body = await request(`/api/v1/assessments/${encodeURIComponent(id)}/brief?language=${language}&format=json`, { signal });
      const r = GroundedReportSchema.safeParse(body);
      if (!r.success) throw new ApiError('invalid_response', 'Brief did not match the GroundedReport contract.');
      return { value: r.data, received_at: now() };
    },
    // Backend-rendered printable brief (exact bytes, for download/print).
    async briefHtml(id: string, language: 'en' | 'ne', signal?: AbortSignal) {
      return bytes(`/api/v1/assessments/${encodeURIComponent(id)}/brief?language=${language}&format=html`, signal);
    },
    async askCopilot(id: string, question: string, language: 'en' | 'ne', signal?: AbortSignal): Promise<Received<GroundedReport>> {
      const body = await request(`/api/v1/assessments/${encodeURIComponent(id)}/copilot`, {
        method: 'POST',
        body: JSON.stringify({ question, language }),
        signal,
      });
      const r = GroundedReportSchema.safeParse(body);
      if (!r.success) throw new ApiError('invalid_response', 'Copilot answer did not match the GroundedReport contract; nothing is shown.');
      if (r.data.assessment_id !== id) throw new ApiError('invalid_response', 'Copilot answer belongs to a different assessment; discarded.');
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
    async getReport(id: string, language: 'en' | 'ne', signal?: AbortSignal): Promise<Received<Report>> {
      const body = await request(`/api/v1/assessments/${encodeURIComponent(id)}/report?language=${language}`, { signal });
      const report = ReportSchema.safeParse(body);
      if (!report.success) throw new ApiError('invalid_response', 'Report did not match the expected shape.');
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
