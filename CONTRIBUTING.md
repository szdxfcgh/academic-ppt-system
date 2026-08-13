# Contributing

Academic PPT System 采用 **Gate 驱动的开发流程**。

## 工作流

1. 每个正式工作流轨道（见 `docs/WORKSTREAM_MODEL.md`）使用**独立分支 + 独立 worktree**。
2. 每个 Gate 完成其授权范围后：`commit → push → STOP`。
3. 涉及决策端审查的 Gate 必须回报审查契约字段（见 WORKSTREAM_MODEL.md §GitHub Review Contract）。
4. 未获授权的变更、状态宣称（QUALIFIED / CERTIFIED / GOLD / RELEASED）一律禁止。

## 提交要求

- 提交信息遵循仓库既有约定（`<scope>: <summary>`）。
- 只提交 Gate 授权范围内的文件。
- 不提交：密钥、用户文件、`work/`、`reports/`、`node_modules/`、大型 runtime artifacts（见 `.gitignore`）。
