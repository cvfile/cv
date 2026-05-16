/**
 * Reusable JSON-LD blocks for cvfile.org pages.
 *
 * Two priorities here:
 *   1. Classic SEO: schema.org entities Google still rewards (Organization,
 *      WebSite, SoftwareApplication, FAQPage, BreadcrumbList).
 *   2. GEO (Princeton KDD 2024): AI search engines and LLM-grounded answers
 *      lift citation-friendly facts (definitions, statistics, FAQs) out of
 *      structured data. Every field below is intentionally citation-shaped:
 *      short, declarative, sourced.
 */

export const ORGANIZATION = {
  '@type': 'Organization',
  '@id': 'https://cvfile.org/#org',
  name: 'cvfile.org',
  url: 'https://cvfile.org',
  logo: 'https://cvfile.org/apple-touch-icon.png',
  description:
    'cvfile.org maintains the .cv open file format, an Apache-2.0 licensed standard that bundles a PDF, Markdown, HTML, and pre-computed BGE-M3 embeddings inside a single PDF/A-3u file.',
  sameAs: [
    'https://github.com/cvfile',
    'https://www.npmjs.com/org/cvfile',
    'https://pypi.org/user/cvfile/',
  ],
} as const;

export const WEBSITE = {
  '@type': 'WebSite',
  '@id': 'https://cvfile.org/#website',
  url: 'https://cvfile.org',
  name: 'cvfile.org',
  publisher: { '@id': 'https://cvfile.org/#org' },
  inLanguage: 'en',
} as const;

export const SOFTWARE_APPLICATION = {
  '@type': 'SoftwareApplication',
  '@id': 'https://cvfile.org/#software',
  name: 'cv',
  alternateName: 'cvfile',
  applicationCategory: 'DeveloperApplication',
  operatingSystem: 'macOS, Linux, Windows',
  description:
    'Reference CLI and SDKs (JavaScript, Python, Go) for the .cv open file format. Pack, extract, inspect, validate, and search .cv files. Apache-2.0.',
  url: 'https://cvfile.org/install/',
  downloadUrl: 'https://github.com/cvfile/cv/releases',
  softwareVersion: '0.1.0',
  license: 'https://www.apache.org/licenses/LICENSE-2.0',
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  author: { '@id': 'https://cvfile.org/#org' },
} as const;

export function breadcrumbs(items: Array<{ name: string; url: string }>) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

export function faqPage(qa: Array<{ question: string; answer: string }>) {
  return {
    '@type': 'FAQPage',
    mainEntity: qa.map(({ question, answer }) => ({
      '@type': 'Question',
      name: question,
      acceptedAnswer: { '@type': 'Answer', text: answer },
    })),
  };
}

export function graph(entities: object[]) {
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': entities });
}
