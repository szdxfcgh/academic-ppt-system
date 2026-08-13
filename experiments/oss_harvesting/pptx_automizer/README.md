# pptx-automizer Template Reuse — Experiment

**Status: EXPERIMENTAL / EVALUATING** — 本目录是 OSS capability harvesting 的最小隔离实验成果（Phase 1B-3A），**不是**集成层、**不宣称** INTEGRATED / PRODUCTION_READY / QUALIFIED / CERTIFIED。

## 本实验内容

- `adapter/` — 最小 TemplateReuseProvider（`academicppt.template-reuse/0.1.0-draft` 契约）：
  - `src/contracts.ts` — 契约类型、状态机、slide 身份映射
  - `src/preflight.ts` — 输入安全 + 安全预检（独立于 pptx-automizer）
  - `src/execute.ts` — 到 pinned pptx-automizer 的翻译（COPY_SLIDE / COPY_ELEMENT）
  - `src/observe.ts` — 输出静态 postflight
  - `src/cli.ts` — 一次性隔离子进程入口（file + JSON only，网络全阻塞）
- `tooling/observe_pptx.py` — 独立 OPC/OOXML 观察器（纯 stdlib）
- `adapter/tooling/inspect_shapes.py` — 形状名/外部关系检查器（纯 stdlib）
- `contracts/` — 冻结契约说明
- `harness/` — 请求示例与调用方式
- `tests/` — 验证说明（TS compile / 拒绝测试 / smoke 复现）
- `fixture_generator/` — 冻结 fixture 契约与 SHA（生成器源码来自另一 Gate，未随本迁移发布）

## 运行时（不 vendored）

按 `docs/OSS_POLICY.md`：`UPSTREAM OSS + PINNED VERSION/COMMIT + OUR ADAPTER`。

- 上游：**pptx-automizer 0.8.2**（MIT，https://github.com/singerla/pptx-automizer），pinned revision `439350427b0f4951ee9e1e42ce97aba9e77356df`
- 隔离 pptxgenjs：3.12.0（上游依赖树）
- 本地运行需将 pinned 上游 clone 放到 `<experiment-root>/upstream/pptx-automizer`，或用环境变量 `PPTX_AUTOMIZER_RUNTIME_ROOT` 指向它
- 上游源码永不提交（见 OSS_POLICY）

## 已验证能力（Phase 1B-3A smoke）

| 操作 | 结果 |
|---|---|
| COPY_SLIDE | SUCCEEDED_WITH_WARNINGS（警告为 observer 基线计数注记） |
| COPY_ELEMENT（OWNED_AUTOSHAPE_01） | SUCCEEDED_WITH_WARNINGS（同上） |
| REPLACE_TEXT 等 6 类操作 | 显式 UNSUPPORTED（不调用上游） |

详见 `evidence/oss_harvesting/pptx_automizer/SUMMARY.md` 与 `RESULT.json`。
