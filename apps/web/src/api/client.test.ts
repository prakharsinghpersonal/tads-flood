// T03/T04/T05: deadlines and cancellation must cover the whole exchange,
// including the body read, and leave no timers or listeners behind.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, createClient } from './client';
import { GEO_ID, testBriefHtml } from '../test/fakeApi';

// A fetch double that behaves like the platform: rejects when its signal aborts
// and errors its body stream on abort.
function signalAwareFetch(make: (signal: AbortSignal) => { status?: number; stream: ReadableStream<Uint8Array>; type?: string }) {
  const seen: AbortSignal[] = [];
  const impl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
    const signal = init!.signal!;
    seen.push(signal);
    if (signal.aborted) throw new DOMException('aborted', 'AbortError');
    const { status = 200, stream, type = 'application/json' } = make(signal);
    return new Response(stream, { status, headers: { 'content-type': type } });
  }) as unknown as typeof fetch;
  return { impl, seen };
}

// Headers arrive, then the body stalls forever (optionally ignoring abort).
function stalledBody(signal: AbortSignal, honourAbort = true, first = '{"partial":') {
  return new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(new TextEncoder().encode(first));
      if (honourAbort) signal.addEventListener('abort', () => c.error(new DOMException('aborted', 'AbortError')));
    },
  });
}

afterEach(() => {
  vi.useRealTimers();
});

describe('client exchange deadlines (T03/T04/T05)', () => {
  it('HTML export rejects a successful response from another scope', async () => {
    const reply = (html: string) => vi.fn(async () => new Response(html, { status: 200, headers: { 'content-type': 'text/html' } })) as unknown as typeof fetch;
    await expect(createClient({ fetchImpl: reply(testBriefHtml()) }).briefHtml(GEO_ID, 'en', undefined, 'synthetic')).resolves.toBeTruthy();
    await expect(createClient({ fetchImpl: reply(testBriefHtml('another-area')) }).briefHtml(GEO_ID, 'en', undefined, 'synthetic')).rejects.toMatchObject({ kind: 'invalid_response' });
    await expect(createClient({ fetchImpl: reply(testBriefHtml(GEO_ID, 'live')) }).briefHtml(GEO_ID, 'en', undefined, 'synthetic')).rejects.toMatchObject({ kind: 'invalid_response' });
  });
  it('T03: headers then a stalled JSON body hits the deadline with a readable error', async () => {
    const { impl, seen } = signalAwareFetch((signal) => ({ stream: stalledBody(signal) }));
    const client = createClient({ fetchImpl: impl, timeoutMs: 50 });
    const err = await client.readiness().catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ kind: 'timeout', retryable: true });
    expect(err.message).toMatch(/stalled; gave up after 0.05 s/);
    expect(seen[0].aborted).toBe(true);
  });

  it('T03: a body that ignores abort still cannot hang the caller', async () => {
    const { impl } = signalAwareFetch((signal) => ({ stream: stalledBody(signal, false) }));
    const client = createClient({ fetchImpl: impl, timeoutMs: 50 });
    await expect(client.bytes('/api/v1/assessments/a/imagery/after')).rejects.toMatchObject({ kind: 'timeout' });
  });

  it('T04: cancelling during a PNG body read rejects as cancelled and clears timers', async () => {
    vi.useFakeTimers();
    const ctl = new AbortController();
    const { impl, seen } = signalAwareFetch((signal) => ({ stream: stalledBody(signal, true, '\x89PNG'), type: 'image/png' }));
    const client = createClient({ fetchImpl: impl, timeoutMs: 20_000 });
    const pending = client.bytes('/api/v1/assessments/a/imagery/after', ctl.signal);
    pending.catch(() => undefined);
    await vi.advanceTimersByTimeAsync(10);
    expect(vi.getTimerCount()).toBe(1); // the exchange deadline is armed
    ctl.abort();
    await expect(pending).rejects.toMatchObject({ kind: 'cancelled' });
    expect(seen[0].aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('T04: an already-aborted signal never starts a request', async () => {
    const { impl } = signalAwareFetch((signal) => ({ stream: stalledBody(signal) }));
    const ctl = new AbortController();
    ctl.abort();
    await expect(createClient({ fetchImpl: impl }).bytes('/api/v1/assessments/a/snapshot', ctl.signal)).rejects.toMatchObject({ kind: 'cancelled' });
  });

  it('an interrupted body is a retryable network error, not a hang or a partial result', async () => {
    const { impl } = signalAwareFetch(() => ({
      stream: new ReadableStream({
        start(c) {
          c.enqueue(new Uint8Array([1, 2]));
          setTimeout(() => c.error(new TypeError('connection reset')), 5);
        },
      }),
      type: 'image/png',
    }));
    await expect(createClient({ fetchImpl: impl }).bytes('/api/v1/assessments/a/imagery/before')).rejects.toMatchObject({
      kind: 'network',
      retryable: true,
      message: expect.stringMatching(/was interrupted: connection reset/),
    });
  });

  it('normal completion returns the exact bytes and clears its timer', async () => {
    vi.useFakeTimers();
    const payload = new Uint8Array([137, 80, 78, 71, 9]);
    const { impl } = signalAwareFetch(() => ({
      stream: new ReadableStream({
        start(c) {
          c.enqueue(payload);
          c.close();
        },
      }),
      type: 'image/png',
    }));
    const got = await createClient({ fetchImpl: impl }).bytes('/api/v1/assessments/a/imagery/before');
    expect(new Uint8Array(got.bytes)).toEqual(payload);
    expect(got.contentType).toBe('image/png');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('T05: copilot waits for a slow local model beyond the generic deadline, up to its own bound', async () => {
    vi.useFakeTimers();
    const { impl } = signalAwareFetch((signal) => ({ stream: stalledBody(signal) }));
    const client = createClient({ fetchImpl: impl, timeoutMs: 20_000, copilotTimeoutMs: 90_000 });
    let settled: unknown = 'pending';
    const p = client.askCopilot('a', 'Which settlements?', 'en').then(
      () => (settled = 'resolved'),
      (e) => (settled = e),
    );
    await vi.advanceTimersByTimeAsync(45_000); // a ~44 s cold start must not be cut off
    expect(settled).toBe('pending');
    await vi.advanceTimersByTimeAsync(45_001);
    await p;
    expect(settled).toMatchObject({ kind: 'timeout' });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('T05: cancel stays usable during a long copilot request', async () => {
    const { impl } = signalAwareFetch((signal) => ({ stream: stalledBody(signal) }));
    const ctl = new AbortController();
    const p = createClient({ fetchImpl: impl }).askCopilot('a', 'q', 'en', ctl.signal);
    setTimeout(() => ctl.abort(), 5);
    await expect(p).rejects.toMatchObject({ kind: 'cancelled' });
  });

  it('T06: a 200 brief or report for another assessment, mode or language is rejected', async () => {
    const reply = (body: unknown) =>
      vi.fn(async () => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch;
    const brief = {
      assessment_id: 'a', mode: 'synthetic', generator: 'deterministic_template', ai_ready: false, language: 'en',
      facts: {}, claims: [], limitations: [], model: null, refused: false, answer: '', translation_reviewed: true,
    };
    await expect(createClient({ fetchImpl: reply(brief) }).getBrief('a', 'en', undefined, 'synthetic')).resolves.toBeTruthy();
    await expect(createClient({ fetchImpl: reply({ ...brief, assessment_id: 'b' }) }).getBrief('a', 'en')).rejects.toThrow(/belongs to b/);
    await expect(createClient({ fetchImpl: reply({ ...brief, language: 'ne' }) }).getBrief('a', 'en')).rejects.toThrow(/is in ne/);
    await expect(createClient({ fetchImpl: reply({ ...brief, mode: 'live' }) }).getBrief('a', 'en', undefined, 'synthetic')).rejects.toThrow(/is live/);
    const { model: _m, refused: _r, answer: _a, translation_reviewed: _t, ...report } = brief;
    await expect(createClient({ fetchImpl: reply({ ...report, language: 'ne' }) }).getReport('a', 'en')).rejects.toThrow(/is in ne/);
    await expect(createClient({ fetchImpl: reply({ ...brief, assessment_id: 'b' }) }).askCopilot('a', 'q', 'en')).rejects.toThrow(/belongs to b/);
  });
});
