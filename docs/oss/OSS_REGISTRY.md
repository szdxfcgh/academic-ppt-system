# OSS Registry

OSS Capability Harvesting 注册表。默认模式：`UPSTREAM OSS + PINNED VERSION/COMMIT + OUR ADAPTER`（见 `docs/OSS_POLICY.md`）。

## pptx-automizer

| 字段 | 值 |
|---|---|
| upstream | https://github.com/singerla/pptx-automizer |
| version | 0.8.2 |
| pinned commit | `439350427b0f4951ee9e1e42ce97aba9e77356df` |
| license | MIT |
| **status** | **EVALUATING** |
| last_completed_gate | Phase 1B-3A |
| last_gate_status | `PPTX_AUTOMIZER_PHASE1B3A_MINIMAL_ADAPTER_IMPLEMENTED` |
| capabilities demonstrated | COPY_SLIDE · COPY_ELEMENT |
| experiment | `experiments/oss_harvesting/pptx_automizer/` |
| evidence | `evidence/oss_harvesting/pptx_automizer/` |
| notes | 未标记 INTEGRATED；Phase 1B-3B 全量回归未授权；fixture 二进制未发布（仅契约/SHA/provenance） |

## 规则

- 状态仅允许：`EVALUATING` →（独立 Gate 后）→ `INTEGRATED`；不自动升级。
- 任何含敏感内容的检出物标记 `SENSITIVE_DO_NOT_IMPORT`，不复制真实值。
