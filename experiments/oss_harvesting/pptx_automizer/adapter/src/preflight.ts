// Phase 1B-3A — input safety + security preflight (independent of pptx-automizer)
// Public portability: all helper scripts resolve relative to this adapter; the
// fixture identity constants describe the rights-clear synthetic fixture.
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import {
  FIXTURE_SHA256,
  FIXTURE_BYTES,
  resolveSlideId,
  TemplateReuseRequest,
} from './contracts';

const PYTHON = process.env.PYTHON || 'python';
const OBSERVER = path.resolve(__dirname, '..', '..', 'tooling', 'observe_pptx.py');
const SHAPE_INSPECTOR = path.resolve(__dirname, '..', 'tooling', 'inspect_shapes.py');
const ALLOWLISTED_EXTERNAL_REL_TARGETS = [
  'https://example.invalid/academicppt-owned-fixture',
];

function sha256File(p: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').toUpperCase();
}

function confine(p: string, root: string): boolean {
  const realRoot = fs.realpathSync(root);
  const realP = fs.realpathSync(p);
  if (fs.lstatSync(p).isSymbolicLink()) return false;
  const rel = path.relative(realRoot, realP);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

export interface PreflightResult {
  ok: boolean;
  errors: string[];
  evidence: Record<string, unknown>;
}

export function preflight(req: TemplateReuseRequest): PreflightResult {
  const errors: string[] = [];
  const evidence: Record<string, unknown> = {};

  // 1) path confinement under staging root
  if (!confine(req.input_path, req.staging_root)) {
    errors.push('POLICY: input path not confined under staging root');
  }
  // output must not exist and must be confined under output dir
  if (fs.existsSync(req.output_path)) {
    errors.push('POLICY: output path already exists');
  }
  if (!confine(path.dirname(req.output_path), req.output_dir)) {
    errors.push('POLICY: output directory not confined');
  }

  // 2) source is a fresh copy of the frozen fixture (identity exact)
  if (fs.existsSync(req.input_path)) {
    const h = sha256File(req.input_path);
    const size = fs.statSync(req.input_path).size;
    evidence.input_hash = h;
    evidence.input_size = size;
    if (h !== FIXTURE_SHA256) errors.push(`POLICY: source SHA mismatch (expected ${FIXTURE_SHA256}, got ${h})`);
    if (size !== FIXTURE_BYTES) errors.push(`POLICY: source size mismatch (expected ${FIXTURE_BYTES}, got ${size})`);
  } else {
    errors.push('POLICY: input file missing');
  }

  // 3) request id uniqueness (caller-provided; reject empty/duplicate by policy)
  if (!req.request_id || !/^[A-Za-z0-9._-]{8,64}$/.test(req.request_id)) {
    errors.push('POLICY: request_id invalid or non-unique');
  }

  // 4) selector resolution (independent of pptx-automizer)
  const slideId = resolveSlideId(req.source_slide ?? req.element_source_slide);
  if (slideId === null) {
    errors.push('POLICY: source slide identity unresolvable');
  } else {
    const obs = runPythonToFile(OBSERVER, [req.input_path], path.join(req.staging_root, '_preflight_observe.json'));
    evidence.preflight_observer_status = obs.status;
    const sldCount = (obs.presentation_sldId_count as number) ?? 0;
    evidence.presentation_sldId_count = sldCount;
    if (sldCount !== 4) errors.push(`POLICY: fixture slide count mismatch (expected 4, got ${sldCount})`);
    if (slideId > sldCount) errors.push('POLICY: source slide index out of range');

    if (req.operation === 'COPY_ELEMENT') {
      const shapeOut = runPythonToFile(SHAPE_INSPECTOR, [req.input_path], path.join(req.staging_root, '_preflight_shapes.json'));
      const names = (shapeOut.slide_shapes as Record<string, string[]>)[`slide${slideId}.xml`] || [];
      const hits = names.filter((n: string) => n === req.element);
      evidence.element_selector = { name: req.element, slide: `slide${slideId}.xml`, matches: hits.length };
      if (hits.length !== 1) errors.push(`POLICY: element selector must resolve exactly once (got ${hits.length})`);
    }
  }

  // 5) security preflight: VBA/OLE/ActiveX absent, external rels allowlisted
  const obs = runPythonToFile(OBSERVER, [req.input_path], path.join(req.staging_root, '_preflight_observe_sec.json'));
  evidence.forbidden_part_hits = obs.forbidden_part_hits || [];
  if ((obs.forbidden_part_hits as unknown[]).length > 0) errors.push('POLICY: forbidden part (VBA/OLE/ActiveX) detected');

  const ext = runPythonToFile(SHAPE_INSPECTOR, [req.input_path], path.join(req.staging_root, '_preflight_shapes_sec.json'));
  const external = (ext.external_relationships as Array<{ target: string }>) || [];
  evidence.external_relationships = external;
  for (const e of external) {
    if (!ALLOWLISTED_EXTERNAL_REL_TARGETS.includes(e.target)) {
      errors.push(`POLICY: unexpected external relationship target ${e.target}`);
    }
  }

  return { ok: errors.length === 0, errors, evidence };
}

function runPythonToFile(script: string, args: string[], outJson: string): any {
  execFileSync(PYTHON, [script, ...args, outJson], { encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 });
  return JSON.parse(fs.readFileSync(outJson, 'utf-8'));
}
