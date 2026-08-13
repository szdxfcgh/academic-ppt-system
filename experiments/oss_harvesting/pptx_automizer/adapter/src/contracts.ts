// Phase 1B-3A TemplateReuseProvider — frozen draft contracts
// academicppt.template-reuse / 0.1.0-draft — COPY_SLIDE + COPY_ELEMENT only.

export const SCHEMA_VERSION = 'academicppt.template-reuse/0.1.0-draft';

export const FIXTURE_ID = 'APPT_TRP_FIXTURE_CORE_V1_1';
export const FIXTURE_FILENAME = 'rights_clear_template_reuse_core_v1_1.pptx';
export const FIXTURE_SHA256 =
  '8833B36A6C922C222B729E362701F4795E39707DF7EBAAAD892F4DF44FDEF243';
export const FIXTURE_BYTES = 85077;

export const UPSTREAM_IDENTITY = {
  name: 'pptx-automizer',
  version: '0.8.2',
  revision: '439350427b0f4951ee9e1e42ce97aba9e77356df',
  isolated_pptxgenjs: '3.12.0',
};

export const SLIDE_IDENTITY: Record<string, number> = {
  FIX_SLIDE_01_TITLE: 1,
  FIX_SLIDE_02_OBJECTS: 2,
  FIX_SLIDE_03_DATA: 3,
  FIX_SLIDE_04_NOTES_LINKS: 4,
};

export const SUPPORTED_OPERATIONS = ['COPY_SLIDE', 'COPY_ELEMENT'] as const;
export const UNSUPPORTED_OPERATIONS = [
  'REPLACE_TEXT',
  'REPLACE_IMAGE',
  'MODIFY_CHART_DATA',
  'MODIFY_TABLE_DATA',
  'SET_NOTES',
  'GENERATE_ELEMENT',
];

export type ResponseStatus =
  | 'SUCCEEDED'
  | 'SUCCEEDED_WITH_WARNINGS'
  | 'REJECTED_POLICY'
  | 'UNSUPPORTED'
  | 'FAILED';

export interface TemplateReuseRequest {
  schema_version: string;
  request_id: string;
  operation: string;
  source_slide?: string | number;
  element?: string;
  element_source_slide?: string | number;
  target_base_slide?: string | number;
  input_path: string;
  output_path: string;
  staging_root: string;
  output_dir: string;
  response_path: string;
}

export interface OperationManifest {
  operation_id: string;
  operation: string;
  source_slide_identity: string | number | null;
  target_slide_identity: string | number | null;
  action: string;
  element: string | null;
  warnings: string[];
}

export interface TemplateReuseResponse {
  schema_version: string;
  request_id: string;
  status: ResponseStatus;
  upstream: typeof UPSTREAM_IDENTITY;
  input_hash: string | null;
  input_size: number | null;
  output_hash: string | null;
  output_size: number | null;
  operation_manifest: OperationManifest | null;
  warnings: string[];
  unsupported_objects: string[];
  errors: string[];
  evidence: Record<string, unknown>;
}

export function resolveSlideId(ref: string | number | undefined): number | null {
  if (ref === undefined || ref === null) return null;
  if (typeof ref === 'number') return ref;
  const hit = SLIDE_IDENTITY[ref];
  return hit === undefined ? null : hit;
}

export function buildResponse(partial: Partial<TemplateReuseResponse>): TemplateReuseResponse {
  return {
    schema_version: SCHEMA_VERSION,
    request_id: partial.request_id || 'unknown',
    status: partial.status || 'FAILED',
    upstream: UPSTREAM_IDENTITY,
    input_hash: partial.input_hash ?? null,
    input_size: partial.input_size ?? null,
    output_hash: partial.output_hash ?? null,
    output_size: partial.output_size ?? null,
    operation_manifest: partial.operation_manifest ?? null,
    warnings: partial.warnings || [],
    unsupported_objects: partial.unsupported_objects || [],
    errors: partial.errors || [],
    evidence: partial.evidence || {},
  };
}
