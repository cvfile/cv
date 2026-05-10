"""XMP metadata writer + reader for the cv: namespace."""

from __future__ import annotations

import json
import re
from dataclasses import asdict
from datetime import datetime, timezone
from typing import Any

from cvfile._constants import CV_NAMESPACE_URI, CV_SPEC_VERSION, DEFAULT_GENERATOR
from cvfile._types import AlternateMeta, CvMetadata, EmbeddingSpaceSummary, IntegrityEntry

XMP_BEGIN = '<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>'
XMP_END = '<?xpacket end="w"?>'


def _iso(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    s = dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    return s


def _xml_escape(s: str) -> str:
    return (
        s.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&apos;")
    )


def _xml_unescape(s: str) -> str:
    return (
        s.replace("&apos;", "'")
        .replace("&quot;", '"')
        .replace("&gt;", ">")
        .replace("&lt;", "<")
        .replace("&amp;", "&")
    )


def build_xmp(
    *,
    version: str,
    primary_language: str,
    primary_payload: str,
    created: datetime,
    modified: datetime | None = None,
    generator: str = DEFAULT_GENERATOR,
    alternates: tuple[AlternateMeta, ...] = (),
    integrity: tuple[IntegrityEntry, ...] = (),
    embeddings: tuple[EmbeddingSpaceSummary, ...] = (),
) -> str:
    """Build an XMP packet with the cv: namespace and PDF/A-3u identification."""
    modified = modified or created

    def _alt_dict(a: AlternateMeta) -> dict[str, str]:
        return {"payload": a.payload, "language": a.language, "mimeType": a.mime_type}

    def _int_dict(i: IntegrityEntry) -> dict[str, str]:
        return {"payload": i.payload, "algorithm": i.algorithm, "digest": i.digest}

    def _emb_dict(e: EmbeddingSpaceSummary) -> dict[str, Any]:
        return {"model": e.model, "dimension": e.dimension, "metric": e.metric, "chunks": e.chunks}

    alt_block = (
        f'\n      <cv:alternates>{_xml_escape(json.dumps([_alt_dict(a) for a in alternates]))}</cv:alternates>'
        if alternates
        else ""
    )
    int_block = (
        f'\n      <cv:integrity>{_xml_escape(json.dumps([_int_dict(i) for i in integrity]))}</cv:integrity>'
        if integrity
        else ""
    )
    emb_block = (
        f'\n      <cv:embeddings>{_xml_escape(json.dumps([_emb_dict(e) for e in embeddings]))}</cv:embeddings>'
        if embeddings
        else ""
    )

    ext_schema = _cv_extension_schema()

    return f"""{XMP_BEGIN}
<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="cvfile-py {_xml_escape(CV_SPEC_VERSION)}">
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
      <xmp:CreateDate>{_xml_escape(_iso(created))}</xmp:CreateDate>
      <xmp:ModifyDate>{_xml_escape(_iso(modified))}</xmp:ModifyDate>
      <xmp:CreatorTool>{_xml_escape(generator)}</xmp:CreatorTool>
    </rdf:Description>
    <rdf:Description rdf:about=""
      xmlns:cv="{CV_NAMESPACE_URI}">
      <cv:version>{_xml_escape(version)}</cv:version>
      <cv:created>{_xml_escape(_iso(created))}</cv:created>
      <cv:modified>{_xml_escape(_iso(modified))}</cv:modified>
      <cv:primaryLanguage>{_xml_escape(primary_language)}</cv:primaryLanguage>
      <cv:primaryPayload>{_xml_escape(primary_payload)}</cv:primaryPayload>
      <cv:generator>{_xml_escape(generator)}</cv:generator>{alt_block}{int_block}{emb_block}
    </rdf:Description>
{ext_schema}
  </rdf:RDF>
</x:xmpmeta>
{XMP_END}"""


def _cv_extension_schema() -> str:
    props = [
        ("version", "Text", "cvfile.org format version (MAJOR.MINOR)"),
        ("created", "Date", "When the .cv file was created"),
        ("modified", "Date", "When the .cv file was last modified"),
        ("primaryLanguage", "Text", "BCP-47 tag of the canonical content language"),
        ("primaryPayload", "Text", "Filename of the canonical text payload"),
        ("generator", "Text", "Identifier of the producer"),
        ("alternates", "Text", "Alternate payload descriptors (JSON-encoded array)"),
        ("integrity", "Text", "Per-payload digest entries (JSON-encoded array)"),
        ("embeddings", "Text", "Embedding-space summaries (JSON-encoded array)"),
    ]

    def _prop_xml(name: str, value_type: str, desc: str) -> str:
        return f"""                <rdf:li rdf:parseType="Resource">
                  <pdfaProperty:name>{name}</pdfaProperty:name>
                  <pdfaProperty:valueType>{value_type}</pdfaProperty:valueType>
                  <pdfaProperty:category>external</pdfaProperty:category>
                  <pdfaProperty:description>{_xml_escape(desc)}</pdfaProperty:description>
                </rdf:li>"""

    items = "\n".join(_prop_xml(*p) for p in props)
    return f"""    <rdf:Description rdf:about=""
      xmlns:pdfaExtension="http://www.aiim.org/pdfa/ns/extension/"
      xmlns:pdfaSchema="http://www.aiim.org/pdfa/ns/schema#"
      xmlns:pdfaProperty="http://www.aiim.org/pdfa/ns/property#">
      <pdfaExtension:schemas>
        <rdf:Bag>
          <rdf:li rdf:parseType="Resource">
            <pdfaSchema:namespaceURI>{CV_NAMESPACE_URI}</pdfaSchema:namespaceURI>
            <pdfaSchema:prefix>cv</pdfaSchema:prefix>
            <pdfaSchema:schema>cvfile.org cv namespace</pdfaSchema:schema>
            <pdfaSchema:property>
              <rdf:Seq>
{items}
              </rdf:Seq>
            </pdfaSchema:property>
          </rdf:li>
        </rdf:Bag>
      </pdfaExtension:schemas>
    </rdf:Description>"""


_TAG_RE_CACHE: dict[str, re.Pattern[str]] = {}


def _tag_re(tag: str) -> re.Pattern[str]:
    cached = _TAG_RE_CACHE.get(tag)
    if cached is None:
        cached = re.compile(rf"<{re.escape(tag)}>([\s\S]*?)</{re.escape(tag)}>")
        _TAG_RE_CACHE[tag] = cached
    return cached


def _inner(xml: str, tag: str) -> str | None:
    m = _tag_re(tag).search(xml)
    return _xml_unescape(m.group(1).strip()) if m else None


def _parse_json_text(xml: str, tag: str) -> Any:
    raw = _inner(xml, tag)
    if not raw:
        return None
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return None


def parse_xmp(xml: str) -> CvMetadata | None:
    """Parse a cv:* XMP packet. Returns None if required fields are missing."""
    version = _inner(xml, "cv:version")
    primary_language = _inner(xml, "cv:primaryLanguage")
    primary_payload = _inner(xml, "cv:primaryPayload")
    if not version or not primary_language or not primary_payload:
        return None

    created_str = _inner(xml, "cv:created")
    modified_str = _inner(xml, "cv:modified")
    generator = _inner(xml, "cv:generator")

    def _parse_dt(s: str | None) -> datetime | None:
        if not s:
            return None
        try:
            return datetime.fromisoformat(s.replace("Z", "+00:00"))
        except ValueError:
            return None

    raw_alts = _parse_json_text(xml, "cv:alternates") or []
    alternates = tuple(
        AlternateMeta(payload=a["payload"], language=a["language"], mime_type=a["mimeType"])
        for a in raw_alts
    )

    raw_ints = _parse_json_text(xml, "cv:integrity") or []
    integrity = tuple(
        IntegrityEntry(payload=i["payload"], algorithm=i["algorithm"], digest=i["digest"])
        for i in raw_ints
    )

    raw_embs = _parse_json_text(xml, "cv:embeddings") or []
    embeddings = tuple(
        EmbeddingSpaceSummary(model=e["model"], dimension=e["dimension"], metric=e["metric"], chunks=e["chunks"])
        for e in raw_embs
    )

    return CvMetadata(
        version=version,
        primary_language=primary_language,
        primary_payload=primary_payload,
        created=_parse_dt(created_str),
        modified=_parse_dt(modified_str),
        generator=generator,
        alternates=alternates,
        integrity=integrity,
        embeddings=embeddings,
    )


__all__ = ["build_xmp", "parse_xmp"]
