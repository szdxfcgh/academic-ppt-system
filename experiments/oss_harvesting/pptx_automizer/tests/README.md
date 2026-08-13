# Tests — 验证说明（Phase 1B-3A）

Phase 1B-3A 是**最小 smoke**，不是全量回归（全量属 Phase 1B-3B，未授权）。

## 已执行验证（Phase 1B-3A 私有 Gate，结果见 evidence）

| 验证 | 结果 |
|---|---|
| TypeScript compile/typecheck | PASS |
| Python 工具 compile（py_compile） | PASS |
| 契约/静态验证（禁止状态词扫描等） | PASS |
| unsupported-operation 拒绝测试（REPLACE_TEXT） | UNSUPPORTED，无上游调用 |
| no-network 守卫 | network_attempts = [] |
| COPY_SLIDE smoke | SUCCEEDED_WITH_WARNINGS |
| COPY_ELEMENT smoke（OWNED_AUTOSHAPE_01） | SUCCEEDED_WITH_WARNINGS |
| 静态 postflight（部件/sldId 一致、无 VBA/OLE/ActiveX、外部关系白名单） | PASS |

## 在公开树复现（需要本地 pinned 上游 + 权利清晰的合成 fixture）

```bash
# 1) 编译 adapter
node <typescript>/bin/tsc -p experiments/oss_harvesting/pptx_automizer/adapter/tsconfig.json
# 2) 设置运行时与 fixture（本地，不提交）
export PPTX_AUTOMIZER_RUNTIME_ROOT=<pinned upstream clone>
# 3) 运行请求
node experiments/oss_harvesting/pptx_automizer/adapter/dist/cli.js <request.json>
```

**不启动**：PowerPoint / COM / M1 Worker / M1 qualification / Phase 1B-3B 全量矩阵。
