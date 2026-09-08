# 当前边界与验证结论

本项目是单机、少量开发者使用的实验基座。目标是让人定义 `AgentVersion` 和自由能力拓扑，运行时自动装配 Cordis seat、能力插件、Kernel、Session、Artifact 和治理轨迹；一个 Agent 的所有插件轨迹由同一个 Trace 和评估报告综合分析，再通过候选版本实验发布或回滚。

## 本轮已闭合的六项审查缺口

1. `GovernedAgentRuntime` 是统一入口。它冻结版本和输入，预检全部插件/绑定，创建 Cordis 上下文和 seat fiber，执行拓扑节点；Kernel 节点通过 `StatelessAgentKernel` 进入同一 Session/Trace。Lifecycle seat 也可按绑定接入并在 fiber dispose 时释放。
2. 拓扑按边传递数据，支持并行 fork、按 `when` 选择分支、join 输入、`continue/skip/stop/select/loop` 控制信号、节点有界循环、失败策略、输入输出 Schema 和插件版本预检。执行环必须用节点的有限 `loop` 表达；任意图环被拒绝。
3. Session 事件和拓扑事件都投影为可重建 `TraceEvent`。Aggregator 拒绝缺失 start、重复 terminal、错误依赖和终态后的事实。Agent 评估从事件重建完整性、可靠性、质量、安全、成本、延迟、重试和人工介入指标；Experiment 用相同输入回放 baseline/candidate，证据摘要绑定版本并在候选激活前持久化不可变 release evidence。
4. `src/examples/acceptance.ts` 运行六步 Decision 和六步 Tool Agent，覆盖统一运行、Kernel、工具、Trace、质量门禁、候选发布和回滚。另有进程被杀后的未知副作用恢复测试和全量 `npm run verify`。
5. Loop 支持 usage/replayState/request header、流式 tool delta 组装、完整帧检查、可取消 retry waterfall 和事件先持久化；Registry 支持独立 Agent Session、Inbox 去重、peek/ack、冷恢复和 Lead 管理；Artifact/Version/Registry/JSONL 均校验输入并使用原子写入及并发锁；Docker sandbox 真实执行网络、根文件系统、capability、CPU、内存、PID、输出、超时和取消限制。
6. 早期 `memory-runtime` 的发布入口委托统一 `releaseGate`；Kernel 的取消监听器和事件队列会清理；完成、失败、取消、未知外部效果都写入终态或中断证据。

## 有意保留的实验边界

- Docker 是本机实验 runner；只支持 `none` 和 `full`，`restricted` 明确失败关闭。没有为 Linux/Windows/macOS 分别实现 bwrap、Landlock、ACL 等另一套 runner。
- JSONL 是单机参考持久化。锁在并发争抢或不明确的 owner 状态下失败关闭；没有 SQLite、跨主机租约或多租户协议。
- 真实模型、MCP、Skill、外部 Tool 权限和网络 provider 仍由调用者作为插件提供；仓库只验证它们必须遵守的契约。
- 拓扑由人定义，运行时不会自行拆 Agent 或自行改写插件拓扑。迟到的插件事实会以 `harness/late` 记录在 Session，不伪造已结束 operation 的 Trace 终态。

## 参考与验收

实现参考为当前 DeepSeek Harness `c389f96bf3a9b6807cb71ed6bdad5849be0df6d8` 和 Cordis。运行：

```text
npm run check
npm test
npm run acceptance
npm run verify
```

当前验收包含 57+ 个测试（其中 Docker 测试使用本机 Docker daemon），实际数量以 `npm test` 输出为准。
