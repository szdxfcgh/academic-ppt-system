// Phase 1B-3A — independent read-only static postflight on the output candidate
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { TemplateReuseRequest, OperationManifest, resolveSlideId } from './contracts';

const PYTHON = process.env.PYTHON || 'python';
const OBSERVER = path.resolve(__dirname, '..', '..', 'tooling', 'observe_pptx.py');
const SHAPE_INSPECTOR = path.resolve(__dirname, '..', 'tooling', 'inspect_shapes.py');
const SIGNATURE_TOOL = path.resolve(__dirname, '..', 'tooling', 'semantic_slide_signature.py');

export interface PostflightResult {
  ok: boolean;
  warnings: string[];
  errors: string[];
  evidence: Record<string, unknown>;
}

export function postflight(req: TemplateReuseRequest, manifest: OperationManifest | null, trustedPreflightEvidence?: Record<string, unknown>): PostflightResult {
  const warnings: string[] = [];
  const errors: string[] = [];
  const evidence: Record<string, unknown> = {};

  if (!fs.existsSync(req.output_path)) {
    errors.push('POSTFLIGHT: output missing');
    return { ok: false, warnings, errors, evidence };
  }

  const raw = fs.readFileSync(req.output_path);
  evidence.output_hash = crypto.createHash('sha256').update(raw).digest('hex').toUpperCase();
  evidence.output_size = raw.length;

  // independent package observation
  const obs = runPythonToFile(OBSERVER, [req.output_path], path.join(path.dirname(req.output_path), '_postflight_observe.json'));
  evidence.observer_status = obs.status;
  evidence.presentation_sldId_count = obs.presentation_sldId_count;
  evidence.forbidden_part_hits = obs.forbidden_part_hits || [];
  evidence.notes_marker_present = obs.notes_marker_present;

  if (obs.status !== 'PASS') warnings.push(`POSTFLIGHT: package observer status = ${obs.status} (fixture-baseline semantics; output-specific checks below)`);
  if ((obs.presentation_sldId_count ?? 0) !== 5) errors.push(`POSTFLIGHT: expected 5 slides, got ${obs.presentation_sldId_count}`);
  if ((obs.forbidden_part_hits || []).length > 0) errors.push('POSTFLIGHT: forbidden part detected in output');

  // relationship id uniqueness + target resolution are covered by observer issues
  for (const issue of obs.issues || []) {
    const text = JSON.stringify(issue);
    if (/slide count/i.test(text)) {
      // observer's slide_count_expected is fixture-baseline (4); outputs legitimately have 5
      warnings.push(`POSTFLIGHT: observer baseline-expected count note: ${text}`);
    } else {
      errors.push(`POSTFLIGHT: observer issue: ${text}`);
    }
  }

  // external relationships allowlist
  const ext = runPythonToFile(SHAPE_INSPECTOR, [req.output_path], path.join(path.dirname(req.output_path), '_postflight_shapes.json'));
  const external = ext.external_relationships || [];
  evidence.external_relationships = external;
  for (const e of external) {
    if (e.target !== 'https://example.invalid/academicppt-owned-fixture') {
      errors.push(`POSTFLIGHT: unexpected external relationship ${e.target}`);
    }
  }

  // internal slide-count consistency: slide part files == presentation sldId count
  const partCount = Object.keys(ext?.slide_shapes || {}).length;
  evidence.slide_part_count = partCount;
  if (partCount !== (obs.presentation_sldId_count ?? 0)) {
    errors.push(`POSTFLIGHT: slide part count (${partCount}) != sldId count (${obs.presentation_sldId_count})`);
  }

  // operation-specific observations
  if (req.operation === 'COPY_SLIDE') {
    const count = obs.presentation_sldId_count ?? 0;
    if (count < 5) {
      errors.push('POSTFLIGHT: copied slide not appended');
    } else {
      // Phase 1B-3B1A-R1: source identity is resolved independently from the
      // REQUEST (req.source_slide), never trusted from the execution manifest.
      // execute.ts claims are outside the trust boundary. Source TRUTH is the
      // trusted pre-execution signature captured by preflight BEFORE the
      // untrusted upstream boundary; postflight never re-derives source truth
      // from req.input_path afterwards.
      const srcNum = resolveSlideId(req.source_slide);
      if (srcNum === null) {
        errors.push('POSTFLIGHT: COPY_SLIDE_SOURCE_UNRESOLVED (request source slide could not be resolved)');
      } else {
        const srcPart = `slide${srcNum}.xml`;
        const appendedPart = `slide${count}.xml`;
        const trusted = (trustedPreflightEvidence ?? {}) as Record<string, any>;
        const trustedSig = trusted.source_slide_signature_pre_execution;
        if (!trustedSig || trusted.source_slide_part !== srcPart) {
          errors.push(`POSTFLIGHT: SIGNATURE_EXTRACTION_FAILED (no trusted pre-execution source signature for ${srcPart})`);
        } else {
          const appSig = runPythonToFile(SIGNATURE_TOOL, [req.output_path, appendedPart], path.join(path.dirname(req.output_path), '_appended_signature.json'));
          evidence.trusted_source_signature = trustedSig;
          evidence.appended_signature = appSig;
          // Post-execution source immutability (additional guard). The semantic
          // comparison still uses the PRE-EXECUTION trusted signature.
          const expectedSha = typeof trusted.input_hash === 'string' ? trusted.input_hash : null;
          // 1B-3B1B1 D3: missing/unreadable/changed staged source after the
          // trusted preflight is a structured immutability failure — the
          // filesystem exception must never escape into the CLI catch.
          let afterSha: string | null = null;
          try {
            afterSha = sha256File(req.input_path);
            evidence.source_immutability_check = 'VERIFIED';
          } catch {
            afterSha = null;
            evidence.source_immutability_check = 'UNREADABLE_OR_MISSING';
          }
          evidence.source_sha256_after = afterSha;
          evidence.source_sha256_expected = expectedSha;
          if (expectedSha !== null && afterSha !== expectedSha) {
            errors.push('POSTFLIGHT: SOURCE_MUTATED_AFTER_PREFLIGHT (staged source SHA changed or unreadable after trusted preflight)');
          }
          const dims = ['owned_shape_names', 'text_markers', 'object_classes'] as const;
          const mismatches = dims.filter((d) => JSON.stringify(trustedSig[d]) !== JSON.stringify(appSig[d]));
          if (mismatches.length > 0) {
            errors.push(`POSTFLIGHT: COPY_SLIDE_IDENTITY_MISMATCH dimensions=${mismatches.join(',')} (${srcPart} != ${appendedPart})`);
          } else {
            warnings.push(`POSTFLIGHT: semantic identity matched (${srcPart} == ${appendedPart})`);
          }
          evidence.operation_observation = `copied slide present as slide ${count}; identity ${mismatches.length === 0 ? 'MATCHED' : 'MISMATCHED'}`;
          // manifest source is diagnostic evidence only (request is authoritative)
          evidence.manifest_source_slide_identity = manifest?.source_slide_identity ?? null;
        }
      }
    }
  } else if (req.operation === 'COPY_ELEMENT') {
    const shapes = runPythonToFile(SHAPE_INSPECTOR, [req.output_path], path.join(path.dirname(req.output_path), '_postflight_shapes_el.json'));
    const slideNames = shapes.slide_shapes as Record<string, string[]>;
    const lastSlideKey = `slide${obs.presentation_sldId_count}.xml`;
    const names = slideNames[lastSlideKey] || [];
    const hits = names.filter((n: string) => n === req.element);
    evidence.operation_observation = {
      target_slide: lastSlideKey,
      element: req.element,
      matches: hits.length,
    };
    if (hits.length !== 1) errors.push(`POSTFLIGHT: element ${req.element} not found exactly once on ${lastSlideKey}`);
  }

  return { ok: errors.length === 0, warnings, errors, evidence };
}

function runPythonToFile(script: string, args: string[], outJson: string): any {
  execFileSync(PYTHON, [script, ...args, outJson], { encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 });
  return JSON.parse(fs.readFileSync(outJson, 'utf-8'));
}

function sha256File(p: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').toUpperCase();
}
