import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFObject, PDFRef, PDFString } from 'pdf-lib';
import type { ValidationIssue } from './types.js';

const TYPE = PDFName.of('Type');
const S_KEY = PDFName.of('S');
const JS_KEY = PDFName.of('JS');
const JAVASCRIPT_KEY = PDFName.of('JavaScript');
const F_KEY = PDFName.of('F');
const UF_KEY = PDFName.of('UF');
const EF_KEY = PDFName.of('EF');

const SUBMIT_FORM = 'SubmitForm';
const LAUNCH = 'Launch';
const IMPORT_DATA = 'ImportData';
const JS_ACTION = 'JavaScript';

/**
 * Walk the entire object graph from the catalog and report any construct
 * prohibited by the .cv spec §3.4. The walk descends through every PDFDict and
 * PDFArray value, resolving indirect references, so that forbidden actions
 * carried as DIRECT/inline children (e.g. catalog /OpenAction, page /Annots/A,
 * /AA, AcroForm field actions) are caught as well as indirect ones. Each rule
 * maps to a stable error code so consumers can pattern-match without parsing
 * free-text messages. Mirrors the Python reference impl in _security.py.
 */
export function scanForbiddenConstructs(pdfDoc: PDFDocument): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (pdfDoc.context.trailerInfo.Encrypt) {
    issues.push({
      code: 'encrypted-document',
      level: 'error',
      message: 'Document declares an /Encrypt dictionary; encryption is forbidden in cv 0.x (spec §3.4)',
    });
  }

  const seen = new Set<PDFObject>();
  walk(pdfDoc, pdfDoc.catalog, seen, issues);

  return dedupe(issues);
}

function walk(pdfDoc: PDFDocument, value: PDFObject | undefined, seen: Set<PDFObject>, issues: ValidationIssue[]): void {
  const obj = resolve(pdfDoc, value);
  if (obj === undefined || seen.has(obj)) return;
  seen.add(obj);

  if (obj instanceof PDFDict) {
    inspectDict(pdfDoc, obj, issues);
    for (const [, child] of obj.entries()) {
      walk(pdfDoc, child, seen, issues);
    }
  } else if (obj instanceof PDFArray) {
    for (let i = 0; i < obj.size(); i += 1) {
      walk(pdfDoc, obj.get(i), seen, issues);
    }
  }
}

function inspectDict(pdfDoc: PDFDocument, dict: PDFDict, issues: ValidationIssue[]): void {
  const type = nameOf(dict.get(TYPE));
  const subtype = nameOf(dict.get(S_KEY));

  if (type === 'Action' || subtype) {
    inspectAction(pdfDoc, dict, subtype, issues);
  }

  if (type === 'Filespec') {
    inspectFilespec(dict, issues);
  }

  // A /JavaScript entry on any dict (catalog→/Names→/JavaScript name tree, or
  // the leaf nodes thereof) signals document-level JavaScript, which is forbidden.
  if (dict.get(JAVASCRIPT_KEY) !== undefined) {
    issues.push({
      code: 'javascript-names-tree',
      level: 'error',
      message: 'Document declares /JavaScript names entries; JavaScript actions are forbidden (spec §3.4)',
    });
  }
}

function inspectAction(
  pdfDoc: PDFDocument,
  dict: PDFDict,
  subtype: string | undefined,
  issues: ValidationIssue[],
): void {
  if (subtype === JS_ACTION || dict.get(JS_KEY) !== undefined) {
    issues.push({
      code: 'javascript-action',
      level: 'error',
      message: 'Found /Action with subtype /JavaScript or /JS entry (spec §3.4)',
    });
    return;
  }

  if (subtype === LAUNCH) {
    issues.push({
      code: 'launch-action',
      level: 'error',
      message: 'Found /Launch action; running external programs is forbidden (spec §3.4)',
    });
    return;
  }

  if (subtype === IMPORT_DATA) {
    issues.push({
      code: 'import-data-action',
      level: 'error',
      message: 'Found /ImportData action; data import is forbidden (spec §3.4)',
    });
    return;
  }

  if (subtype === SUBMIT_FORM) {
    const fEntry = resolve(pdfDoc, dict.get(F_KEY));
    const target = filespecTarget(fEntry);
    if (!target || !target.toLowerCase().startsWith('mailto:')) {
      issues.push({
        code: 'submit-form-external',
        level: 'error',
        message: target
          ? `/SubmitForm action targets non-mailto URI "${target}" (spec §3.4)`
          : 'Found /SubmitForm action with no inspectable target (spec §3.4)',
      });
    }
  }
}

function inspectFilespec(dict: PDFDict, issues: ValidationIssue[]): void {
  if (dict.get(EF_KEY) !== undefined) return;
  // No /EF means the filespec points outside the container.
  const target = filespecTarget(dict);
  const issue: ValidationIssue = {
    code: 'external-filespec',
    level: 'error',
    message: target ? `External /Filespec "${target}" (spec §3.4)` : 'External /Filespec with no /EF (spec §3.4)',
  };
  if (target !== undefined) issue.payload = target;
  issues.push(issue);
}

function filespecTarget(value: PDFObject | undefined): string | undefined {
  if (value instanceof PDFString) return value.asString();
  if (value instanceof PDFHexString) return value.decodeText();
  if (value instanceof PDFDict) {
    const ufVal = value.get(UF_KEY);
    if (ufVal instanceof PDFString) return ufVal.asString();
    if (ufVal instanceof PDFHexString) return ufVal.decodeText();
    const fVal = value.get(F_KEY);
    if (fVal instanceof PDFString) return fVal.asString();
    if (fVal instanceof PDFHexString) return fVal.decodeText();
  }
  if (value instanceof PDFArray) {
    // Filespec /F may be expressed as an array of path components.
    const parts: string[] = [];
    for (let i = 0; i < value.size(); i += 1) {
      const item = value.get(i);
      if (item instanceof PDFString) parts.push(item.asString());
      else if (item instanceof PDFHexString) parts.push(item.decodeText());
    }
    return parts.length > 0 ? parts.join('/') : undefined;
  }
  return undefined;
}

function resolve(pdfDoc: PDFDocument, value: PDFObject | undefined): PDFObject | undefined {
  if (value === undefined) return undefined;
  if (value instanceof PDFRef) {
    return pdfDoc.context.lookup(value) ?? undefined;
  }
  return value;
}

function nameOf(value: PDFObject | undefined): string | undefined {
  return value instanceof PDFName ? value.asString().slice(1) : undefined;
}

function dedupe(issues: ValidationIssue[]): ValidationIssue[] {
  const seen = new Set<string>();
  const out: ValidationIssue[] = [];
  for (const issue of issues) {
    const key = `${issue.code}:${issue.payload ?? ''}:${issue.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(issue);
  }
  return out;
}
