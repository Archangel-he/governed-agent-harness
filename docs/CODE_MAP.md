# 代码导航

## 完整产品路径

`templates/*.ts` → `agent.ts / assembleAgent` → `runtime/governed-runtime.ts` → Cordis seat Fiber → `topology/executor.ts` → CapabilityPlugin。

拓扑中的 Kernel 节点由同一运行时装配，进入 `runtime/kernel/stateless.ts` → `runtime/agent-loop.ts`。模型请求、工具调用、节点输入输出、Wiki 读取统一进入持久 Session 和 Trace。运行预检早于 request/start，生命周期实例仅创建一次并最终释放。

团队路径：`team/hierarchy.ts` 持久化角色定义和任务 → 同一个 `GovernedAgentRuntime.run(AgentVersion)`。协调能力是普通插件，负责提出派发与验收决定；Hierarchy 检查直系权限、原始执行证据和逐级验收状态。原有 `AgentRegistry` 的 Loop 接口保留兼容，新团队不会绕开拓扑执行。

## 文件与职责

| 文件／目录 | 职责 |
| --- | --- |
| `agent.ts` | 模板装配、固定记忆、版本化评价包、运行、评估、候选比较 |
| `templates/text-agent.ts` | 可复制的 Agent 定义；用新文件分化 Agent |
| `contracts` | AgentVersion、模型／工具、Kernel 和服务数据契约 |
| `plugins` | 能力调用和生命周期契约、插件座绑定校验 |
| `topology` | 静态编译、按边输入、fork/join、条件分支、有界节点循环、重试 |
| `runtime/governed-runtime.ts` | 完整 Agent 唯一执行入口、预检、Cordis 生命周期、请求去重和收束 |
| `runtime/evidence-source.ts` | 从指定 Agent Session 重建来源，校验请求摘要与轨迹终态摘要 |
| `runtime/agent-loop.ts` | 流式模型、工具流水线、retry waterfall、取消和 Session 重建 |
| `trace` | 严格 operation 状态机，统一 Session 投影 |
| `governance/evaluation.ts` | 全 Agent 门禁；尝试失败、最终失败和未知副作用分别计量  |`n| `governance/evaluation-package.ts` | Evaluator、Dataset、Gates 的版本化契约和 digest |
| `governance/attribution.ts` | 依赖＋实际输入输出形成假设，单节点对照干预验证 |
| `governance/experiment.ts` | 来源事件核验、成对实验、评估器锁定、发布前重验与 CAS |
| `memory/wiki.ts` | 不可变来源、提案、CAS 发布、版本页面、索引、链接检查 |
| `team/hierarchy.ts` | Supreme／Leader／Member，任务队列、报告、回执、验收、冷恢复和范围记忆 |
| `services` | Session、Artifact、Version、Registry、工作区与本机原子文件／锁 |
| `sandbox/adapter.ts` | Docker 隔离执行；本轮沿用现有实现 |
| `examples/*acceptance.ts` | 六步 Agent、模板治理闭环、双团队验收 |

## 证据链

`harness/request` 固定版本／输入／环境／记忆 → `harness/trace` 写入所有操作事实 → `harness/seal` 保存终态轨迹摘要 → `RuntimeEvidenceSourceResolver` 读取并验证 → Experiment 固定来源和每个试验 → 发布时重新解析来源、重算评估器结果和门禁 → 不可变 release evidence → active 指针 CAS。

Wiki 的 `wiki.json` 是原子提交的权威索引；`releases/<id>/pages/*.md`、`index.md`、`log.md` 是可查看的发布投影。执行记录固定 release 和完整页内容摘要，试验两边不允许记忆漂移。

## 保留的低层示例

`demo`、`skeleton`、`integration`、`minimal` 展示各低层接口，继续兼容。`runtime/memory-runtime.ts` 和 `governance/release.ts` 是早期内存演示／评分辅助；它们不修改产品 `LocalVersionStore` 的受治理发布记录。产品候选发布使用 `promoteCandidate`。Kernel 是模型循环的适配器，不代表第二套 Agent 产品。

新代码先从模板和统一入口阅读，避免把独立低层示例误当作另一个完整运行路径。
