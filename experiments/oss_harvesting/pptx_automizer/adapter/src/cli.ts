// Phase 1B-3A — one-shot isolated CLI entrypoint
// Phase 1B-3B1C-A — structured request failure hardening
// Phase 1B-3B1C1 — network guard fail-closed repair
// Usage: node dist/cli.js <request.json>
// Process boundary: file + JSON only; no imports from AcademicPPT production Core.
import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
// CommonJS `import = require` bindings: the emitted JS binds the hook targets
// DIRECTLY to the real Node core-module export objects (const http =
// require('http')), never to TypeScript __importStar namespace wrappers whose
// properties are non-configurable getters (the 1B-3B1C0 audit defect).
import http = require('http');
import https = require('https');
import net = require('net');
import dns = require('dns');
import { buildResponse, SUPPORTED_OPERATIONS, UNSUPPORTED_OPERATIONS, TemplateReuseRequest } from './contracts';
import { preflight } from './preflight';
import { execute } from './execute';
import { postflight } from './observe';

// Classified adapter input failures: stable machine-readable envelope + deterministic exit code.
function fatalEnvelope(kind: string, exitCode: number, detail?: unknown): never {
  console.error(JSON.stringify({ final_status: kind, exit_code: exitCode, detail: detail ?? null }));
  process.exit(exitCode);
}

// Network exclusion: any attempt is recorded and rejected.
const networkAttempts: string[] = [];
function blockNetwork(name: string) {
  return function blocked(): never {
    networkAttempts.push(name);
    throw new Error(`Unexpected runtime network call: ${name}`);
  };
}

// The declared required exclusion surface (1B-3B1C1). The contract is NOT
// expanded: exactly these nine hooks, nothing else.
const REQUIRED_HOOKS: Array<{ name: string; target: unknown; prop: string }> = [
  { name: 'global.fetch', target: globalThis, prop: 'fetch' },
  { name: 'http.request', target: http, prop: 'request' },
  { name: 'http.get', target: http, prop: 'get' },
  { name: 'https.request', target: https, prop: 'request' },
  { name: 'https.get', target: https, prop: 'get' },
  { name: 'net.connect', target: net, prop: 'connect' },
  { name: 'net.createConnection', target: net, prop: 'createConnection' },
  { name: 'dns.lookup', target: dns, prop: 'lookup' },
  { name: 'dns.resolve', target: dns, prop: 'resolve' },
];

function installNetworkGuard(): void {
  for (const hook of REQUIRED_HOOKS) {
    const obj = hook.target as Record<string, unknown>;
    if (hook.name === 'global.fetch' && typeof obj[hook.prop] !== 'function') {
      // declared surface absent in this runtime: classify explicitly and fail
      // closed rather than silently pretending coverage
      fatalEnvelope('NETWORK_GUARD_INSTALLATION_FAILED', 6, { hook: hook.name, reason: 'declared network surface not present in runtime' });
    }
    const blocker = blockNetwork(hook.name);
    let installed = false;
    try {
      Object.defineProperty(obj, hook.prop, { value: blocker, configurable: true, writable: true });
      installed = true;
    } catch {
      installed = false;
    }
    if (!installed) {
      try {
        obj[hook.prop] = blocker;
        installed = true;
      } catch {
        installed = false;
      }
    }
    // Identity verification: assume nothing about defineProperty/assignment
    // success — the property must actually resolve to our blocker.
    if (!installed || obj[hook.prop] !== blocker) {
      fatalEnvelope('NETWORK_GUARD_INSTALLATION_FAILED', 6, { hook: hook.name, message: 'required network hook could not be installed or verified; refusing to start unprotected' });
    }
  }
}

installNetworkGuard();

// 1B-3B5R2B deterministic ZIP normalization. The adapter owns ONE
// serialization boundary strictly AFTER successful upstream execution and
// BEFORE any postflight observation: the generated archive's member
// timestamps are rewritten to the documented constant so output bytes are
// reproducible. It never parses OOXML payloads; postflight remains the final
// output_hash / output_size authority and only ever sees normalized bytes.
const PYTHON = process.env.PYTHON || 'python';
const ZIP_NORMALIZER = path.resolve(__dirname, '..', 'tooling', 'normalize_pptx_zip.py');

const REQUIRED_FIELDS = [
  'schema_version',
  'request_id',
  'operation',
  'input_path',
  'output_path',
  'staging_root',
  'output_dir',
] as const;

function missingRequiredFields(value: Record<string, unknown>): string[] {
  return REQUIRED_FIELDS.filter((f) => {
    const v = value[f];
    return v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
  });
}

async function main(): Promise<number> {
  const requestPath = process.argv[2];
  if (!requestPath) {
    fatalEnvelope('REQUEST_PATH_MISSING', 2, { message: 'usage: node cli.js <request.json>' });
  }

  // 1) malformed JSON: classified adapter input failure. No response file can be
  //    safely written from unparseable content; do NOT fabricate a response path.
  let req: TemplateReuseRequest;
  try {
    req = JSON.parse(fs.readFileSync(requestPath, 'utf-8'));
  } catch (err: any) {
    fatalEnvelope('REQUEST_JSON_INVALID', 3, { message: err && err.message ? String(err.message) : String(err) });
  }

  // 2) response_path availability (must precede any response-file decision)
  const responsePath = req.response_path;
  if (typeof responsePath !== 'string' || responsePath.trim() === '') {
    fatalEnvelope('REQUEST_RESPONSE_PATH_INVALID', 4, { message: 'response_path missing or invalid' });
  }
  const safeWrite = (value: unknown): boolean => {
    try {
      writeResponse(responsePath, value);
      return true;
    } catch (err: any) {
      fatalEnvelope('REQUEST_RESPONSE_WRITE_FAILED', 5, { message: err && err.message ? String(err.message) : String(err) });
    }
  };

  // 3) parseable but incomplete request: structured REJECTED_POLICY response
  const missing = missingRequiredFields(req as unknown as Record<string, unknown>);
  if (missing.length > 0) {
    safeWrite(buildResponse({
      request_id: (req as { request_id?: string }).request_id,
      status: 'REJECTED_POLICY',
      errors: [`REQUEST_REQUIRED_FIELD_MISSING: ${missing.join(',')}`],
      evidence: { network_attempts: networkAttempts.slice() },
    }));
    return 0;
  }

  // 4) schema version gate
  if (req.schema_version !== 'academicppt.template-reuse/0.1.0-draft') {
    safeWrite(buildResponse({ request_id: req.request_id, status: 'FAILED', errors: ['SCHEMA_VERSION_MISMATCH'] }));
    return 0;
  }

  // 5) operation support gate (no upstream invocation)
  if (!SUPPORTED_OPERATIONS.includes(req.operation as any)) {
    safeWrite(buildResponse({
      request_id: req.request_id,
      status: 'UNSUPPORTED',
      unsupported_objects: [req.operation],
      errors: [`UNSUPPORTED_OPERATION: ${req.operation}`],
      evidence: { network_attempts: networkAttempts.slice() },
    }));
    return 0;
  }

  // 6) preflight
  const pf = preflight(req);
  if (!pf.ok) {
    safeWrite(buildResponse({
      request_id: req.request_id,
      status: 'REJECTED_POLICY',
      errors: pf.errors,
      evidence: { ...pf.evidence, network_attempts: networkAttempts.slice() },
    }));
    return 0;
  }

  // 7) execute
  const ex = await execute(req);
  if (!ex.ok) {
    safeWrite(buildResponse({
      request_id: req.request_id,
      status: 'FAILED',
      errors: ex.errors,
      evidence: { ...pf.evidence, ...ex.evidence, network_attempts: networkAttempts.slice() },
    }));
    return 0;
  }

  // 7b) 1B-3B5R2B deterministic ZIP normalization (only after execute success).
  //    Normalization failure is a structured FAILED with OUTPUT_NORMALIZATION_
  //    FAILURE; postflight is never reached, and the nondeterministic upstream
  //    artifact is best-effort removed so it cannot be presented as output.
  const normEvidence: Record<string, unknown> = {};
  try {
    execFileSync(PYTHON, [ZIP_NORMALIZER, req.output_path], { encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 });
    normEvidence.output_normalization = 'APPLIED';
    normEvidence.normalization_policy = 'ZIP_MEMBER_TIMESTAMP_1980_01_01';
  } catch (err: any) {
    const cleanupIssues: string[] = [];
    for (const p of [req.output_path, `${req.output_path}.normtmp`]) {
      try {
        if (fs.existsSync(p)) fs.unlinkSync(p);
      } catch {
        cleanupIssues.push(path.basename(p));
      }
    }
    const detail = err && err.message ? String(err.message) : String(err);
    const cleanupNote = cleanupIssues.length ? ` (cleanup failed for: ${cleanupIssues.join(',')})` : '';
    safeWrite(buildResponse({
      request_id: req.request_id,
      status: 'FAILED',
      errors: [`OUTPUT_NORMALIZATION_FAILURE: ${detail.slice(0, 200)}${cleanupNote}`],
      evidence: { ...pf.evidence, ...ex.evidence, output_normalization: 'FAILED', network_attempts: networkAttempts.slice() },
    }));
    return 0;
  }

  // 8) static postflight
  // Trusted pre-execution source evidence (captured by preflight BEFORE the
  // untrusted upstream boundary) is passed explicitly; the postflight must
  // not re-derive source truth from req.input_path afterwards.
  const po = postflight(req, ex.operation_manifest, pf.evidence);
  const status = po.ok ? (po.warnings.length ? 'SUCCEEDED_WITH_WARNINGS' : 'SUCCEEDED') : 'FAILED';
  const outHash = po.evidence.output_hash as string;
  const outSize = po.evidence.output_size as number;
  safeWrite(buildResponse({
    request_id: req.request_id,
    status,
    input_hash: pf.evidence.input_hash as string,
    input_size: pf.evidence.input_size as number,
    output_hash: outHash,
    output_size: outSize,
    operation_manifest: ex.operation_manifest,
    warnings: [...po.warnings],
    errors: po.errors,
    evidence: { ...pf.evidence, ...ex.evidence, ...po.evidence, ...normEvidence, network_attempts: networkAttempts.slice() },
  }));
  return 0;
}

function writeResponse(p: string, value: unknown): void {
  fs.writeFileSync(p, JSON.stringify(value, null, 2) + '\n', 'utf-8');
}

main()
  .then((code) => {
    console.log(JSON.stringify({ final_status: 'CLI_COMPLETED', exit_code: code }));
    process.exit(code);
  })
  .catch((err) => {
    // defense in depth: expected malformed-request/path cases are handled above;
    // reaching here is an UNEXPECTED INTERNAL FAILURE, not normal validation flow.
    console.error(JSON.stringify({
      final_status: 'UNEXPECTED_INTERNAL_FAILURE',
      exit_code: 9,
      detail: { message: err && err.message ? String(err.message) : String(err) },
    }));
    process.exit(9);
  });
