# Harness — one-shot isolated subprocess

过程边界（冻结 Phase 1A）：

```
调用方 → request.json + 文件 → 一次性隔离 node 子进程 (adapter/src/cli.ts)
       → TemplateReuseProvider → pptx-automizer 0.8.2 → candidate.pptx + response.json
```

File + JSON only；adapter 不 import 任何生产 Core。

## 调用方式

```bash
node adapter/dist/cli.js <request.json>
```

请求示例见 `harness/examples/`（路径为相对 workspace 的示意；实际运行按 preflight 契约解析）。

## 请求字段（0.1.0-draft）

`schema_version` · `request_id` · `operation` · `source_slide` · `element` / `element_source_slide` / `target_base_slide` · `input_path` · `output_path` · `staging_root` · `output_dir` · `response_path`

## 网络排除

cli 入口在运行时阻塞 http/https/net/dns/fetch 并记录尝试（响应 evidence.network_attempts）。Phase 1B-3A 实测 `network_attempts = []`。
