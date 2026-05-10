import { describe, expect, it } from 'vitest';
import { buildLinkHeader, negotiate, parseAccept, parseAcceptLanguage } from '../src/conneg.js';

describe('parseAccept', () => {
  it('orders by q-value descending', () => {
    const parsed = parseAccept('text/html;q=0.9, application/json;q=1.0, text/markdown;q=0.5');
    expect(parsed.map((p) => p.type)).toEqual(['application/json', 'text/html', 'text/markdown']);
  });

  it('treats missing q as 1.0', () => {
    const parsed = parseAccept('text/markdown, text/html;q=0.8');
    expect(parsed[0]!.type).toBe('text/markdown');
  });

  it('returns empty for falsy headers', () => {
    expect(parseAccept(undefined)).toEqual([]);
    expect(parseAccept(null)).toEqual([]);
    expect(parseAccept('')).toEqual([]);
  });
});

describe('parseAcceptLanguage', () => {
  it('orders languages by q', () => {
    expect(parseAcceptLanguage('en-US, fr;q=0.9, de;q=0.8')).toEqual(['en-us', 'fr', 'de']);
  });
});

describe('negotiate', () => {
  it('?format=md wins over Accept', () => {
    const r = negotiate({ accept: 'text/html', formatQuery: 'md' });
    expect(r.format).toBe('markdown');
  });

  it('text/markdown returns markdown', () => {
    expect(negotiate({ accept: 'text/markdown' }).format).toBe('markdown');
  });

  it('text/html returns html', () => {
    expect(negotiate({ accept: 'text/html,application/xhtml+xml' }).format).toBe('html');
  });

  it('application/pdf returns pdf', () => {
    expect(negotiate({ accept: 'application/pdf' }).format).toBe('pdf');
  });

  it('application/vnd.cv+pdf returns pdf', () => {
    expect(negotiate({ accept: 'application/vnd.cv+pdf' }).format).toBe('pdf');
  });

  it('q-values pick the highest preference', () => {
    const r = negotiate({ accept: 'text/html;q=0.5, text/markdown;q=0.9' });
    expect(r.format).toBe('markdown');
  });

  it('default is pdf when nothing matches', () => {
    expect(negotiate({}).format).toBe('pdf');
    expect(negotiate({ accept: '*/*' }).format).toBe('pdf');
  });

  it('text/* falls through to html', () => {
    expect(negotiate({ accept: 'text/*' }).format).toBe('html');
  });

  it('captures accept-language', () => {
    expect(negotiate({ accept: 'text/markdown', acceptLanguage: 'fr-CA, en;q=0.5' }).language).toBe('fr-ca');
  });
});

describe('buildLinkHeader', () => {
  it('includes all three alternates', () => {
    const link = buildLinkHeader({ selfUrl: '/cv/jane.cv' });
    expect(link).toContain('rel="alternate"');
    expect(link).toContain('type="application/vnd.cv+pdf"');
    expect(link).toContain('type="text/markdown"');
    expect(link).toContain('type="text/html"');
    expect(link).toContain('?format=md');
    expect(link).toContain('?format=html');
  });

  it('respects existing query string in the URL', () => {
    const link = buildLinkHeader({ selfUrl: '/cv/jane.cv?v=2' });
    expect(link).toContain('&format=md');
    expect(link).toContain('&format=html');
  });
});
