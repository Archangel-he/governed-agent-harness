# Governed Agent Harness

供少量开发者在单机 Docker 中运行实验的 Agent 基座。开发者定义能力插件、拓扑和评估器，框架负责 Cordis 装配、执行记录、Wiki 记忆、整 Agent 评估和候选发布。

核心链路：**人工定义能力拓扑 → Cordis 插件座 → 完整执行轨迹 → 综合归因假设 → 对照实验 → 发布／回滚**。Supreme、Team Leader、Member 都使用同一个完整 Agent 运行时。

## 直接运行

```sh
npm ci
npm run template
npm run team:acceptance
npm run verify
```

- `template`：上游输出导致下游校验失败；生成证据关联的假设，只改上游配置，运行对照实验、发布并回滚。结果和原始证据写入输出的 `.tmp/template-*` 目录。
- `team:acceptance`：一个 Supreme、两个 Leader、两个 Member；独立 Session、按范围读取 Wiki、逐级验收、重开后不重复执行。
- `acceptance`：各六步的 Decision／Tool Agent，覆盖真实 Kernel、工具与轨迹流水线。
- `verify`：类型检查、测试和所有示例。测试使用确定性 Provider；真实 Docker Sandbox 测试需要 Docker daemon 和 `node:22-alpine` 镜像。

```sh
docker build -t governed-agent-harness:local .
docker run --rm --network none governed-agent-harness:local
```

应用镜像固定 Node 版本，以非 root 用户执行三组验收。示例数据在容器 `/app/.tmp`；需要保留时挂载该目录。应用验收不需要挂载 Docker socket，也不自动调用付费模型。

## 定义自己的 Agent

公共组合入口位于 `src/index.ts`。新 Agent 只需实现 `AgentTemplate`，不需要修改运行时：

```ts
import {assembleAgent, definePlugin, type AgentTemplate} from './src/index.js';
const definition: AgentTemplate = {/* version, plugins, topology, evaluation */};
const agent = assembleAgent('./data/my-agent', definition);
const result = await agent.run('request-1', input);
const report = await agent.evaluate(result, input);
```

复制 [text-agent.ts](src/templates/text-agent.ts)，填写 `AgentTemplate`：

```ts
const agent = assembleAgent('./data/my-agent', myTemplate);
const result = await agent.run('stable-request-id', task);
const evaluation = await agent.evaluate(result, task);
```

模板包含版本、能力插件、数据／控制边、版本化 EvaluationPackage（Evaluator、Dataset、Gates）以及可选模型／工具服务。`assembleAgent` 暴露 `versions`、`wiki`、`resolver` 和 `compare`，完整示例见 [template-acceptance.ts](src/examples/template-acceptance.ts)。新增 Agent 无需修改核心运行时。

插件共享该 Agent 的已发布 Wiki，临时工作状态留在调用中。Wiki 更新先引用原始来源并生成 proposal，再由范围所有者发布；新发布不会改变已经固定的执行记忆。团队示例见 [team-acceptance.ts](src/examples/team-acceptance.ts)。

## 阅读入口

- [代码导航](docs/CODE_MAP.md)：当前真实调用路径。
- [产品与架构规范](docs/GOVERNED_AGENT_HARNESS_SPEC.md)：设计原则与本轮增量。
- [实现边界与验收](docs/ARCHITECTURE_GAPS.md)：实验范围、信任边界及验证命令。

技术参考仅为 DeepSeek Harness／Cordis。DSH 参考 checkout 本轮更新至 `5dda764ed3aa172535a7967b06ff95d9cbfe536a`；采用其生命周期、持久消息、回执和任务权限语义，未引入整个 DSH monorepo。
