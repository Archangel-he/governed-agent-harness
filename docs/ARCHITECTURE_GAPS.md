# 实现边界与验收

本版定位是少量开发者在单机 Docker 中使用的实验基座，不增加多租户、分布式租约或额外宿主机隔离体系。

## 本轮六项优化

| 优先级 | 实现 | 可运行证据 |
| --- | --- | --- |
| P0 运行／生命周期 | 预检早于 admission；工厂单次实例化；失败清理；清理异常写失败；重复 seat 拒绝 | `runtime-preflight.test.ts` |
| P0 发布证据 | 原始 Session resolver、请求及终态摘要、来源事件逐一核验、评估器实现摘要、试验输入／环境／记忆固定、发布时重验 | `experiment-release.test.ts` |
| P0 重试评价 | 仅显式关联的同轮重试可替代失败尝试；根失败、失败循环和未知副作用不能隐藏；记录尝试可靠性并扣分 | `evaluation-retry.test.ts` |
| P1 综合归因 | 数据依赖＋实际上下游 I/O 形成假设；同一任务输入的单上游配置干预，结合下游恢复和整 Agent 门禁 | `npm run template` |
| P1 同一种 Agent | Supreme、两个 Leader、两个 Member 均执行完整 AgentVersion；独立 Session；原始报告核验、逐级验收、去重和冷恢复 | `team-hierarchy.test.ts`、`npm run team:acceptance` |
| P1 分化模板 | 填写模板后 assembleAgent，运行、查看轨迹、评价与比较候选；不改核心 | `src/templates/text-agent.ts`、`npm run template` |

每个 AgentTemplate 现在必须提供版本化 EvaluationPackage（Evaluator、Dataset、Gates）；装配生成 evaluationDigest，实验和发布核验评价包一致性。`evaluation-package.test.ts` 覆盖缺失包、冻结案例和 digest。

Wiki 另外覆盖：来源 Artifact 内容校验、旧 release 不变、发布权限、CAS 冲突、跨实例一致读、scope 隔离、链接检查、Markdown/index/log 投影以及执行记忆固定。对应 `wiki-memory.test.ts` 和团队／模板验收。

## 使用与兼容边界

- 架构中的“自由”由定义者配置：支持有向执行拓扑、数据／控制边、并行、分支和有界节点循环；不接受任意无界图环，不让 Agent 自行改写在途版本。
- 归因结果是待检验假设。当前自动规则针对可直接验证数据传递的上下游；配对实验支持只在相同输入上、单一上游节点变化时的结论。不会声称从轨迹直接证明普遍因果，也不自动发布生成代码。
- Wiki 编译是插件可调用的来源→提案→发布接口；框架不自动把模型猜测升级为事实。页的事实正确性仍由调用方评估器和发布者负责。直接传给低层 Runtime 的 memory 是可信宿主提供的适配器快照；标准模板和 Team 从 Wiki 发布版本构建它。
- `harness/seal`、内容寻址 Artifact 和实验摘要用于检测证据不一致。可信本机代码／管理员能改写所有文件的攻击不在实验信任边界内；没有增加签名服务器或密钥管理系统。
- 已完成执行通过 request ID 去重；中途崩溃造成的未知外部副作用不会自动重做。协调插件可以派发新键表示返工，旧任务与证据保留。
- 新团队注册完整 Runtime；旧 `AgentRegistry`／TeamBoard 和独立 Loop 示例保留兼容，不作为新产品另一套入口。早期数值 `releaseGate` 是演示辅助，实际版本发布走 `promoteCandidate`。
- 旧日志没有新请求／终态证据字段时不能用于新发布门禁；保留旧数据，用新的实验目录重新执行采集，不能补造旧执行证据。
- Docker Sandbox 继续只接受 `none`／`full` 网络模式；不新增宿主机 runner。应用验收不需要 Docker socket。真实 Provider 与业务工具由开发者注入；验收采用确定性 Provider，不产生付费 API 调用。

## 参考实现

DSH checkout 已更新到 `5dda764ed3aa172535a7967b06ff95d9cbfe536a`。参考文件：`packages/experimental/agent-team/src/{types,mailbox,lifecycle,task-board,journal}.ts`。复用其独立 Session、持久任务、发送回执、确认顺序、revision/authority 思路，适配本项目 AgentVersion 契约。Cordis 使用已锁定的正式 npm 依赖。Wiki 与综合归因／治理拓扑是本项目自己的工程扩展。

## 验证命令

```sh
npm run verify
docker build -t governed-agent-harness:local .
docker run --rm --network none governed-agent-harness:local
```

实际结果以本轮最终验证输出为准。Docker 应用镜像使用固定的 `node:24.18.0-bookworm-slim`，以 `node` 用户运行。宿主机回归包含真实 Docker Sandbox 的网络、只读根、资源限制、输出、超时与取消测试。

## 当前能力边界（2026-09-09）

- 综合优化：`analyzeCapabilityTrajectory` 主要统计插件运行成功率；`attributeTrace` 基于失败下游与成功上游的实际数据传递形成假设，`assessAttribution` 验证单上游干预。`governanceReport` 当前没有自动串联该归因流程。提案构造函数接收调用方给出的假设和标准，不能视为自动优化专家。
- LLM 评价：`llmRubric`、`aggregateLLMEvaluation` 和 `compareLLMEvaluations` 提供版本化维度、证据引用、置信度、分歧、暂定／结算状态和成对比较；LLM 分数仍是软评价，不能覆盖确定性门禁，也不能单独证明因果。低置信度或高分歧结果进入 `needs-review`。
- 动态评估：Store 可选 JSONL 持久化与重新读取；反馈调度器需要调用方驱动 `tick()`，checkpoint 仍是内存状态。反馈流恢复和持续无人值守没有获得长期验证。
- 使用入口：目前是 SDK、模板和示例脚本。TUI 已移除；具体模型、工具、业务评价标准仍由开发者提供。
- 设计规范描述目标和约束，不代表其中所有自动化环节已实现。综合优化的下一步方案尚在讨论，本次仅更新文档。

## 当前实测记录（2026-09-09，移除 TUI 后）

`npm run verify` 退出码 0：103 项测试通过，0 失败、0 跳过；模板、团队、集成及其他脚本均通过。原始输出位于本地 `.tmp/verify-remove-tui.log`。本次没有重新运行付费模型或重建应用 Docker 镜像，不将测试通过等同于业务效果或长期可靠性验证。

## 历史实测记录（2026-09-09，Wiki／Team 轮次）

`npm run verify` 退出码 0：86 项测试通过，0 失败、0 跳过；六步 Decision／Tool、模板归因实验、五 Agent 团队和兼容示例全部通过。

应用 Docker 镜像构建退出码 0；以非 root 用户、`--network none --read-only` 和临时可写目录运行三组验收，退出码 0。原始输出保存在本地 `.tmp/verify-wiki-team.log` 与 `.tmp/docker-wiki-team.log`。源码复查确认本轮重要问题已修正；没有将确定性验收描述成真实模型业务质量认证。

## 真实模型预验收记录（2026-09-09）

已通过硅基流动 OpenAI-compatible Provider 启动 `npm run experiment:model-feedback`。实验目录被创建，说明本地模板装配和启动路径正常；当前网络请求超过 30 秒未返回，未生成 `report.json`，因此不宣称真实模型执行成功。API key 未写入仓库或实验报告。重试应先确认 Provider 可达性和模型响应，再运行同一命令。

追加记录：按当前硅基流动模型列表切换 `deepseek-ai/DeepSeek-V4-Flash`，并用官方 Chat Completions 最小请求（messages、stream、max_tokens）及 JSON 模式分别测试；接口仍返回 `20015 parameter invalid`。模型列表 GET 正常，聊天 POST 未获得模型输出，因此真实模型验收仍受 Provider 请求/账号状态阻塞。
