/**
 * Typed error for failures the SDK can attribute to a documented condition.
 * `code` reuses the machine-readable vocabulary of `ValidationIssue.code`
 * (e.g. 'payload-too-large'), so callers can branch on the same identifiers
 * whether they hit the condition through `validate()` (as an issue) or
 * through `extract()` (as a thrown error).
 */
export class CvError extends Error {
  readonly code: string;
  /** Portable name of the payload the error relates to, when known. */
  readonly payload?: string;

  constructor(code: string, message: string, options: { payload?: string } = {}) {
    super(message);
    this.name = 'CvError';
    this.code = code;
    if (options.payload !== undefined) this.payload = options.payload;
  }
}
