# Workstream Model

长期治理规则：**ONE TRACK = ONE BRANCH = ONE WORKTREE**。

## 正式轨道

| Track | Branch | 用途 |
|---|---|---|
| main | `main` | accepted integration baseline（已接受集成基线） |
| M1 / PowerPoint qualification | `m1/fresh-qualification` | M1 / PowerPoint 资格认证 |
| PPT Core | `ppt/core-development` | PPT 产品/核心引擎 |
| OSS pptx-automizer template-reuse | `oss/pptx-automizer-template-reuse` | 当前 pptx-automizer 能力采集 |

未来 OSS 轨道命名约定：`oss/<project>-<capability>`。

## 规则

1. **禁止多个 Agent 共用一个 writable checkout。** 每个轨道有且仅有一个专属 worktree。
2. 若两个轨道需要修改同一 shared file：
   1. 指定 temporary owner；
   2. owner 修改并 `commit`；
   3. `push`；
   4. 第二轨 `pull`/更新到新 commit；
   5. 第二轨才允许继续修改。

## GitHub Review Contract

凡一个 Gate 修改了需要决策端审查的代码：

```
Gate → commit → push → STOP
```

执行端必须回报（精确到 GitHub commit）：

```
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

评审方直接审查 GitHub 上的 exact commit。
