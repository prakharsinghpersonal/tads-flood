import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseAssessment } from './contract';
import uiFixture from '../fixtures/synthetic-ui-assessment.json';

const shared = JSON.parse(readFileSync(resolve(__dirname, '../../../../fixtures/synthetic/assessment.json'), 'utf8'));
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

describe('v1 contract parsing', () => {
  it('accepts the shared Codex fixture unchanged (G0 gate)', () => {
    const r = parseAssessment(shared);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.assessment.mode).toBe('synthetic');
      expect(r.warnings).toEqual([]);
    }
  });

  it('accepts the frontend geometry fixture with consistent counts', () => {
    const r = parseAssessment(uiFixture);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.warnings).toEqual([]);
  });

  it('refuses an unsupported schema version instead of guessing', () => {
    const p = clone(shared);
    p.schema_version = '2.0.0';
    expect(parseAssessment(p)).toEqual({ ok: false, kind: 'unsupported_version', found: '2.0.0' });
    delete p.schema_version;
    expect(parseAssessment(p)).toMatchObject({ ok: false, kind: 'unsupported_version' });
  });

  it('rejects unknown fields (strict contract) and reversed bbox', () => {
    const extra = clone(shared);
    extra.flood_probability = 0.9;
    expect(parseAssessment(extra).ok).toBe(false);
    const reversed = clone(shared);
    reversed.bbox = [85.27, 27.85, 85.25, 27.87];
    expect(parseAssessment(reversed).ok).toBe(false);
    const outOfRange = clone(shared);
    outOfRange.bbox = [85.25, 27.85, 85.27, 95];
    expect(parseAssessment(outOfRange).ok).toBe(false);
  });

  it('rejects evaluation_only sources and dangling evidence references', () => {
    const evalOnly = clone(shared);
    evalOnly.sources[0].usage = 'evaluation_only';
    const r1 = parseAssessment(evalOnly);
    expect(r1.ok).toBe(false);
    if (!r1.ok && r1.kind === 'invalid') expect(r1.issues.join()).toMatch(/evaluation_only/);

    const dangling = clone(shared);
    dangling.settlements[0].evidence_ids = ['missing-evidence'];
    expect(parseAssessment(dangling).ok).toBe(false);
  });

  it('rejects synthetic:// sources in a live assessment', () => {
    const p = clone(shared);
    p.mode = 'live';
    expect(parseAssessment(p).ok).toBe(false);
  });

  it('keeps source kinds consistent with synthetic and live modes', () => {
    const training = clone(shared);
    training.sources[0].kind = 'sentinel_1';
    expect(parseAssessment(training).ok).toBe(false);
    const live = clone(shared);
    live.mode = 'live';
    live.sources[0].uri = '/api/v1/assessments/example/sources/example';
    expect(parseAssessment(live).ok).toBe(false);
  });

  it('warns (does not recompute) when summary disagrees with settlement list', () => {
    const p = clone(shared);
    p.summary.potentially_isolated_count = 3;
    const r = parseAssessment(p);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.assessment.summary.potentially_isolated_count).toBe(3);
      expect(r.warnings[0]).toMatch(/Summary reports 3/);
    }
  });
});
