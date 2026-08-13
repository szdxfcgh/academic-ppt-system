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
const SIGNATURE_TOOL = path.resolve(__dirname, '..', 'tooling', 'semantic_slide_signature.py');
const ALLOWLISTED_EXTERNAL_REL_TARGETS = [
  'https://example.invalid/academicppt-owned-fixture',
];

function sha256File(p: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').toUpperCase();
}

// Safe confinement predicate: expected invalid/absent paths return false
// (EXPECTED INPUT/POLICY FAILURE) instead of throwing an uncontrolled
// filesystem exception. Confinement semantics are unchanged (never weakened).
function confine(p: string | undefined, root: string | undefined): boolean {
  if (!p || !root) return false;
  try {
    if (!fs.existsSync(root) || !fs.existsSync(p)) return false;
    if (fs.lstatSync(p).isSymbolicLink()) return false;
    const realRoot = fs.realpathSync(root);
    const realP = fs.realpathSync(p);
    const rel = path.relative(realRoot, realP);
    return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
  } catch {
    return false; // expected path/input failure -> policy failure, not exception
  }
}

const REQUIRED_PREFLIGHT_FIELDS = [
  'request_id',
  'operation',
  'input_path',
  'output_path',
  'staging_root',
  'output_dir',
] as const;

export interface PreflightResult {
  ok: boolean;
  errors: string[];
  evidence: Record<string, unknown>;
}

export function preflight(req: TemplateReuseRequest): PreflightResult {
  const errors: string[] = [];
  const evidence: Record<string, unknown> = {};

  // 0) required-field completeness (self-contained; cli also gates this)
  const missing = REQUIRED_PREFLIGHT_FIELDS.filter((f) => {
    const v = (req as unknown as Record<string, unknown>)[f];
    return v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
  });
  if (missing.length > 0) {
    return { ok: false, errors: [`REQUEST_REQUIRED_FIELD_MISSING: ${missing.join(',')}`], evidence };
  }

  // 0b) existence checks before any confinement/fs work (classified, no exceptions)
  if (!fs.existsSync(req.staging_root)) {
    errors.push('REQUEST_PATH_INVALID: staging root missing');
  }
  if (!fs.existsSync(req.output_dir)) {
    errors.push('REQUEST_OUTPUT_PARENT_INVALID: output dir missing');
  }
  if (!fs.existsSync(req.input_path)) {
    errors.push('REQUEST_PATH_INVALID: input file missing');
  }
  if (!fs.existsSync(path.dirname(req.output_path))) {
    errors.push('REQUEST_OUTPUT_PARENT_INVALID: output parent directory missing');
  }

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
  let sourceIdentityMismatch = false;
  if (fs.existsSync(req.input_path)) {
    const h = sha256File(req.input_path);
    const size = fs.statSync(req.input_path).size;
    evidence.input_hash = h;
    evidence.input_size = size;
    if (h !== FIXTURE_SHA256) {
      errors.push(`POLICY: source SHA mismatch (expected ${FIXTURE_SHA256}, got ${h})`);
      sourceIdentityMismatch = true;
    }
    if (size !== FIXTURE_BYTES) {
      errors.push(`POLICY: source size mismatch (expected ${FIXTURE_BYTES}, got ${size})`);
      sourceIdentityMismatch = true;
    }
  } else {
    errors.push('REQUEST_PATH_INVALID: input file missing');
  }

  // 2b) 1B-3B5R1A strong fixture identity short-circuit. The adapter is
  // qualified ONLY against the exact frozen fixture. A source that fails
  // exact SHA/size identity is untrusted and has no authority to proceed
  // into deeper package inspection — a malformed tampered package must
  // never reach the Python observers and escape as an internal failure.
  if (sourceIdentityMismatch) {
    return { ok: false, errors, evidence };
  }

  // 3) request id uniqueness (caller-provided; reject empty/duplicate by policy)
  if (!req.request_id || !/^[A-Za-z0-9._-]{8,64}$/.test(req.request_id)) {
    errors.push('POLICY: request_id invalid or non-unique');
  }

  // 3b) 1B-3B1B1 D1/D2 prerequisite guard: package observers, shape
  // inspectors and signature tools must never be invoked when their
  // filesystem prerequisites are absent. The structured policy errors
  // accumulated above are authoritative; an expected invalid-input failure
  // must not escape as an uncontrolled internal exception.
  if (!fs.existsSync(req.input_path) || !fs.existsSync(req.staging_root)) {
    return { ok: false, errors, evidence };
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

    // 4b) 1B-3B1A-R1 trust boundary: capture the requested source-slide
    // semantic signature BEFORE any upstream execution. This frozen value is
    // the ONLY source of source-truth for the postflight comparison; the
    // postflight never re-derives source truth from req.input_path after the
    // untrusted upstream boundary.
    if (req.operation === 'COPY_SLIDE') {
      const srcPart = `slide${slideId}.xml`;
      try {
        const srcSig = runPythonToFile(
          SIGNATURE_TOOL,
          [req.input_path, srcPart],
          path.join(req.staging_root, '_preflight_source_signature.json'),
        );
        evidence.source_slide_part = srcPart;
        evidence.source_slide_signature_pre_execution = srcSig;
      } catch (err: any) {
        errors.push(`POLICY: SIGNATURE_EXTRACTION_FAILED ${err && err.message ? err.message : String(err)}`);
      }
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
