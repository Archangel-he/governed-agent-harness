# Governed Agent Harness

面向生产的 Agent 运行与演进框架。核心是冻结运行组成、由人定义可细分的能力拓扑、汇总完整 Agent 轨迹综合评估，并通过候选实验与发布门禁推动优化。

**当前状态：早期实现，尚未通过生产级验收。** 示例和检查通过只说明相应路径可运行，不等于已完成可靠持久化、OS 隔离、完整协作及综合治理。

- [产品与架构规范](docs/GOVERNED_AGENT_HARNESS_SPEC.md)：产品定位、最终设计原则、能力边界和生产验收标准。
- [工程缺口记录](docs/ARCHITECTURE_GAPS.md)：待补实现及待决策事项。

技术实现参考为 DeepSeek Harness/Cordis。仓库目录与 npm 包名暂沿用现状。

## 本地运行

```sh
npm install
npm run minimal
npm run verify
```

minimal 是最小执行示例；verify 包含类型检查、现有测试及示例。production 为历史脚本名称，不是生产认证。

## 目录

- `src/contracts`：Agent 与运行时契约
- `src/topology`：自由拓扑定义、校验、编译与执行
- `src/plugins`：插件契约与注册
- `src/runtime`：Agent Loop、Registry、Recovery、Cordis Host
- `src/trace`：统一 Agent Trace
- `src/evaluation`：Agent 级评估与候选实验
- `src/governance`：Replay、Compare、Release Gate
- `src/services`：Session、Trajectory、Artifact、Version 等本地服务
- `src/sandbox`：本地 Sandbox 适配
- `src/team`：多 Agent 协作基础设施
- `src/examples`：可运行示例与验收入口
- `src/tests`：自动化测试
- `docs`：架构规范与缺口记录
