// Phase 1B-3A — one-shot isolated CLI entrypoint
// Phase 1B-3B1C-A — structured request failure hardening
// Usage: node dist/cli.js <request.json>
// Process boundary: file + JSON only; no imports from AcademicPPT production Core.
import * as fs from 'fs';
import * as http from 'http';
import * as https from 'https';
import * as net from 'net';
import * as dns from 'dns';
import * as path from 'path';
import { buildResponse, SUPPORTED_OPERATIONS, UNSUPPORTED_OPERATIONS, TemplateReuseRequest } from './contracts';
import { preflight } from './preflight';
import { execute } from './execute';
import { postflight } from './observe';

// Network exclusion: any attempt is recorded and rejected.
const networkAttempts: string[] = [];
function blockNetwork(name: string) {
  return function blocked(): never {
    networkAttempts.push(name);
    throw new Error(`Unexpected runtime network call: ${name}`);
  };
}
function blockProperty(target: unknown, name: string): void {
  const obj = target as Record<string, unknown>;
  try {
    Object.defineProperty(obj, name, { value: blockNetwork(name), configurable: true, writable: true });
  } catch {
    try { obj[name] = blockNetwork(name); } catch { /* record-only fallback */ }
  }
}
try {
  Object.defineProperty(globalThis, 'fetch', { value: blockNetwork('global.fetch'), configurable: true, writable: true });
} catch { /* ignore */ }
blockProperty(http, 'request');
blockProperty(http, 'get');
blockProperty(https, 'request');
blockProperty(https, 'get');
blockProperty(net, 'connect');
blockProperty(net, 'createConnection');
blockProperty(dns, 'lookup');
blockProperty(dns, 'resolve');

// Classified adapter input failures: stable machine-readable envelope + deterministic exit code.
function fatalEnvelope(kind: string, exitCode: number, detail?: unknown): never {
  console.error(JSON.stringify({ final_status: kind, exit_code: exitCode, detail: detail ?? null }));
  process.exit(exitCode);
}

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
    evidence: { ...pf.evidence, ...ex.evidence, ...po.evidence, network_attempts: networkAttempts.slice() },
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
