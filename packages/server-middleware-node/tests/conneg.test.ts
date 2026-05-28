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

  it('drops entries with q=0 (not acceptable)', () => {
    const parsed = parseAccept('text/markdown;q=0, text/html;q=0.8');
    expect(parsed.map((p) => p.type)).toEqual(['text/html']);
  });

  it('clamps q to [0,1]', () => {
    const parsed = parseAccept('text/html;q=5, text/markdown;q=0.5');
    expect(parsed[0]!.q).toBe(1);
  });

  it('skips a type whose q is malformed', () => {
    const parsed = parseAccept('text/html;q=abc, text/markdown');
    expect(parsed.map((p) => p.type)).toEqual(['text/markdown']);
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

  it('deliberate text/html (no wildcard) returns html', () => {
    expect(negotiate({ accept: 'text/html' }).format).toBe('html');
    expect(negotiate({ accept: 'text/html,application/xhtml+xml' }).format).toBe('html');
  });

  it('browser request (text/html + */*) returns pdf', () => {
    expect(negotiate({ accept: 'text/html,*/*' }).format).toBe('pdf');
    expect(
      negotiate({ accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' }).format,
    ).toBe('pdf');
  });

  it('application/pdf returns pdf', () => {
    expect(negotiate({ accept: 'application/pdf' }).format).toBe('pdf');
  });

  it('application/vnd.cv+pdf returns pdf', () => {
    expect(negotiate({ accept: 'application/vnd.cv+pdf' }).format).toBe('pdf');
  });

  it('markdown only wins as a top, non-wildcard preference', () => {
    expect(negotiate({ accept: 'text/html;q=0.5, text/markdown;q=0.9' }).format).toBe('markdown');
    // markdown not at the top -> browser/wildcard case wins (pdf)
    expect(negotiate({ accept: 'text/html, text/markdown;q=0.5' }).format).toBe('html');
  });

  it('q=0 markdown falls through to pdf', () => {
    expect(negotiate({ accept: 'text/markdown;q=0' }).format).toBe('pdf');
  });

  it('default is pdf when nothing usable matches', () => {
    expect(negotiate({}).format).toBe('pdf');
    expect(negotiate({ accept: '*/*' }).format).toBe('pdf');
  });

  it('text/* falls through to html (deliberate text fetch)', () => {
    expect(negotiate({ accept: 'text/*' }).format).toBe('html');
  });

  it('defaultFormat is the final fallback only, never overrides an explicit Accept', () => {
    // explicit Accept beats defaultFormat
    expect(negotiate({ accept: 'application/pdf', defaultFormat: 'markdown' }).format).toBe('pdf');
    // no usable Accept -> defaultFormat applies
    expect(negotiate({ defaultFormat: 'markdown' }).format).toBe('markdown');
    expect(negotiate({ accept: '*/*', defaultFormat: 'markdown' }).format).toBe('pdf');
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
