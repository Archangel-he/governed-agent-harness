# ARCHITECTURE_GAPS

本文件只记录第一轮骨架中尚未可靠实现、或必须由具体部署/业务决定的内容。

## 第一轮已完成

- `AgentKernel` 统一契约和 `StatelessAgentKernel` 最小实现。
- DSH 风格 Session Event Log、恢复、中断收束、工具调用记录。
- 基础流式 chunk、assistant attempt 和有限 retry。
- Agent Registry、Inbox 去重、冷恢复入口。
- 每个 Plugin Seat 独立 Cordis Fiber。
- Session 到 Trajectory 的统一基础投影。
- 插件轨迹统计、失败发现和优化候选接入现有 Replay/Release。
- `src/examples/minimal-divergence.ts` 可直接运行，展示最小分化路径。
- JSONL 原子追加、generation 元数据、失效 writer lock 接管。

## 尚未完成

1. DSH 完整 assistant stream frame、usage、replayState、request header 和 waterfall 扩展点。
2. bwrap、Landlock、Seatbelt、Windows ACL 等 OS runner 的实际二进制接入；无 runner 时只做失败关闭。
3. 正式 Cordis workspace 依赖替换当前 npm 兼容层。
4. 完整 Team Lead 权限、独立 Agent 运行时启动/停止和跨进程 mailbox。
5. 生产级 SQLite/generation migration、跨进程租约和崩溃恢复验证。
6. Report、Proposal、Ack、Lease、轨迹聚类和候选发布门禁等 Agent Brick 专属治理协议。
7. 真实 Provider、Tool Schema Registry、Permission Gate、MCP、Skill 和 CLI Bridge。

## 参考基线

技术实现参考：DeepSeek Harness/Cordis。
当前核对源码：`C:\Users\123\deepseek-harness-current`，commit `c389f96bf3a9b6807cb71ed6bdad5849be0df6d8`。

## 2026-09-08 实现进度

已验证：
- `src/topology/schema.ts`：自由拓扑节点/边契约、重复 ID、入口和断边校验。
- `src/topology/compiler.ts`：确定性分阶段编译和数据边环检测。
- `src/plugins/contract.ts`：插件 manifest、上下文、结果、控制信号和事件发射契约。
- `src/runtime/topology-executor.ts`：阶段并行执行、节点事件、插件事件和失败事件统一输出。
- `src/services/artifact-store.ts`：本地 SHA-256 内容寻址 ArtifactStore。
- `src/examples/acceptance.ts`：Decision/Tool 两种拓扑验收通过。

仍未声称完成：完整 DSH 流式 waterfall、完整 Agent 级评估/候选回放发布、独立冷恢复 Agent Registry、OS 级 Sandbox、正式 Cordis workspace 依赖、跨进程持久化治理协议。这些仍按本文前面的缺口处理。

## 2026-09-08 第二轮实现进度

已验证：
- `src/trace/events.ts` 与 `src/trace/aggregator.ts`：稳定全局序号、操作聚合、重复事件拒绝、缺失终态保持 incomplete。
- `src/governance/agent-evaluator.ts`：跨插件 Agent 级成功率、操作数、插件数、失败数和完成度汇总。
- `src/services/version-store.ts`：不可变版本快照、active 指针原子写入、回滚。
- `src/governance/replay.ts` 与 `release.ts` 的已有 compare/release gate 已纳入当前验证链。
- `npm run verify`：21 个测试全部通过，Decision/Tool acceptance 通过。

当前仍需后续增强的仅包括 DSH/平台边界：完整 provider stream/waterfall 兼容、真实 OS 隔离 runner、正式 Cordis workspace 依赖、跨进程 Team/Registry、SQLite 迁移和真实外部 Provider/Tool/MCP 接入。单机实验版核心骨架已覆盖本阶段目标。

## 2026-09-08 第三轮实现进度

本轮已实现并验证：
- AgentLoop stream frame 的 `usage`、`replayState`、`requestHeader` 保留，并继续支持 retry waterfall。
- `PersistentAgentRegistry`：本地原子 JSON 状态、Agent 注册、Inbox 去重、冷启动恢复。
- `LocalSandboxAdapter`：允许网络全开时的真实子进程执行；路径边界仍强制检查；无 OS 网络隔离 runner 时继续失败关闭。
- 24 个测试、类型检查和 acceptance 全部通过。

因此原缺口 1 的本地兼容部分、缺口 4 的单进程冷恢复部分和缺口 2 的子进程执行部分已下沉到实现。仍未声称具备的是外部平台提供的真实网络/资源隔离、正式 Cordis workspace、跨进程 mailbox/lease、SQLite 迁移以及真实 Provider/Tool/MCP 接入。

