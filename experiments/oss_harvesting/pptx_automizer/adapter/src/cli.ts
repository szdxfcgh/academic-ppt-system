// Phase 1B-3A — one-shot isolated CLI entrypoint
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

async function main(): Promise<number> {
  const requestPath = process.argv[2];
  if (!requestPath) {
    console.error('usage: node cli.js <request.json>');
    return 2;
  }
  const req: TemplateReuseRequest = JSON.parse(fs.readFileSync(requestPath, 'utf-8'));
  const responsePath = req.response_path;

  // 1) schema version gate
  if (req.schema_version !== 'academicppt.template-reuse/0.1.0-draft') {
    writeResponse(responsePath, buildResponse({ request_id: req.request_id, status: 'FAILED', errors: ['SCHEMA_VERSION_MISMATCH'] }));
    return 0;
  }

  // 2) operation support gate (no upstream invocation)
  if (!SUPPORTED_OPERATIONS.includes(req.operation as any)) {
    const unsupported = UNSUPPORTED_OPERATIONS.includes(req.operation) ? [req.operation] : [req.operation];
    writeResponse(responsePath, buildResponse({
      request_id: req.request_id,
      status: 'UNSUPPORTED',
      unsupported_objects: unsupported,
      errors: [`UNSUPPORTED_OPERATION: ${req.operation}`],
      evidence: { network_attempts: networkAttempts.slice() },
    }));
    return 0;
  }

  // 3) preflight
  const pf = preflight(req);
  if (!pf.ok) {
    writeResponse(responsePath, buildResponse({
      request_id: req.request_id,
      status: 'REJECTED_POLICY',
      errors: pf.errors,
      evidence: { ...pf.evidence, network_attempts: networkAttempts.slice() },
    }));
    return 0;
  }

  // 4) execute
  const ex = await execute(req);
  if (!ex.ok) {
    writeResponse(responsePath, buildResponse({
      request_id: req.request_id,
      status: 'FAILED',
      errors: ex.errors,
      evidence: { ...pf.evidence, ...ex.evidence, network_attempts: networkAttempts.slice() },
    }));
    return 0;
  }

  // 5) static postflight
  const po = postflight(req, ex.operation_manifest);
  const status = po.ok ? (po.warnings.length ? 'SUCCEEDED_WITH_WARNINGS' : 'SUCCEEDED') : 'FAILED';
  const outHash = po.evidence.output_hash as string;
  const outSize = po.evidence.output_size as number;
  writeResponse(responsePath, buildResponse({
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
    console.error('CLI_FATAL:', err && err.message ? err.message : String(err));
    process.exit(1);
  });
