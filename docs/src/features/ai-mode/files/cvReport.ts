// What the AI mode learns of the .cv file dropped on /view/, read in the page with @cvfile/sdk. The file is
// validated before anything else, and none of its payloads is read once validation fails (spec §7.3: a
// consumer validates an untrusted file first). Each answer says it comes from the dropped file, which a
// third party wrote.

import { extract, validate } from '@cvfile/sdk';
import type { CvFile, ValidationIssue, ValidationReport } from '@cvfile/sdk';
import type { DroppedFile } from './droppedFiles.ts';
import { pdfPageTexts } from './pdfText.ts';
import { compareWithPdf } from './textComparison.ts';
import type { TextComparison } from './textComparison.ts';

const SOURCE = 'dropped file';
const SPEC_URL = 'https://cvfile.org/spec/';
const MARKDOWN = 'text/markdown';

export interface FileReport {
  source: typeof SOURCE;
  file: string;
  ok: boolean;
  level: string;
  issues: Array<ValidationIssue & { specUrl?: string }>;
  specVersion?: string;
  primaryLanguage?: string;
  languages?: string[];
  payloads?: Array<{ name: string; mimeType: string; language?: string; bytes: number; integrity: string }>;
  embeddingModels?: string[];
  markdownVsPdf?: TextComparison;
}

interface ReadFile {
  validation: ValidationReport;
  cv: CvFile | null;
}

const reads = new WeakMap<Uint8Array, Promise<ReadFile>>();

// The validation and, once it passes, the extracted file, read once per dropped file.
function readFile(file: DroppedFile): Promise<ReadFile> {
  const cached = reads.get(file.bytes);
  if (cached) {
    return cached;
  }
  const read = validate(file.bytes).then(async (validation) => ({
    validation,
    cv: validation.ok ? await extract(file.bytes) : null,
  }));
  reads.set(file.bytes, read);
  return read;
}

// An issue with the link of the spec section its message cites, such as "(spec §3.4)".
function withSpecLink(issue: ValidationIssue) {
  const section = /§\s?(\d+(?:\.\d+)*)/.exec(issue.message)?.[1];
  return section ? { ...issue, specUrl: `${SPEC_URL}#s${section.replace(/\./g, '-')}` } : issue;
}

function integrityOf(cv: CvFile, issues: ValidationIssue[], payload: string): string {
  if (issues.some((issue) => issue.code === 'integrity-mismatch' && issue.payload === payload)) {
    return 'mismatch';
  }
  return cv.metadata.integrity.some((entry) => entry.payload === payload) ? 'verified' : 'not declared';
}

export function primaryMarkdown(cv: CvFile): string | null {
  const markdown = cv.payloads.filter((payload) => payload.mimeType === MARKDOWN);
  const primary = markdown.find((payload) => payload.name === cv.metadata.primaryPayload) ?? markdown[0];
  return primary ? primary.text() : null;
}

async function markdownVsPdf(file: DroppedFile, cv: CvFile): Promise<TextComparison | undefined> {
  const markdown = primaryMarkdown(cv);
  return markdown === null ? undefined : compareWithPdf(markdown, (await pdfPageTexts(file.bytes)).join('\n'));
}

export async function fileReport(file: DroppedFile): Promise<FileReport> {
  const { validation, cv } = await readFile(file);
  const base = { source: SOURCE, file: file.name, ok: validation.ok, level: validation.level,
    issues: validation.issues.map(withSpecLink) } as const;
  if (!cv) {
    return base;
  }
  const { metadata } = cv;
  return {
    ...base,
    specVersion: metadata.version,
    primaryLanguage: metadata.primaryLanguage,
    languages: [...new Set(cv.payloads.map((payload) => payload.language).filter((lang): lang is string => !!lang))],
    payloads: cv.payloads.map((payload) => ({
      name: payload.name, mimeType: payload.mimeType, language: payload.language, bytes: payload.bytes.length,
      integrity: integrityOf(cv, validation.issues, payload.name),
    })),
    embeddingModels: metadata.embeddings.map((space) => space.model),
    markdownVsPdf: await markdownVsPdf(file, cv),
  };
}

// The extracted file, or an error the model reads when validation failed.
export async function validatedFile(file: DroppedFile): Promise<CvFile> {
  const { validation, cv } = await readFile(file);
  if (!cv) {
    const codes = validation.issues.map((issue) => issue.code).join(', ');
    throw new Error(`The file failed validation (${codes}), so its payloads are not read. Call validate_cv for the report.`);
  }
  return cv;
}
