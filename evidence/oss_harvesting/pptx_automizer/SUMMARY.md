# OSS Harvesting — pptx-automizer Phase 1B-3A Summary

## 测试内容

最小 TemplateReuseProvider（`academicppt.template-reuse/0.1.0-draft`）对冻结权利清晰合成夹具 `APPT_TRP_FIXTURE_CORE_V1_1` 的两个操作 smoke：

- **COPY_SLIDE**：复制 FIX_SLIDE_02_OBJECTS → APPEND（输出 5 页，复制页为第 5 页）
- **COPY_ELEMENT**：把 OWNED_AUTOSHAPE_01 从 slide 2 复制到追加的 FIX_SLIDE_01_TITLE 副本（目标 slide5.xml 上恰好 1 个）

## 通过项

- 两个操作均 **SUCCEEDED_WITH_WARNINGS**（errors=[]）
- 预检：源副本 SHA/字节精确匹配；选择器恰好解析一次；VBA/OLE/ActiveX 缺席；外部关系仅白名单
- postflight：slide 部件数 == sldId 数（5==5）；COPY_ELEMENT 目标身份 matches=1
- 网络调用 = 0（全阻塞并记录）；PowerPoint/COM = 0；M1 未调用
- 6 类未授权操作显式 UNSUPPORTED（不调用上游）

## 为什么 SUCCEEDED_WITH_WARNINGS

警告仅来自独立观察器的 **fixture 基线计数注记**：观察器的 `slide_count_expected=4` 是冻结夹具的基线假设；输出合法地含 5 页（4 根 + 1 追加），因此观察器对 5 页输出报告基线语义的"非 PASS"。

- 替代检查（内部一致性）：**slide 部件数 == presentation sldId 数 = 5** —— PASS。
- COPY_ELEMENT 选择器/postflight 身份 —— PASS。

## 当前局限

- 仅验证 COPY_SLIDE 与 COPY_ELEMENT；image/SVG/chart/table/SmartArt/notes/hyperlink 元素复制**未测试**（后续 Gate）
- 无三次确定性回归（Phase 1B-3B，未授权）
- 无全量操作矩阵
- 适配器路径为实验级；未进入 `integrations/`

## 为什么仍是 EXPERIMENTAL

Phase 1B-3A 只证明最小隔离 harvesting adapter 可用。完整 Phase 1B-3B 回归未授权/未完成；因此不宣称 INTEGRATED / PRODUCTION_READY / QUALIFIED / CERTIFIED。
