# AlembicDashboard Agent Instructions

<!-- codex-control-workspace:scope:start -->
## Workspace 接入卡

本节由 control workspace 安装脚本维护，只记录本窗口接入坐标和自动化最小门禁。硬规则以父级 AGENTS 与本文件的“本窗口最高停止卡”为准；不要在这里重复仓库专属规则。

### 坐标

- Control workspace: `../codex-control-workspace`
- Window name: `AlembicDashboard`
- Parent workspace AGENTS: `../AGENTS.md`
- Active workspace index: `../codex-control-workspace/.workspace-active/workspace/index.md`
- Active workspace status: `../codex-control-workspace/.workspace-active/workspace/current/workspace-current-status.md`
- Current plan directory: `../codex-control-workspace/.workspace-active/workspace/current`
- Window ledger: `../workspace-ledger/AlembicDashboard`

### 领取 workspace 任务时

1. 先读本文件。
2. 再读父级 `../AGENTS.md`。
3. 再读 `../codex-control-workspace/.workspace-active/workspace/index.md` 和 `../codex-control-workspace/.workspace-active/workspace/current/workspace-current-status.md`。
4. 如果有当前计划、任务包或 VAD heartbeat，只按 `../codex-control-workspace/.workspace-active/workspace/current` 中明确分配给 `AlembicDashboard` 的内容执行。

### VAD 最小门禁

- Automation 只是唤醒信封，不改变本窗口职责，也不扩大任务范围；具体任务仍以 claim 结果和当前计划为准。
- VAD 模式下只允许 claim / finish `AlembicDashboard` 对应任务；`claim --json` 没有返回本窗口任务时必须停止。
- 只有 finish JSON 同时明确允许下一跳时，才可创建下一条 heartbeat；否则停止并回报总控。
- 非 TestWindow 不得创建、处理或验证 TestWindow heartbeat，除非当前计划和 finish JSON 同时显式授权。
- Thread id 只能写入 control workspace 的本地 runtime；不得写入 tracked 文档、回填正文或 GitHub。

### 文档落点

- 长期跨仓库协作文档、计划、验收、扫描和边界记录写入 `../workspace-ledger/AlembicDashboard`；本仓库 `docs/` 只放随源码维护的产品、发布或用户文档。
<!-- codex-control-workspace:scope:end -->

## 本窗口最高停止卡

本仓库是 Alembic Dashboard 前端仓库，不是用户项目环境，也不是 Core、Agent、Plugin、CLI 或 daemon 仓库。本节是仓库级执行前停止卡。

### 先停下

- 如果当前任务没有明确分配给 `AlembicDashboard`，或当前目录不是本仓库，停止并回报总控。
- 如果准备把用户可见 UI 改成静态 mock、营销页、空壳预览或无后端契约的数据假象，停止。
- 如果要把后端持久化、SQLite/Drizzle migration、AST/grammar、AI provider、tool execution 或 Agent 决策放进前端仓库，停止。
- 如果前端 API contract 无法追溯到后端真实接口，或 mock 被当成真实连通性验证，停止。
- 如果 UI 改动没有覆盖 loading、empty、error、partial data、long-running task 和失败路径，停止补齐判断。
- 如果复杂交互、布局或可视化改动没有浏览器验证和截图检查，不能回填为完成。
- 如果要修改相邻仓库，当前计划没有明确授权时停止。
- 如果没有提交 hash 或明确 no-commit 理由、验证命令、验证结果、遗留风险和下一步建议，不能回填为完成。

### 正确顺序

1. 先确认真实用户工作流、后端 API contract 和现有视觉 / 交互模式。
2. 再实现页面、组件、状态和 API client。
3. 验证类型、构建、关键交互和必要截图。
4. 最后回填证据、风险和后端依赖。

## 操作范围

- 本仓库任务只修改当前 `AlembicDashboard` 仓库内的文件，并只在该仓库内提交。
- 不要主动修改、整理、格式化、提交或回退 `AlembicCore`、`AlembicAgent`、`AlembicPlugin`、`Alembic` 或其他相邻项目。
- 其他 Alembic 仓库只可作为只读背景参考；如果 Dashboard 功能必须依赖其他仓库变更，先说明边界和所需接口，再等待用户明确授权。

## 仓库定位

- `AlembicDashboard` 是 Alembic Dashboard 的独立前端仓库，负责用户可见的 Dashboard UI、交互体验、前端状态管理、前端路由、可视化、API client 和前端构建发布产物。
- 本仓库不承载 Core 内核实现，不承载 Agent/AI/tool system，不承载 CLI、daemon、native/IDE、sandbox、插件 marketplace/channel 或多渠道交付壳。
- Dashboard 需要展示 Alembic 的真实运行状态、项目知识、Recipe、Guard、Bootstrap、Project Intelligence、Vector/Search、任务进度和诊断结果，但这些能力的确定性实现应来自 Core 或后端 API。
- Dashboard 可以定义前端专用 view model、API client、UI adapter、mock fixture 和交互状态；不要把后端持久化、SQLite、Drizzle migration、AST/grammar、AI provider、tool execution 放进前端仓库。
- 如果需要共享类型，优先通过稳定包入口或生成的 API contract 接入；不要从其他仓库的源码路径直接引用内部文件。

## 接入边界

- Dashboard 与后端通过 HTTP/API、WebSocket/SSE 或明确的 typed client contract 通信。
- 前端 API contract 必须能追溯到后端真实接口；不要为了 UI 方便私造与后端不一致的数据模型。
- UI mock 只能用于开发、Story、测试或离线预览，不能替代真实 API 接入任务。
- 与 `AlembicCore` 相关的能力只作为共享类型、契约或后端能力结果展示；不得把 Core 运行时逻辑复制到 Dashboard。
- 与 `AlembicAgent` 相关的能力只作为 Agent 任务、工具调用、执行计划、诊断结果和状态展示；不得在 Dashboard 中直接实现 Agent 决策或 tool execution。

## 职责边界

- `AlembicDashboard` 是 Dashboard 前端源码唯一维护点；外层仓库只能消费本仓库源码构建出的前端产物，不再维护自己的 `dashboard/src`、`dashboard/public` 或 Vite 配置副本。
- 当前前端基线来自 `Alembic/dashboard`，并作为权威实现保留；`AlembicPlugin/dashboard` 只能作为兼容审计材料，不能反向覆盖或降级本仓库实现。
- 如果共享 Dashboard 需要插件侧补齐 API、字段或运行时配置，优先由插件接入层提供兼容；不要通过删除 AI、Wiki、Skills 推荐、Signal、Guard、Bootstrap、Project Intelligence 等完整前端能力来适配旧后端。
- `package.json` 保持可复现的前端构建入口；`npm run build` 必须执行 TypeScript 检查和 Vite production build。
- `package-lock.json` 是依赖复现契约，依赖变更必须连同 lockfile 一起提交。
- `dist/`、`node_modules/`、`.vite/` 等生成物只用于本地验证，必须保持 ignored，不提交。
- Dashboard 页面、布局、组件、交互、图表、状态管理和数据获取。
- 前端 API client、错误归一化、loading/empty/error 状态。
- 本地开发体验、前端测试、Story/fixture、可访问性和响应式布局。
- Dashboard 构建产物和发布所需的前端资源描述。

这些能力不能因为 Core、Agent 或外层主仓库存在而被空壳化或删除。

## 验证与回填

- 新建项目后，应在 `package.json` 中提供清晰脚本，例如 `npm run build`、`npm run lint`、`npm run test`、`npm run typecheck`。
- UI 改动至少运行类型检查和前端构建。
- 数据模型、API client 或状态管理改动需要补充单元测试。
- 复杂交互、布局和可视化改动需要浏览器验证和截图检查。
- 不要把静态 mock 预览当作真实后端连通性验证。
- 回填必须写清完成范围、提交 hash、验证命令、验证结果、浏览器 / 截图证据或不需要截图的理由、遗留风险和下一步建议。

## 文件地图

- 正式源码优先放在 `src/`。
- 页面和路由放在 `src/pages/` 或本项目约定的路由目录。
- 可复用 UI 组件放在 `src/components/`。
- API client 和数据 contract 放在 `src/api/`、`src/contracts/` 或本项目约定目录。
- 状态管理放在 `src/state/`、`src/store/` 或本项目约定目录。
- 测试放在 `test/` 或与源码同目录的 `*.test.ts(x)`。
- 构建产物如 `dist/` 必须保持 ignored，不提交。
- workspace 级长期协作文档按 Workspace 接入卡中的 `Window ledger` 归档。

## 技术与代码规则

- 默认前端技术栈：TypeScript、React、Vite；如果项目初始化时选择其他技术栈，必须在本文档同步更新。
- 模块系统优先使用 ESM。
- Lint / Format 优先与 Alembic 系列仓库保持一致，使用 Biome；不要无必要引入第二套格式化体系。
- UI 应该是实际可用的工作界面，不做营销落地页式结构。
- 前端设计要服务 Alembic 的工作流：信息密度适中、状态清晰、可扫描、可比较、可恢复。
- 必须尽量多地在代码旁补充简体中文说明，优先解释复杂状态机、迁移边界、API 兼容、UI 状态分叉、降级展示、兼容字段和后续校验方式。
- 任何运行时分叉、fallback、降级、兼容转译、跳过、短路、重试、取消或错误归类，都必须打印足够明确的日志、诊断事件或可观测前端状态，日志要能看出触发条件、选择路径、关键输入、结果状态和后续校验依据。
- API 输入先归一化再进入 UI 状态。
- `catch` 块使用 `catch (err: unknown)` + 类型守卫，禁止 `catch (err: any)`。
- 避免 `as any`；不得已时在附近说明真实边界原因。
- if/else/for/while 必须使用花括号。
- 不要吞掉后端错误；需要把错误转换成用户可理解、可诊断、可恢复的前端状态。
- 不要回退其他窗口或用户已有改动；如果工作区已有无关变更，只处理当前任务需要的文件。

## 长期维护规则

- 改 Dashboard 前先确认真实用户工作流、后端 API contract 和现有视觉/交互模式。
- 新增页面时要同时考虑 loading、empty、error、partial data 和 long-running task 状态。
- 删除 UI 或 API client 前必须有扫描结果、替代入口和验证证据。
- 如果某个能力属于 Core、Agent、主仓库还是 Dashboard 不确定，先做边界判断并记录理由；不要为了拆仓好看裁掉真实链路。
