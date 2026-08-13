#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Phase 1B-2R independent OPC/OOXML observer for APPT_TRP_FIXTURE_CORE_V1.

Pure-stdlib (zipfile + xml.etree) package observer, independent of the
fixture writer. Emits evidence/observer-result.json.
"""
import hashlib
import json
import os
import re
import sys
import zipfile
import xml.etree.ElementTree as ET

NS = {
    'ct': 'http://schemas.openxmlformats.org/package/2006/content-types',
    'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
    'pr': 'http://schemas.openxmlformats.org/package/2006/relationships',
    'p': 'http://schemas.openxmlformats.org/presentationml/2006/main',
    'a': 'http://schemas.openxmlformats.org/drawingml/2006/main',
    'c': 'http://schemas.openxmlformats.org/drawingml/2006/chart',
    'rel': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
    'xdr': 'http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing',
    'x': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main',
}

FORBIDDEN_PART_PATTERNS = [
    (re.compile(r'vbaProject', re.I), 'VBA'),
    (re.compile(r'oleObject', re.I), 'OLE'),
    (re.compile(r'activeX|control\d', re.I), 'ActiveX'),
    (re.compile(r'\.bin$', re.I), 'BIN'),
]


def q(tag):
    for prefix, uri in NS.items():
        if tag.startswith(prefix + ':'):
            return '{%s}%s' % (uri, tag.split(':', 1)[1])
    return tag


def main(pptx_path, out_path):
    result = {
        'observer': 'ap1b2r-opc-observer',
        'run_id': 'phase1b2r_fixture_core_20260812T154526Z',
        'input': os.path.basename(pptx_path),
        'status': 'PASS',
        'issues': [],
    }

    with open(pptx_path, 'rb') as fh:
        raw = fh.read()
    result['file_sha256'] = hashlib.sha256(raw).hexdigest().upper()
    result['file_bytes'] = len(raw)

    z = zipfile.ZipFile(pptx_path)
    names = z.namelist()
    result['zip_entries'] = len(names)
    result['zip_entries_list'] = sorted(names)

    # --- content types ---
    ct_xml = z.read('[Content_Types].xml').decode('utf-8')
    ct_root = ET.fromstring(ct_xml)
    defaults = {}
    overrides = {}
    for el in ct_root:
        if el.tag == q('ct:Default'):
            defaults[el.get('Extension')] = el.get('ContentType')
        elif el.tag == q('ct:Override'):
            overrides[el.get('PartName')] = el.get('ContentType')
    result['content_types'] = {'defaults': defaults, 'overrides': overrides}

    # --- part inventory ---
    def count(prefix):
        return len([n for n in names if n.startswith(prefix)])

    result['parts'] = {
        'slides': count('ppt/slides/slide'),
        'slide_layouts': count('ppt/slideLayouts/slideLayout'),
        'slide_masters': count('ppt/slideMasters/slideMaster'),
        'themes': count('ppt/theme/theme'),
        'notes_slides': len([n for n in names if re.match(r'ppt/notesSlides/notesSlide\d+\.xml$', n)]),
        'charts': len([n for n in names if re.match(r'ppt/(slides/charts|charts)/chart\d+\.xml$', n)]),
        'embeddings': count('ppt/embeddings/'),
        'media': [n for n in names if n.startswith('ppt/media/')],
    }

    # --- forbidden parts ---
    forbidden_hits = []
    for n in names:
        for pat, label in FORBIDDEN_PART_PATTERNS:
            if pat.search(n):
                forbidden_hits.append((n, label))
    result['forbidden_part_hits'] = forbidden_hits
    if forbidden_hits:
        result['status'] = 'FAIL'
        result['issues'].append('forbidden parts found')

    # --- slide count vs spec ---
    result['slide_count_expected'] = 4
    if result['parts']['slides'] != 4:
        result['status'] = 'FAIL'
        result['issues'].append('slide count != 4')

    # --- per-slide checks ---
    slide_checks = {}
    for i in range(1, result['parts']['slides'] + 1):
        rel_path = 'ppt/slides/_rels/slide%d.xml.rels' % i
        slide_path = 'ppt/slides/slide%d.xml' % i
        sc = {'rels': [], 'texts': [], 'chart': False, 'svg': False, 'png': False,
              'table': False, 'srcRect_crop': [], 'hyperlink_count': 0}
        # relationships
        if rel_path in names:
            rel_root = ET.fromstring(z.read(rel_path).decode('utf-8'))
            for rel in rel_root:
                sc['rels'].append({
                    'Id': rel.get('Id'),
                    'Type': rel.get('Type').split('/')[-1],
                    'Target': rel.get('Target'),
                    'TargetMode': rel.get('TargetMode'),
                })
                tgt = rel.get('Target', '')
                if 'chart' in tgt:
                    sc['chart'] = True
                if 'media' in tgt and 'svg' in tgt.lower():
                    sc['svg'] = True
                if 'media' in tgt and ('png' in tgt.lower() or 'image' in tgt.lower()):
                    sc['png'] = True
                if 'notesSlide' in tgt:
                    sc['notes_rel'] = True
        # slide xml
        slide_xml = z.read(slide_path).decode('utf-8')
        sroot = ET.fromstring(slide_xml)
        for el in sroot.iter():
            tag = el.tag.split('}')[-1]
            if tag == 't':
                sc['texts'].append(el.text or '')
            if tag == 'tbl':
                sc['table'] = True
            if tag == 'srcRect':
                sc['srcRect_crop'].append({k: el.get(k) for k in
                                           ('l', 't', 'r', 'b') if el.get(k) is not None})
            if tag == 'hlinkClick':
                sc['hyperlink_count'] += 1
        slide_checks['slide%d' % i] = sc
    result['slide_checks'] = slide_checks

    # --- notes marker ---
    notes_found = []
    for n in names:
        if re.match(r'ppt/notesSlides/notesSlide\d+\.xml$', n):
            body = z.read(n).decode('utf-8')
            notes_found.append('APPT_TRP_NOTE_MARKER_01' in body)
    result['notes_marker_present'] = notes_found

    # --- chart + embedded workbook ---
    chart_parts = [n for n in names if re.match(r'ppt/(slides/charts|charts)/chart\d+\.xml$', n)]
    workbook_parts = [n for n in names if re.match(r'.*\.(xlsx|bin)$', n) or n.startswith('ppt/embeddings/')]
    result['chart_parts'] = chart_parts
    result['workbook_parts'] = workbook_parts
    if chart_parts and not workbook_parts:
        result['issues'].append('chart present but NO embedded workbook part (contract gap: embedded workbook)')
        result['status'] = 'CONTRACT_GAP' if result['status'] == 'PASS' else result['status']
    chart_xml = ''
    if chart_parts:
        chart_xml = z.read([c for c in chart_parts if c.endswith('.xml')][0]).decode('utf-8')
        result['chart_has_chartSpace'] = 'chartSpace' in chart_xml
        result['chart_series_count'] = chart_xml.count('<c:ser>')
        cats = re.findall(r'<c:pt[^>]*idx="(\d+)"[^>]*>\s*<c:v>([^<]+)</c:v>', chart_xml)
        result['chart_category_pts'] = cats[:10]

    # --- svg fallback (asvg must have png fallback part in slide rels) ---
    svg_fallback_ok = []
    for i in range(1, 5):
        sc = slide_checks.get('slide%d' % i, {})
        targets = [r['Target'] for r in sc.get('rels', []) if 'media' in r.get('Target', '')]
        has_svg = any('svg' in t.lower() for t in targets)
        has_png = any('png' in t.lower() or 'image' in t.lower() for t in targets)
        svg_fallback_ok.append({'slide': i, 'svg_target': has_svg, 'png_target': has_png})
    result['svg_fallback_probe'] = svg_fallback_ok

    # --- theme colors ---
    theme_part = [n for n in names if n.startswith('ppt/theme/theme')]
    if theme_part:
        theme_xml = z.read(theme_part[0]).decode('utf-8')
        tcolors = re.findall(
            r'<a:(dk1|lt1|dk2|lt2|accent1|accent2|accent3|accent4|accent5|accent6|hlink|folHlink)>'
            r'\s*<a:(srgbClr|sysClr)[^>]*val="([0-9A-Fa-f]{6})"', theme_xml)
        result['theme_colors'] = {k: v for k, s, v in tcolors}
        result['theme_part'] = theme_part[0]

    # --- hyperlinks across whole package ---
    total_hlinks = 0
    for n in names:
        if n.endswith('.xml') and not n.startswith('ppt/media'):
            total_hlinks += z.read(n).decode('utf-8').count('<a:hlinkClick')
    result['package_hlinkClick_count'] = total_hlinks

    # --- presentation.xml slide ordering ---
    pres_xml = z.read('ppt/presentation.xml').decode('utf-8')
    sld_ids = re.findall(r'<p:sldId[^>]*r:id="([^"]+)"', pres_xml)
    result['presentation_sldId_count'] = len(sld_ids)

    with open(out_path, 'w', encoding='utf-8') as fh:
        json.dump(result, fh, ensure_ascii=False, indent=1)
    print(json.dumps({k: v for k, v in result.items() if k != 'zip_entries_list'}, ensure_ascii=False, indent=1))
    print('STATUS:', result['status'])


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
