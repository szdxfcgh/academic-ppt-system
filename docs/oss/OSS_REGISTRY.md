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
| last_completed_gate | Phase 1B-3B6 |
| last_gate_status | `PPTX_AUTOMIZER_PHASE1B3B6_HARVEST_PASS_INTEGRATION_CANDIDATE` |
| capabilities demonstrated | COPY_SLIDE · COPY_ELEMENT |
| harvest_classification | HARVEST_PASS |
| integration_classification | INTEGRATION_CANDIDATE |
| authority_classification | TemplateReuseProvider candidate only |
| public_reproducibility | PARTIALLY_REPRODUCIBLE |
| experiment | `experiments/oss_harvesting/pptx_automizer/` |
| evidence | `evidence/oss_harvesting/pptx_automizer/` |
| notes | Phase 1B 收割完成；COPY_SLIDE/COPY_ELEMENT 已证据化；未 INTEGRATED；确定性输出仅对 pinned ZIP_STORED profile 合格；SmartArt 未证据化（deferred）；未做 PowerPoint/COM/渲染资质；公共可复现性 PARTIALLY_REPRODUCIBLE |

## 规则

- 状态仅允许：`EVALUATING` →（独立 Gate 后）→ `INTEGRATED`；不自动升级。
- 任何含敏感内容的检出物标记 `SENSITIVE_DO_NOT_IMPORT`，不复制真实值。
