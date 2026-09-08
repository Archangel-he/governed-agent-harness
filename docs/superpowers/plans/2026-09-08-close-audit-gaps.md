# 六项实现缺口修复计划

本计划由用户“这些缺口一次性修了”授权。范围是单机实验产品完整运行链，不增加多租户和分布式平台。

## 验收与分工

1. 拓扑：按边输入、分支/汇合、有界循环、插件版本与 Schema 校验、取消和失败策略。负责 topology 子任务；以行为测试为证据。
2. 基础设施：Artifact/Version/Registry JSON 校验、不可变发布、锁与故障恢复，真实隔离 runner。负责 storage_sandbox 子任务；本地真实 runner 安全边界必须实测。
3. Loop 与恢复：参考 DSH 的流式/重试语义、Kernel 取消、独立 Session 冷恢复、消息去重、Lead 权限；清理演示级重复发布。负责 loop_recovery 子任务。
4. 统一运行链：一个 AgentVersion 通过 Cordis 绑定插件、执行拓扑、调用 Kernel、保存完整 Session/Trace/Artifact。主任务负责。
5. 综合治理：完整 Trace 重建、独立结果质量/成本/延迟/可靠性指标、硬门禁、基于相同用例的 Replay/Compare、绑定证据与版本的发布/回滚。主任务负责。
6. 验收：真实六节点 Decision/Tool Agent，经同一个运行和治理入口运行；覆盖失败、中断重开与未知副作用拒绝重放。全量检查、专项审查后更新缺口。

## 决策记录

- 在已整理的仓库继续，基线 cb4384e；不扩大为多租户或跨机器调度。
- 已执行 DSH fetch，origin/master 为 c389f96bf3a9b6807cb71ed6bdad5849be0df6d8。技术参考可核对本地当前源码。
- 原 24 项测试只作为回归基线；不得作为六项完整目标的验收替代。
- 临时实现报告保存在 .tmp/*-report.md；最终保留源码、可重跑测试和修正后的工程缺口。

## 状态

- [x] 拓扑语义与审查
- [x] 持久化/隔离与审查
- [x] Loop/Kernel/Registry 与审查
- [x] 统一运行及 Trace
- [x] 评估/候选/发布与回滚
- [x] 六步 Agent 端到端、恢复及全量验证
