// How a text written from a resume compares with the PDF it came from: the lines whose words the PDF does not
// hold, and the web and email addresses it gives that the PDF does not. The viewer uses it to flag a
// Markdown copy that says something the PDF does not show, such as a planted instruction, and the builder
// to refuse an AI draft that adds an address the PDF lacks.

const ADDRESS = /\b(?:https?:\/\/|www\.)[^\s<>()\]]+|[\w.+-]+@[\w-]+(?:\.[\w-]+)+/gi;
const MIN_LINE_WORDS = 4;
const FOREIGN_LINE_SHARE = 0.6;
const MAX_REPORTED = 12;
const REPORTED_CHARS = 160;

export interface TextComparison {
  // The text agrees with the PDF: no line and no address of it is missing there.
  consistent: boolean;
  linesNotInPdf: string[];
  addressesNotInPdf: string[];
}

// Words as compared: lower case, accents and ligatures unfolded, four letters or more.
export function contentWords(text: string): string[] {
  const plain = text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
  return (plain.match(/[\p{L}\p{N}]+/gu) ?? []).filter((word) => word.length >= MIN_LINE_WORDS);
}

const normalizedAddress = (address: string) => address.toLowerCase().replace(/^https?:\/\//, '').replace(/[/.,;:]+$/, '');

export function addressesIn(text: string): string[] {
  return [...new Set((text.match(ADDRESS) ?? []).map(normalizedAddress))];
}

function markdownLines(markdown: string): string[] {
  return markdown.split('\n')
    .map((line) => line.replace(/^[#>*\-\d.\s]+/, '').replace(/[*_`[\]()]/g, ' ').trim())
    .filter(Boolean);
}

export function compareWithPdf(text: string, pdfText: string): TextComparison {
  const pdfWords = new Set(contentWords(pdfText));
  const pdfFlat = pdfText.toLowerCase().replace(/\s+/g, '');
  const linesNotInPdf = markdownLines(text).filter((line) => {
    const words = contentWords(line);
    const missing = words.filter((word) => !pdfWords.has(word)).length;
    return words.length >= MIN_LINE_WORDS && missing / words.length >= FOREIGN_LINE_SHARE;
  });
  const addressesNotInPdf = addressesIn(text).filter((address) => !pdfFlat.includes(address.replace(/\s+/g, '')));
  return {
    consistent: linesNotInPdf.length === 0 && addressesNotInPdf.length === 0,
    linesNotInPdf: linesNotInPdf.slice(0, MAX_REPORTED).map((line) => line.slice(0, REPORTED_CHARS)),
    addressesNotInPdf: addressesNotInPdf.slice(0, MAX_REPORTED),
  };
}
