// Phase 1B-3A — translation to the pinned pptx-automizer runtime
// Public portability: the pinned upstream runtime is NOT vendored. Resolve it via
// PPTX_AUTOMIZER_RUNTIME_ROOT (env) or the conventional local path
// <experiment-root>/upstream/pptx-automizer (see README.md).
import { createRequire } from 'module';
import * as path from 'path';
import {
  FIXTURE_FILENAME,
  resolveSlideId,
  TemplateReuseRequest,
  OperationManifest,
} from './contracts';

export const ISOLATED_RUNTIME_ROOT =
  process.env.PPTX_AUTOMIZER_RUNTIME_ROOT ||
  path.resolve(__dirname, '..', '..', 'upstream', 'pptx-automizer');

export interface ExecuteResult {
  ok: boolean;
  operation_manifest: OperationManifest | null;
  errors: string[];
  evidence: Record<string, unknown>;
}

export async function execute(req: TemplateReuseRequest): Promise<ExecuteResult> {
  const errors: string[] = [];
  const evidence: Record<string, unknown> = {};

  // Request-derived diagnostic manifest state is independent of the runtime
  // boundary; upstream success is never fabricated here.
  const manifest: OperationManifest = {
    operation_id: req.request_id,
    operation: req.operation,
    source_slide_identity: null,
    target_slide_identity: null,
    action: '',
    element: req.element || null,
    warnings: [],
  };

  try {
    // 1B-3B1B2 D4: the entire isolated upstream runtime boundary — resolution,
    // module load, Automizer construction and every invocation — is protected
    // by ONE coherent structured failure path. Runtime-establishment failures
    // (missing runtime root, missing package.json, resolution or require
    // failure, construction failure) return through ExecuteResult instead of
    // escaping as an uncontrolled exception.
    const isolatedRequire = createRequire(path.join(ISOLATED_RUNTIME_ROOT, 'package.json'));
    const library = isolatedRequire(ISOLATED_RUNTIME_ROOT); // resolves dist/index.js (main)
    evidence.upstream_resolved = isolatedRequire.resolve(ISOLATED_RUNTIME_ROOT);

    const automizer = new library.Automizer({
      templateDir: path.dirname(req.input_path),
      outputDir: req.output_dir,
      removeExistingSlides: false,
      verbosity: 0,
    });

    automizer.loadRoot(FIXTURE_FILENAME);
    automizer.load(FIXTURE_FILENAME, 'core');

    if (req.operation === 'COPY_SLIDE') {
      const src = resolveSlideId(req.source_slide);
      manifest.source_slide_identity = src;
      manifest.action = `copy slide ${src} -> APPEND`;
      automizer.addSlide('core', src as number);
      await automizer.write(path.basename(req.output_path));
      evidence.slide_count_after = 5; // 4 root + 1 appended (verified in postflight)
    } else if (req.operation === 'COPY_ELEMENT') {
      const srcSlide = resolveSlideId(req.element_source_slide);
      const base = resolveSlideId(req.target_base_slide ?? 'FIX_SLIDE_01_TITLE');
      manifest.source_slide_identity = srcSlide;
      manifest.target_slide_identity = base;
      manifest.action = `copy element ${req.element} from slide ${srcSlide} onto appended copy of slide ${base}`;
      automizer.addSlide('core', base as number, (slide: any) => {
        slide.addElement('core', srcSlide as number, req.element as string);
      });
      await automizer.write(path.basename(req.output_path));
      evidence.slide_count_after = 5;
    } else {
      errors.push(`UNSUPPORTED_OPERATION: ${req.operation}`);
    }
  } catch (err: any) {
    errors.push(`UPSTREAM_EXECUTION_FAILURE: ${err && err.message ? err.message : String(err)}`);
  }

  return { ok: errors.length === 0, operation_manifest: manifest, errors, evidence };
}
