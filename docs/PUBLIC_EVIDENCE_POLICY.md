# Public Evidence Policy

This repository is public. Engineering evidence must be reviewable without publishing unnecessary local, private, or sensitive runtime material.

## Public / sanitized evidence

The following may be committed when rights and privacy checks pass:

- compact deterministic machine results
- test summaries
- capability matrices
- architecture decisions
- sanitized qualification summaries
- OSS provenance, pinned revisions, and license metadata
- small rights-clear synthetic fixtures and their hashes
- adapter / harness / contract source needed for review

Preferred locations:

- `evidence/`
- `experiments/oss_harvesting/`
- `fixtures/synthetic/`

## Local / private evidence

Do not commit by default:

- raw `work/` directories
- raw `reports/` directories
- stdout / stderr dumps
- large runtime logs
- PID / HWND / process dumps
- absolute local paths when not required for reproducibility
- credentials, cookies, tokens, keys, certificates
- private/user documents
- university/corporate templates without redistribution permission
- large generated PNG/PDF/PPTX artifacts unless explicitly approved
- temporary Office files
- model weights or private datasets

These remain local or are distributed separately only after an explicit review decision.

## OSS harvesting evidence

OSS harvesting is a first-class workflow, but public evidence must be curated.

Publicly reviewable artifacts may include:

- adapter source
- versioned contracts
- deterministic harnesses/tests
- fixture generators
- sanitized `RESULT.json` / `SUMMARY.md`
- upstream repository, revision, version, and license metadata

Do not mirror whole upstream repositories by default. Prefer:

`PINNED UPSTREAM + OUR ADAPTER`

## Fixture policy

A fixture may enter `fixtures/synthetic/` only when its redistribution status is explicit.

For each public fixture record:

- origin
- generation method
- rights status
- SHA-256
- purpose

Private/user/university/corporate fixtures are never public by default.

## Qualification evidence

Public summaries may state exactly what a Gate proved.

Do not promote a result beyond its evidence. In particular, a smoke test, branch merge, or generated PPTX does not itself establish `QUALIFIED`, `CERTIFIED`, `GOLD`, `RELEASED`, or PowerPoint compatibility.

## Review rule

If a reviewer needs evidence too large or sensitive for Git history, provide it through a separately approved artifact channel rather than committing raw runtime output to the repository.