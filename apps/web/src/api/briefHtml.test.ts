import { describe, expect, it } from 'vitest';
import { checkBriefHtmlScope } from './briefHtml';
import { GEO_ID, testBriefHtml } from '../test/fakeApi';

const bytes = (text: string) => new TextEncoder().encode(text).buffer;
const scope = { assessment_id: GEO_ID, mode: 'synthetic' as const, language: 'en' as const };

describe('downloaded HTML brief scope', () => {
  it('accepts the generated metadata and an older matching backend header', () => {
    expect(() => checkBriefHtmlScope(bytes(testBriefHtml()), scope)).not.toThrow();
    const older = `<html lang="en"><body><header><div class="mode">SYNTHETIC</div><small>Assessment: ${GEO_ID} · Event: 2026-08-26<br>Generated: yesterday</small></header></body></html>`;
    expect(() => checkBriefHtmlScope(bytes(older), scope)).not.toThrow();
    expect(() => checkBriefHtmlScope(bytes(older.replace(GEO_ID, 'another-area')), scope)).toThrow(/assessment/);
  });

  it.each([
    testBriefHtml('another-area'),
    testBriefHtml(GEO_ID, 'live'),
    testBriefHtml(GEO_ID, 'synthetic', 'ne'),
    testBriefHtml().replace('tads-mode', 'missing-mode'),
    testBriefHtml().replace('</head>', '<meta name="tads-assessment-id" content="another-area"></head>'),
    '<!doctype html><html lang="en"><title>wrong document</title></html>',
  ])('rejects a foreign, incomplete or ambiguous document', (html) => {
    expect(() => checkBriefHtmlScope(bytes(html), scope)).toThrow();
  });
});
