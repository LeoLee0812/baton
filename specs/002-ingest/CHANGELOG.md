# 变更日志

> 规格发现有误要调整时，⛔ 不许直接改字覆盖原文，必须在此追加一条。
> 每条变更必须早于对应代码 commit。

## [2026-07-31 01:38] 测试读 fixture 的方式修正

- 原写法：`readFileSync(...).buffer as ArrayBuffer`
- 改为：`b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)`
- 原因：Node 的 Buffer 来自共享内存池，`.buffer` 往往远大于文件本身，
  pdf.js 走 structured clone 时报 `DataCloneError: Cannot transfer object of unsupported type`
- 性质：测试自身的写法错误，与被测逻辑无关
