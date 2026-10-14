import { describe, expect, it } from 'vitest';
import { isSameOriginApiPath } from './contract';

describe('isSameOriginApiPath (T01/T02)', () => {
  it.each([
    '/api/v1/assessments/synthetic-f7bbfcb32a42e8f9e7c992a1/imagery/before',
    '/api/v1/assessments/a/snapshot',
    '/api/v1/assessments/a/brief?language=ne&format=html',
    '/api/v1/assessments/a/sources/s2%2FL2A%2FT45RUL_20260901', // encoded "/" inside a source ID
    '/api/v1/assessments/a%20b/package',
    '/api/v1/assessments/caf%C3%A9/package',
  ])('allows %s', (p) => expect(isSameOriginApiPath(p)).toBe(true));

  it.each([
    ['encoded traversal (Codex repro)', '/api/v1/%2e%2e/%2e%2e/health'],
    ['upper-case encoded traversal', '/api/v1/%2E%2E/%2E%2E/health'],
    ['mixed encoded dot', '/api/v1/.%2e/health'],
    ['plain traversal', '/api/v1/../../health'],
    ['single dot segment', '/api/v1/./assessments/a'],
    ['encoded dot segment', '/api/v1/assessments/%2e/package'],
    ['encoded slash hiding traversal', '/api/v1/assessments/a%2F..%2F..%2Fhealth'],
    ['encoded backslash', '/api/v1/assessments/a%5C..%5Chealth'],
    ['literal backslash', '/api/v1\\..\\health'],
    ['malformed escape', '/api/v1/assessments/%zz/package'],
    ['truncated escape', '/api/v1/assessments/a%2/package'],
    ['repeated query delimiter', '/api/v1/assessments/a/brief?language=en?format=html'],
    ['fragment', '/api/v1/assessments/a/package#x'],
    ['empty segment', '/api/v1//assessments/a'],
    ['protocol-relative', '//evil.example/api/v1/x'],
    ['external absolute', 'https://evil.example/api/v1/x'],
    ['outside API namespace', '/health'],
    ['encoded control char', '/api/v1/assessments/a%0Ab/package'],
    ['query with odd chars', '/api/v1/assessments/a/brief?language=<x>'],
    ['whitespace', '/api/v1/assessments/a b/package'],
  ])('rejects %s', (_label, p) => expect(isSameOriginApiPath(p)).toBe(false));
});
