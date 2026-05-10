import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFObject, PDFString } from 'pdf-lib';
import type { ValidationIssue } from './types.js';

const TYPE = PDFName.of('Type');
const SUBTYPE = PDFName.of('Subtype');
const S_KEY = PDFName.of('S');
const JS_KEY = PDFName.of('JS');
const JAVASCRIPT_KEY = PDFName.of('JavaScript');
const F_KEY = PDFName.of('F');
const UF_KEY = PDFName.of('UF');
const EF_KEY = PDFName.of('EF');
const NAMES_KEY = PDFName.of('Names');

const ACTION = PDFName.of('Action');
const FILESPEC = PDFName.of('Filespec');

const SUBMIT_FORM = PDFName.of('SubmitForm');
const LAUNCH = PDFName.of('Launch');
const IMPORT_DATA = PDFName.of('ImportData');
const JS_ACTION = PDFName.of('JavaScript');

/**
 * Walk the entire indirect-object graph and report any construct prohibited
 * by the .cv spec §3.4. Each rule maps to a stable error code so consumers
 * can pattern-match without parsing free-text messages.
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

  for (const [, obj] of pdfDoc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFDict)) continue;
    inspectDict(pdfDoc, obj, issues);
  }

  return dedupe(issues);
}

function inspectDict(pdfDoc: PDFDocument, dict: PDFDict, issues: ValidationIssue[]): void {
  const type = nameOf(dict.get(TYPE));

  if (type === 'Action' || dict.get(S_KEY) instanceof PDFName) {
    inspectAction(pdfDoc, dict, issues);
  }

  if (type === 'Filespec') {
    inspectFilespec(dict, issues);
  }

  // /Names tree for document-level JavaScript: catalog→/Names→/JavaScript
  // surfaces as a dict with a JavaScript key whose entry is a name tree.
  // Any presence of /JavaScript on a Names dict is forbidden.
  const namesEntry = dict.get(NAMES_KEY);
  if (dict.get(JAVASCRIPT_KEY) || (namesEntry instanceof PDFDict && namesEntry.get(JAVASCRIPT_KEY))) {
    if (!issues.some((i) => i.code === 'javascript-names-tree')) {
      issues.push({
        code: 'javascript-names-tree',
        level: 'error',
        message: 'Document declares /JavaScript names entries; JavaScript actions are forbidden (spec §3.4)',
      });
    }
  }
}

function inspectAction(pdfDoc: PDFDocument, dict: PDFDict, issues: ValidationIssue[]): void {
  const subtype = dict.get(S_KEY);
  if (!(subtype instanceof PDFName)) return;

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
    const fEntry = pdfDoc.context.lookup(dict.get(F_KEY));
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
  if (!issues.some((i) => i.code === 'external-filespec' && i.payload === target)) {
    issues.push({
      code: 'external-filespec',
      level: 'error',
      message: target
        ? `External /Filespec "${target}" (spec §3.4)`
        : 'External /Filespec with no /EF (spec §3.4)',
      payload: target,
    });
  }
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
