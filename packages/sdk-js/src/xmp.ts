import { CV_NAMESPACE_URI, CV_SPEC_VERSION, DEFAULT_GENERATOR } from './constants.js';
import type { AlternateMeta, CvMetadata, EmbeddingSpaceSummary, IntegrityEntry } from './types.js';

const XMP_BEGIN = '<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>';
const XMP_END = '<?xpacket end="w"?>';

export interface XmpInput {
  version: string;
  primaryLanguage: string;
  primaryPayload: string;
  created: Date;
  modified?: Date;
  generator?: string;
  alternates?: AlternateMeta[];
  integrity?: IntegrityEntry[];
  embeddings?: EmbeddingSpaceSummary[];
}

export function buildXmp(input: XmpInput): string {
  const escape = xmlEscape;
  const generator = input.generator ?? DEFAULT_GENERATOR;
  const created = isoDate(input.created);
  const modified = input.modified ? isoDate(input.modified) : created;

  // Structured collections are serialized as JSON-encoded Text values inside the
  // XMP packet so that the cv: extension schema can declare them as simple Text
  // (PDF/A-3u rule 6.6.2.3.1 forbids unnamed structured types). Consumers
  // recover the structure via JSON.parse.
  const altBlock = (input.alternates ?? []).length > 0
    ? `\n      <cv:alternates>${escape(JSON.stringify(input.alternates))}</cv:alternates>`
    : '';
  const intBlock = (input.integrity ?? []).length > 0
    ? `\n      <cv:integrity>${escape(JSON.stringify(input.integrity))}</cv:integrity>`
    : '';
  const embBlock = (input.embeddings ?? []).length > 0
    ? `\n      <cv:embeddings>${escape(JSON.stringify(input.embeddings))}</cv:embeddings>`
    : '';

  return `${XMP_BEGIN}
<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="cvfile-sdk ${escape(CV_SPEC_VERSION)}">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about=""
      xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/">
      <pdfaid:part>3</pdfaid:part>
      <pdfaid:conformance>U</pdfaid:conformance>
    </rdf:Description>
    <rdf:Description rdf:about=""
      xmlns:dc="http://purl.org/dc/elements/1.1/">
      <dc:format>application/pdf</dc:format>
    </rdf:Description>
    <rdf:Description rdf:about=""
      xmlns:xmp="http://ns.adobe.com/xap/1.0/">
      <xmp:CreateDate>${escape(created)}</xmp:CreateDate>
      <xmp:ModifyDate>${escape(modified)}</xmp:ModifyDate>
      <xmp:CreatorTool>${escape(generator)}</xmp:CreatorTool>
    </rdf:Description>
    <rdf:Description rdf:about=""
      xmlns:cv="${CV_NAMESPACE_URI}">
      <cv:version>${escape(input.version)}</cv:version>
      <cv:created>${escape(created)}</cv:created>
      <cv:modified>${escape(modified)}</cv:modified>
      <cv:primaryLanguage>${escape(input.primaryLanguage)}</cv:primaryLanguage>
      <cv:primaryPayload>${escape(input.primaryPayload)}</cv:primaryPayload>
      <cv:generator>${escape(generator)}</cv:generator>${altBlock}${intBlock}${embBlock}
    </rdf:Description>
${cvExtensionSchema()}
  </rdf:RDF>
</x:xmpmeta>
${XMP_END}`;
}

function cvExtensionSchema(): string {
  return `    <rdf:Description rdf:about=""
      xmlns:pdfaExtension="http://www.aiim.org/pdfa/ns/extension/"
      xmlns:pdfaSchema="http://www.aiim.org/pdfa/ns/schema#"
      xmlns:pdfaProperty="http://www.aiim.org/pdfa/ns/property#">
      <pdfaExtension:schemas>
        <rdf:Bag>
          <rdf:li rdf:parseType="Resource">
            <pdfaSchema:namespaceURI>${CV_NAMESPACE_URI}</pdfaSchema:namespaceURI>
            <pdfaSchema:prefix>cv</pdfaSchema:prefix>
            <pdfaSchema:schema>cvfile.org cv namespace</pdfaSchema:schema>
            <pdfaSchema:property>
              <rdf:Seq>
${CV_EXTENSION_PROPERTIES.map((p) => extensionProp(p)).join('\n')}
              </rdf:Seq>
            </pdfaSchema:property>
          </rdf:li>
        </rdf:Bag>
      </pdfaExtension:schemas>
    </rdf:Description>`;
}

interface CvExtProp {
  name: string;
  valueType: string;
  description: string;
}

const CV_EXTENSION_PROPERTIES: CvExtProp[] = [
  { name: 'version', valueType: 'Text', description: 'cvfile.org format version (MAJOR.MINOR)' },
  { name: 'created', valueType: 'Date', description: 'When the .cv file was created' },
  { name: 'modified', valueType: 'Date', description: 'When the .cv file was last modified' },
  { name: 'primaryLanguage', valueType: 'Text', description: 'BCP-47 tag of the canonical content language' },
  { name: 'primaryPayload', valueType: 'Text', description: 'Filename of the canonical text payload' },
  { name: 'generator', valueType: 'Text', description: 'Identifier of the producer' },
  { name: 'alternates', valueType: 'Text', description: 'Alternate payload descriptors (JSON-encoded array)' },
  { name: 'integrity', valueType: 'Text', description: 'Per-payload digest entries (JSON-encoded array)' },
  { name: 'embeddings', valueType: 'Text', description: 'Embedding-space summaries (JSON-encoded array)' },
];

function extensionProp(p: CvExtProp): string {
  return `                <rdf:li rdf:parseType="Resource">
                  <pdfaProperty:name>${p.name}</pdfaProperty:name>
                  <pdfaProperty:valueType>${p.valueType}</pdfaProperty:valueType>
                  <pdfaProperty:category>external</pdfaProperty:category>
                  <pdfaProperty:description>${p.description}</pdfaProperty:description>
                </rdf:li>`;
}

export function parseXmp(xml: string): CvMetadata | null {
  const cvBlock = xml;
  const get = (tag: string): string | undefined => {
    const match = cvBlock.match(new RegExp(`<cv:${tag}>([\\s\\S]*?)</cv:${tag}>`));
    return match ? xmlUnescape(match[1]!.trim()) : undefined;
  };

  const version = get('version');
  const primaryLanguage = get('primaryLanguage');
  const primaryPayload = get('primaryPayload');

  if (!version || !primaryLanguage || !primaryPayload) {
    return null;
  }

  const createdStr = get('created');
  const modifiedStr = get('modified');
  const generator = get('generator');

  const alternates = parseJsonText<AlternateMeta[]>(cvBlock, 'alternates') ?? [];
  const integrity = parseJsonText<IntegrityEntry[]>(cvBlock, 'integrity') ?? [];
  const embeddings = parseJsonText<EmbeddingSpaceSummary[]>(cvBlock, 'embeddings') ?? [];

  const meta: CvMetadata = {
    version,
    primaryLanguage,
    primaryPayload,
    alternates,
    integrity,
    embeddings,
  };
  if (createdStr) meta.created = new Date(createdStr);
  if (modifiedStr) meta.modified = new Date(modifiedStr);
  if (generator) meta.generator = generator;
  return meta;
}

function parseJsonText<T>(xml: string, tag: string): T | undefined {
  const m = xml.match(new RegExp(`<cv:${tag}>([\\s\\S]*?)</cv:${tag}>`));
  if (!m) return undefined;
  try {
    return JSON.parse(xmlUnescape(m[1]!.trim())) as T;
  } catch {
    return undefined;
  }
}

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function xmlUnescape(s: string): string {
  return s
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&');
}

function isoDate(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}
