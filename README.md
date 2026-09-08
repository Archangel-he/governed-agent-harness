# Governed Agent Harness

供少量开发者单机部署、实验的 Agent 运行与治理框架原型。设计目标是由人定义能力插件拓扑，汇总一个 Agent 的完整轨迹，再通过综合评估和候选实验改进插件与拓扑。

当前已有独立可运行的 AgentLoop、拓扑执行、Cordis 插件生命周期、轨迹统计及版本存储模块。这些模块尚未全部连接成统一产品；示例通过不代表自由分支/循环、完整治理闭环或 OS 隔离已经实现。

技术参考：DeepSeek Harness / Cordis。包名为 `governed-agent-harness`，本地目录仍为 `agent-brick-design`。

## 运行

```sh
npm install
npm run minimal
npm run acceptance
npm run verify
```

- `minimal`：一次 Kernel → AgentLoop → Session/Trajectory 调用。
- `acceptance`：两个各含两节点的确定性拓扑示例与 Trace 聚合检查。
- `integration`：Cordis、工具调用、文件 Store、Team 的组合冒烟检查。
- `verify`：类型检查、测试及全部示例。`production` 保留为 `integration` 的旧命令别名。

## 阅读顺序

1. [代码导航](docs/CODE_MAP.md)：实际目录职责、调用路径和改动入口。
2. [产品与架构规范](docs/GOVERNED_AGENT_HARNESS_SPEC.md)：目标设计。
3. [工程缺口](docs/ARCHITECTURE_GAPS.md)：当前实现边界与历史记录。

## 目录

```text
src/
  contracts/       共享数据、服务、Loop、Kernel 契约
  plugins/         能力插件、生命周期插件与插件座绑定校验
  topology/        拓扑定义、校验、编译、执行
  runtime/         AgentLoop、Host、Registry、恢复与版本校验
    kernel/       一次执行的 Kernel 适配器
  trace/           Trace 聚合与 Session → Trajectory 投影
  governance/      Agent/Cluster 统计、分析、Replay、Release Gate
  services/        内存与文件存储、Gateway、版本和 Registry 快照
  sandbox/         本地工作目录及子进程适配器
  team/            Team 消息与任务板
  examples/        可运行示例和冒烟检查
  tests/           自动化测试
  types/           Cordis 临时类型声明
docs/             设计、代码导航、缺口与历史计划
```
