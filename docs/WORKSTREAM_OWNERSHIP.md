# Workstream Ownership

This document defines default file ownership for concurrent development tracks.

The governing invariant is:

> **ONE TRACK = ONE BRANCH = ONE WORKTREE**

Ownership is not capability authority. It only controls who may mutate a shared file at a given time.

## Default ownership

### M1 / PowerPoint qualification

Branch: `m1/fresh-qualification`

Primary ownership:

- PowerPoint execution and worker code
- qualification entrypoints and runtime
- M1 validators
- freeze-authority / binding / rollover machinery
- M1 qualification tests and qualification evidence code

### PPT Core

Branch: `ppt/core-development`

Primary ownership:

- Evidence Registry
- Planner / SlideScript
- Composition
- chart / diagram policy and product logic
- Academic QA
- Scorecard / scoring
- general public product architecture

### OSS capability integration

Branch pattern: `oss/<project>-<capability>`

Current branch: `oss/pptx-automizer-template-reuse`

Primary ownership:

- `experiments/oss_harvesting/<project>/`
- project-specific adapter / provider implementation under separately authorized paths
- OSS-specific harnesses and tests
- sanitized capability evidence
- upstream provenance / version / license records

## Shared files

Examples of shared files:

- `README.md`
- `CONTRIBUTING.md`
- dependency manifests
- common schemas
- common utilities
- public capability declarations
- cross-track architecture documents

Shared files must not be edited concurrently by two tracks.

### Temporary-owner protocol

When two tracks need the same shared file:

1. designate exactly one temporary owner;
2. the owner completes the authorized Gate;
3. the owner commits and pushes;
4. the second track updates/rebases to the accepted commit;
5. only then may the second track edit that file.

Do not resolve shared-file contention by allowing two writable checkouts to edit the same file independently.

## Review handoff

Any Gate that modifies files requiring architecture or decision review must end with:

`commit -> push -> STOP`

The executor reports:

```text
REPO:
BRANCH:
BASE_COMMIT:
COMMIT:
PR:
GATE_STATUS:
CHANGED_FILES:
TESTS:
KEY_EVIDENCE:
KNOWN_LIMITATIONS:
```

The reviewer inspects the exact GitHub commit, not only a pasted summary.

## Authority boundary

A branch, commit, pull request, or merge never by itself grants:

- `QUALIFIED`
- `CERTIFIED`
- `GOLD`
- `RELEASED`
- capability authority

Those states require their own evidence-backed Gate.