# Issues、History 与冲突

Issues、History 和 revision conflict 处理的是同一条作者变更链的不同阶段：发现问题、回放本地意图，以及协调并发 revision。

## Issues

Issues 聚合多个 provider 的 revision-bound diagnostic snapshot，并负责去重、筛选和呈现。常见 provider 包括 Workspace、PIR、Route、Semantic、Code、NodeGraph、Animation、Plugin、Compiler 和 API。

按 `Alt+0` 打开 Issues。选择诊断后可以查看 target、provider、severity 和相关 operation，并在支持时打开目标、打开文档或执行 Quick Fix。

Quick Fix 不是直接改 UI state。它必须生成可逆 Command/Transaction，并走与普通作者操作相同的 outbox/commit 路径。

## History

History 保存已在本地通过校验的可逆作者操作：

- `Ctrl/Cmd+Z`：撤销
- `Ctrl/Cmd+Shift+Z`：重做
- `Ctrl+Y`：Windows/Linux 重做

Command 表达一个领域动作；Transaction 原子组合多个 Command/Patch。History 不负责远端 revision 协调，Sync 也不应该重新解释用户意图。

## Revision conflict

当本地 operation 的 base revision 已落后于 canonical remote revision，同步层会返回结构化 conflict envelope。系统对 base、local 与 remote 进行语义分析，而不是直接用“最后写入者获胜”。

差异颜色固定为：

| 颜色 | 含义         |
| ---- | ------------ |
| 绿色 | 新增         |
| 红色 | 删除         |
| 黄色 | 本地冲突版本 |
| 紫色 | 远端冲突版本 |

Code diff 按文本 hunk 选择本地或远端；NodeGraph diff 按节点、边和字段展示。解决结果会形成新的 resolution operation，并以最新 remote revision 为前提重新提交。

## 安全处理顺序

1. 确认冲突属于哪个文档和 base revision。
2. 查看 local/remote 对同一语义实体的修改。
3. 对每个冲突 hunk 或实体选择结果。
4. 重新校验完整 Workspace，而不只校验可见面板。
5. 提交新的原子 operation。

如果最新 revision 再次变化，应重新分析；不能把旧 resolution 强行覆盖到新状态。
