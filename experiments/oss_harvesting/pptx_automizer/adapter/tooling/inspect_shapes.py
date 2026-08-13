#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Phase 1B-3A minimal shape/external-relationship inspector (pure stdlib).

Independent of pptx-automizer. Emits:
  slide_shapes: { "slideN.xml": [shape names ...] }
  external_relationships: [{source, id, type, target, target_mode}]
"""
import json
import re
import sys
import zipfile


def main(input_pptx: str, out_path: str) -> None:
    with zipfile.ZipFile(input_pptx) as z:
        names = z.namelist()
        slide_shapes = {}
        for n in sorted(names):
            m = re.match(r'ppt/slides/slide(\d+)\.xml$', n)
            if m:
                xml = z.read(n).decode('utf-8')
                shape_names = re.findall(r'<p:cNvPr[^>]*name="([^"]*)"', xml)
                slide_shapes[f'slide{m.group(1)}.xml'] = shape_names
        external_relationships = []
        for n in sorted(names):
            if n.endswith('.rels'):
                xml = z.read(n).decode('utf-8')
                for r in re.finditer(
                    r'<Relationship[^>]*Id="([^"]+)"[^>]*Type="([^"]+)"[^>]*Target="([^"]+)"[^>]*TargetMode="([^"]*)"',
                    xml,
                ):
                    if r.group(4) == 'External':
                        external_relationships.append({
                            'source': n, 'id': r.group(1), 'type': r.group(2),
                            'target': r.group(3), 'target_mode': 'External',
                        })
    result = {
        'observer': 'ap1b3a-shape-inspector',
        'input': input_pptx,
        'slide_shapes': slide_shapes,
        'external_relationships': external_relationships,
    }
    with open(out_path, 'w', encoding='utf-8') as fh:
        json.dump(result, fh, ensure_ascii=False, indent=1)
    print(json.dumps(result, ensure_ascii=False, indent=1))


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
