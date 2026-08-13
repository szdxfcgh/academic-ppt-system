# OSS Policy

OSS Capability Harvesting 是正式开发工作流。

## 默认模式

```
UPSTREAM OSS
+ PINNED VERSION / COMMIT
+ OUR ADAPTER
```

不默认复制整个第三方源码；上游以 pinned revision 方式引用，适配层由我们维护。

## 在 Public GitHub 中保留

- adapter
- contract
- harness
- tests
- fixture generator
- sanitized RESULT / SUMMARY / provenance

## 不保留（仅本地/忽略）

- raw work
- stdout / stderr
- 大日志
- node_modules
- 临时 PPTX
- 大量 PNG / PDF
- process dumps
- 用户文件

## 安全

- 任何含 ACCESS_KEY / PASSWORD / TOKEN / SECRET / credentials / private key 的检出物标记 `SENSITIVE_DO_NOT_IMPORT`；不解压查看真实值，不复制原包。
- 上游 pinned 源码不得被修改；我们的改动一律位于 adapter 层。
