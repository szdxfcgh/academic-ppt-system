#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Phase 1B-3B1A-R1 — deterministic semantic slide signature (pure stdlib).

Read-only, package/OOXML-based, network-free. Extracts a semantic signature
for one slide part of a PPTX so COPY_SLIDE can prove that the appended output
slide is the requested source slide without requiring byte identity.

Repair scope (R1):
- relationship XML is parsed STRUCTURALLY with xml.etree.ElementTree;
  XML attribute order / whitespace / prefix formatting never affects the
  parsed relationship set;
- hyperlink classification is relationship-resolved:
    external  = hlinkClick r:id exists AND relationship exists AND
                Type semantically hyperlink AND TargetMode == External AND
                target non-empty;
    internal  = hlinkClick action == ppaction://hlinksldjump AND r:id exists
                AND relationship exists AND Type semantically slide AND the
                resolved target exists as a slide member of the package.
  raw rId values are never compared between source and output.

Usage:
    semantic_slide_signature.py <input.pptx> <slide_part> <out_json>
        slide_part e.g. "slide2.xml"

Output JSON:
    slide, owned_shape_names (multiset, sorted), text_markers (multiset,
    sorted), object_classes {chart, table, png, svg, external_hyperlinks,
    internal_hyperlinks, notes_relation}
"""
import json
import posixpath
import re
import sys
import zipfile
import xml.etree.ElementTree as ET

P_NS = 'http://schemas.openxmlformats.org/presentationml/2006/main'
A_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main'
REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
TABLE_URI = 'http://schemas.openxmlformats.org/drawingml/2006/table'
CHART_REL = '/chart'
NOTES_REL = '/notesSlide'
IMAGE_REL = '/image'
HYPERLINK_REL = '/hyperlink'
SLIDE_REL = '/slide'
HLINK_ACTION_INTERNAL = 'ppaction://hlinksldjump'


def parse_relationships(rels_xml):
    """Structurally parse a .rels document.

    Returns a list of (Id, Type, Target, TargetMode) tuples, one per
    Relationship element, obtained by attribute NAME (serialization order
    and formatting are non-semantic).
    """
    if not rels_xml:
        return []
    root = ET.fromstring(rels_xml)
    rels = []
    for child in root:
        if child.tag.rsplit('}', 1)[-1] == 'Relationship':
            rels.append((
                child.get('Id'),
                child.get('Type'),
                child.get('Target'),
                child.get('TargetMode') or '',
            ))
    return rels


def _hlink_click_rid(el):
    """Return the relationship id referenced by a structurally parsed
    a:hlinkClick element, independent of attribute order/prefix."""
    for key, value in el.attrib.items():
        if key == 'id' or key.endswith('}id'):
            return value
    return None


def semantic_signature(input_pptx, slide_part):
    """Compute the semantic signature dict for one slide part."""
    # normalize "slide2.xml" -> "ppt/slides/slide2.xml" (accept full member path too)
    if not slide_part.startswith('ppt/slides/'):
        slide_part = f'ppt/slides/{slide_part}'
    with zipfile.ZipFile(input_pptx) as z:
        names = z.namelist()
        if slide_part not in names:
            raise SystemExit(f'slide part missing: {slide_part}')
        xml = z.read(slide_part).decode('utf-8')
        rels_part = f'ppt/slides/_rels/{slide_part.rsplit("/", 1)[-1]}.rels'
        rels_xml = z.read(rels_part).decode('utf-8') if rels_part in names else ''

        # A. owned shape names (OWNED_* only; excludes empty/generic/unowned names)
        owned = sorted(re.findall(r'<p:cNvPr[^>]*name="(OWNED_[^"]+)"', xml))

        # B. text markers (all meaningful non-empty run texts)
        texts = sorted(
            t.strip()
            for t in re.findall(r'<a:t>([^<]*)</a:t>', xml)
            if t.strip()
        )

        # C. object classes — relationship-aware semantic classification
        rels = parse_relationships(rels_xml)
        rel_by_id = {rid: (rtype, target, mode) for rid, rtype, target, mode in rels}

        chart = any(rtype.endswith(CHART_REL) for _, rtype, _, _ in rels)
        notes_rel = any(rtype.endswith(NOTES_REL) for _, rtype, _, _ in rels)
        png = any(
            rtype.endswith(IMAGE_REL) and target.lower().endswith('.png')
            for _, rtype, target, _ in rels
        )
        svg = any(
            rtype.endswith(IMAGE_REL) and target.lower().endswith('.svg')
            for _, rtype, target, _ in rels
        )
        table = TABLE_URI in xml

        # slide members for internal-target existence (semantic, not raw rId)
        slide_members = set()
        for n in names:
            m = re.match(r'ppt/slides/slide\d+\.xml$', n)
            if m:
                slide_members.add(n)

        # hyperlinks: semantic relationship resolution, not raw rId / string scan
        external_hyperlinks = 0
        internal_hyperlinks = 0
        sroot = ET.fromstring(xml)
        for el in sroot.iter():
            if el.tag.rsplit('}', 1)[-1] != 'hlinkClick':
                continue
            rid = _hlink_click_rid(el)
            info = rel_by_id.get(rid) if rid else None
            if info is None:
                continue  # unresolvable r:id -> not a semantically valid link
            rtype, target, mode = info
            if mode == 'External' and rtype.endswith(HYPERLINK_REL) and target.strip():
                external_hyperlinks += 1
            elif (
                el.get('action') == HLINK_ACTION_INTERNAL
                and rtype.endswith(SLIDE_REL)
                and target.strip()
            ):
                # internal slide link: the resolved target must exist as a
                # slide member of this package (slideN.xml part)
                resolved = posixpath.normpath('ppt/slides/' + target.strip())
                if resolved in slide_members:
                    internal_hyperlinks += 1

        result = {
            'slide': slide_part,
            'owned_shape_names': owned,
            'text_markers': texts,
            'object_classes': {
                'chart': chart,
                'table': table,
                'png': png,
                'svg': svg,
                'external_hyperlinks': external_hyperlinks,
                'internal_hyperlinks': internal_hyperlinks,
                'notes_relation': notes_rel,
            },
        }
    return result


def main(input_pptx: str, slide_part: str, out_path: str) -> None:
    result = semantic_signature(input_pptx, slide_part)
    with open(out_path, 'w', encoding='utf-8') as fh:
        json.dump(result, fh, ensure_ascii=False, indent=1, sort_keys=True)
    print(json.dumps(result, ensure_ascii=False, sort_keys=True))


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2], sys.argv[3])
