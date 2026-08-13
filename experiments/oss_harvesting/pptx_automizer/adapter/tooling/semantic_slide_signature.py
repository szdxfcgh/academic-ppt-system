#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Phase 1B-3B1A — deterministic semantic slide signature (pure stdlib).

Read-only, package/OOXML-based, network-free. Extracts a semantic signature
for one slide part of a PPTX so COPY_SLIDE can prove that the appended output
slide is the requested source slide without requiring byte identity.

Usage:
    semantic_slide_signature.py <input.pptx> <slide_part> <out_json>
        slide_part e.g. "slide2.xml"

Output JSON:
    slide, owned_shape_names (multiset, sorted), text_markers (multiset,
    sorted), object_classes {chart, table, png, svg, external_hyperlinks,
    internal_hyperlinks, notes_relation}
"""
import json
import re
import sys
import zipfile

P_NS = 'http://schemas.openxmlformats.org/presentationml/2006/main'
A_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main'
REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
TABLE_URI = 'http://schemas.openxmlformats.org/drawingml/2006/table'
CHART_REL = '/chart'
NOTES_REL = '/notesSlide'
IMAGE_REL = '/image'
HYPERLINK_REL = '/hyperlink'


def main(input_pptx: str, slide_part: str, out_path: str) -> None:
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
        # TargetMode is optional (internal relationships omit it) -> make it optional
        rels = re.findall(
            r'<Relationship[^>]*Id="([^"]+)"[^>]*Type="([^"]+)"[^>]*Target="([^"]+)"(?:[^>]*TargetMode="([^"]*)")?',
            rels_xml,
        )
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

        # hyperlinks: semantic resolution, not raw rId
        external_hyperlinks = 0
        internal_hyperlinks = 0
        for m in re.finditer(r'<a:hlinkClick[^>]*r:id="([^"]+)"', xml):
            rid = m.group(1)
            info = rel_by_id.get(rid)
            if info and info[2] == 'External':
                external_hyperlinks += 1
            else:
                external_hyperlinks += 0
        internal_hyperlinks = len(
            re.findall(r'action="ppaction://hlinksldjump"', xml)
        )

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
    with open(out_path, 'w', encoding='utf-8') as fh:
        json.dump(result, fh, ensure_ascii=False, indent=1, sort_keys=True)
    print(json.dumps(result, ensure_ascii=False, sort_keys=True))


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2], sys.argv[3])
