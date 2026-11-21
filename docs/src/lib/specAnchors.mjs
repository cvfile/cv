// The anchor of a numbered heading of the specification, shared by the /spec/ page, which sets it as the
// heading's id, and the docs index, which links each spec section to it: "4. Embedded payloads" is s4,
// "4.1 Filespec dictionary requirements" is s4-1. A heading without a number has no anchor.

/** @param {string} heading @returns {string | null} */
export function sectionAnchor(heading) {
  const number = /^(\d+(?:\.\d+)*)\.?\s/.exec(heading.trim())?.[1];
  return number ? `s${number.replace(/\./g, '-')}` : null;
}
