# 代码导航

本文描述当前源码组织。产品目标见 [架构规范](GOVERNED_AGENT_HARNESS_SPEC.md)，未完成部分见 [工程缺口](ARCHITECTURE_GAPS.md)。

## 模块归属

| 模块 | 负责什么 |
| --- | --- |
| `contracts` | AgentVersion、服务接口、模型/工具协议、Kernel 输入输出、Artifact 和 Registry 数据 |
| `plugins/capability.ts` | `CapabilityPlugin.invoke` 和 `CapabilityContext`，供拓扑节点执行 |
| `plugins/lifecycle.ts` | `LifecyclePlugin.activate/dispose` 与 `LifecycleContext`，供 Host 管理 |
| `plugins/validate-binding.ts` | 插件座和实现的契约/能力匹配检查 |
| `topology` | 描述、校验、编译和执行节点图 |
| `runtime` | Loop、Host、活跃 Agent 注册、执行恢复、AgentVersion 绑定校验 |
| `runtime/kernel` | 将一次 AgentLoop 调用封装为 Kernel 结果 |
| `trace` | AgentTrace 聚合、Session 事件投影为 Trajectory |
| `governance` | 基础统计、分析、回放比较、发布评分门禁 |
| `services` | Session/Workspace/Trajectory、Artifact、版本、Registry 快照等数据服务及 Gateway |
| `sandbox` | 工作目录校验与子进程执行，尚未实现 OS 级安全隔离 |
| `team` | 消息确认、任务 CAS、Team 事件存储，不自动创建独立 AgentLoop |

共享契约使用明确文件导入；`contracts/index.ts` 只汇出契约。具体实现放在所属模块，不能通过契约入口反向导入实现。ArtifactRef 在 `contracts/artifact.ts` 中只有一份定义。

## 三条现有运行路径

### 单次推理

`examples/minimal-divergence.ts` → `runtime/kernel/stateless.ts` → `runtime/agent-loop.ts` → 注入的 Model/Tool Provider。

AgentLoop 写 Session 事件，通过 `trace/session-projector.ts` 投影部分模型/工具事件到 Trajectory。Kernel 使用每次调用内的内存 Store，返回事件与轨迹。Kernel 是 Loop 的适配器，目前尚未注册为能力插件。

### 拓扑实验

`examples/acceptance.ts` → `topology/executor.ts` → `topology/compiler.ts` / `schema.ts` → `plugins/capability.ts`。

示例收集节点事件，再交给 `trace/aggregator.ts`。当前编译器按依赖分阶段，执行器将上一阶段输出作为下一阶段输入；尚未实现完整的按边数据路由、分支选择和有界循环。事件汇总不会自动执行评估或发布。

### 生命周期与集成冒烟

`examples/integration-check.ts` → `runtime/cordis-host.ts` 的 `CordisPluginHost` → `LifecyclePlugin`。这里使用真实 Cordis；`runtime/local-host.ts` 的 `LocalPluginHost` 是不依赖 Cordis 的本地顺序 Host。

`runtime/memory-runtime.ts` 的 `InMemoryAgentRuntime` 保留早期演示逻辑，只由 `examples/demo.ts` 使用。它不是上述运行路径的统一入口，也不替代 `governance/release.ts`。

## Registry、版本与恢复的边界

- `runtime/agent-registry.ts` 持有实际 AgentLoop，注册时调用 `resume()`。
- `services/registry-store.ts` 的 `AgentRegistryStore` 只保存元数据与 Inbox 快照，不负责重建 Loop。
- `runtime/validate-version.ts` 验证插件座绑定；`services/version-store.ts` 保存拓扑版本和 active 指针。两者还不是统一的发布流程。
- `runtime/recovery.ts` 是执行状态转换辅助；AgentLoop 的中断收束在 `runtime/agent-loop.ts` 内。

## 修改入口

- 细化一个能力：从 `plugins/capability.ts` 和 `topology/schema.ts` 开始。
- 修改模型/工具协议：修改 `contracts/loop.ts`，再检查 `runtime/agent-loop.ts`。
- 修改 Kernel 输入输出：修改 `contracts/kernel.ts` 和 `runtime/kernel/stateless.ts`。
- 修改轨迹：先区分 `contracts/domain.ts` 的 TrajectoryEvent 与 `trace/events.ts` 的 TraceEvent；二者尚未完全统一。
- 修改 Agent/Cluster 统计：分别查看 `governance/agent-evaluator.ts`、`cluster-evaluator.ts`；分析、回放、门禁在同一目录。
- 修改持久化：从 `services` 或 `team/team.ts` 对应实现开始。

## 本次路径和名称变更

| 原位置/名称 | 现在 |
| --- | --- |
| `src/contracts.ts` | `src/contracts/domain.ts` |
| `src/kernel/contracts.ts` | `src/contracts/kernel.ts` |
| `src/kernel/stateless.ts` | `src/runtime/kernel/stateless.ts` |
| `src/runtime/index.ts` | `src/runtime/memory-runtime.ts` |
| `src/runtime/topology-executor.ts` | `src/topology/executor.ts` |
| `src/runtime/trajectory-projector.ts` | `src/trace/session-projector.ts` |
| `src/runtime/validate.ts` | `src/plugins/validate-binding.ts` |
| `src/runtime/version.ts` | `src/runtime/validate-version.ts` |
| `src/plugins/contract.ts` | `src/plugins/capability.ts` |
| 两个同名 `AgentPlugin` / `PluginContext` | `CapabilityPlugin` / `CapabilityContext` 与 `LifecyclePlugin` / `LifecycleContext` |
| `CordisHost`（没有 Cordis） | `LocalPluginHost`，位于 `runtime/local-host.ts` |
| `ProductionCordisHost` | `CordisPluginHost`，位于 `runtime/cordis-host.ts` |
| `PersistentAgentRegistry` | `AgentRegistryStore`，位于 `services/registry-store.ts` |
| `src/governance/evaluator.ts` | `src/governance/cluster-evaluator.ts` |
| `src/examples/production-check.ts` | `src/examples/integration-check.ts` |

这是源码内路径调整，仓库没有已发布的 npm API。旧 npm 命令仍保留，源码消费者需按上表更新导入。
