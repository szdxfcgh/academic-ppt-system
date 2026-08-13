# Fixture Generator — 契约与身份（不发布二进制）

冻结 fixture：**APPT_TRP_FIXTURE_CORE_V1_1**（权利清晰合成夹具）。

## 身份

| 项 | 值 |
|---|---|
| artifact | rights_clear_template_reuse_core_v1_1.pptx |
| SHA-256 | `8833B36A6C922C222B729E362701F4795E39707DF7EBAAAD892F4DF44FDEF243` |
| bytes | 85,077 |
| 结构 | 4 slides / 1 master / 2 layouts / 1 theme / 4 notes |
| 对象 | OWNED_TEXTBOX_01 · OWNED_AUTOSHAPE_01 · OWNED_IMAGE_01 · OWNED_SVG_01 · OWNED_CHART_01 · OWNED_TABLE_01 · OWNED_LINK_EXTERNAL_01 · OWNED_LINK_INTERNAL_01 |
| 媒体 | 真实 PNG（640×360，crop srcRect）· 真实 SVG + PNG fallback · 内嵌 Excel workbook · 原生 chart/table |
| 外链 | `https://example.invalid/academicppt-owned-fixture`（允许列表内保留域名） |

## 政策

- **FIXTURE_BINARY_PUBLISHED = false**：二进制 PPTX 不随本迁移发布（按 OSS_POLICY 与 §8 偏好：发布生成器源码/契约/SHA/provenance，而非二进制）。
- 生成器源码（PptxGenJS 3.12 作者脚本）产生于另一 Gate（Phase 1B-2R2），其迁移不在本 Gate 范围；本目录保留契约与身份记录。
- 适配器通过上述 SHA/字节精确校验输入副本（见 `adapter/src/preflight.ts`）。
