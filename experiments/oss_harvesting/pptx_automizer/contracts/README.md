# Frozen Contract — academicppt.template-reuse / 0.1.0-draft

Phase 1B-3A 冻结契约族。实现位于 `adapter/src/contracts.ts`。

## 支持的操作

- `COPY_SLIDE` — 复制完整源 slide（source_slide → APPEND）
- `COPY_ELEMENT` — 复制命名元素（element from element_source_slide → 追加的 target_base_slide 副本）

## 显式拒绝（UNSUPPORTED_OPERATION，不调用上游）

`REPLACE_TEXT` · `REPLACE_IMAGE` · `MODIFY_CHART_DATA` · `MODIFY_TABLE_DATA` · `SET_NOTES` · `GENERATE_ELEMENT` · 任意 XML/JS · OLE/media 操作

## 响应状态（权威安全子集）

`SUCCEEDED` · `SUCCEEDED_WITH_WARNINGS` · `REJECTED_POLICY` · `UNSUPPORTED` · `FAILED`

**禁止发射**：QUALIFIED / RELEASED / GOLD / FREEZE_PASS。

## Slide 身份映射

`FIX_SLIDE_01_TITLE=1` · `FIX_SLIDE_02_OBJECTS=2` · `FIX_SLIDE_03_DATA=3` · `FIX_SLIDE_04_NOTES_LINKS=4`

## 输入安全（任何变更前强制）

- 路径限定在 staging root 内（realpath + 无 symlink）
- 源为冻结 fixture 的新鲜副本（SHA/字节精确匹配）
- 输出路径不存在且限定在 output dir 内
- request_id 唯一
- 元素选择器恰好解析一次（COPY_ELEMENT）

## 安全预检（独立于 pptx-automizer）

VBA/OLE/ActiveX 缺席；外部关系 == 冻结白名单（`https://example.invalid/academicppt-owned-fixture`）。
