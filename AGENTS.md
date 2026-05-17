# AlembicDashboard Agent Instructions

**重要**：本项目是 Alembic 的独立 Dashboard 前端仓库，不是用户项目环境，也不是 Core、Agent 或插件仓库。

Agent 可以制定目标和计划，但目标和计划必须服务于用户提出的真实任务，不能被 Agent 自己偏好的“干净”“薄”“轻量”“空壳”“先搭框架”等路线替换。

Agent 不得把完整实现改成薄实现，不得把成熟能力改成空壳接口，不得把迁移、整理、重构、优化或拆仓解释成削减功能。

当 Agent 的计划涉及删减、替换、降级、延期、只做部分、只搭框架、只保留接口、暂不接入或改变完整范围时，必须先向用户确认。

不要在旧工作区或旧克隆路径下工作；当前统一以本 workspace 内的 Alembic 系列仓库为准。

## 操作范围

- 本仓库任务只修改当前 `AlembicDashboard` 仓库内的文件，并只在该仓库内提交。
- 不要主动修改、整理、格式化、提交或回退 `AlembicCore`、`AlembicAgent`、`AlembicPlugin`、`Alembic` 或其他相邻项目。
- 其他 Alembic 仓库只可作为只读背景参考；如果 Dashboard 功能必须依赖其他仓库变更，先说明边界和所需接口，再等待用户明确授权。
- 新建迁移说明、协作文档或跨仓库设计记录时，统一保存到 workspace 根目录的 `docs/`，不要散落到各子仓库。

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

## 本仓库必须保留的边界

- Dashboard 页面、布局、组件、交互、图表、状态管理和数据获取。
- 前端 API client、错误归一化、loading/empty/error 状态。
- 本地开发体验、前端测试、Story/fixture、可访问性和响应式布局。
- Dashboard 构建产物和发布所需的前端资源描述。

这些能力不能因为 Core、Agent 或外层主仓库存在而被空壳化或删除。

## 需要测试时

- 新建项目后，应在 `package.json` 中提供清晰脚本，例如 `npm run build`、`npm run lint`、`npm run test`、`npm run typecheck`。
- UI 改动至少运行类型检查和前端构建。
- 数据模型、API client 或状态管理改动需要补充单元测试。
- 复杂交互、布局和可视化改动需要浏览器验证和截图检查。
- 不要把静态 mock 预览当作真实后端连通性验证。

## 文件存放约定

- 正式源码优先放在 `src/`。
- 页面和路由放在 `src/pages/` 或本项目约定的路由目录。
- 可复用 UI 组件放在 `src/components/`。
- API client 和数据 contract 放在 `src/api/`、`src/contracts/` 或本项目约定目录。
- 状态管理放在 `src/state/`、`src/store/` 或本项目约定目录。
- 测试放在 `test/` 或与源码同目录的 `*.test.ts(x)`。
- 构建产物如 `dist/` 必须保持 ignored，不提交。
- workspace 级迁移和协作文档保存在 workspace 根目录的 `docs/`。

## 技术栈与编码约定

- 默认前端技术栈：TypeScript、React、Vite；如果项目初始化时选择其他技术栈，必须在本文档同步更新。
- 模块系统优先使用 ESM。
- Lint / Format 优先与 Alembic 系列仓库保持一致，使用 Biome；不要无必要引入第二套格式化体系。
- UI 应该是实际可用的工作界面，不做营销落地页式结构。
- 前端设计要服务 Alembic 的工作流：信息密度适中、状态清晰、可扫描、可比较、可恢复。
- 可以使用中文注释解释复杂状态机、迁移边界、API 兼容或非显然 UI 行为；不要给自解释代码堆注释。

## 类型安全与代码规则

- API 输入先归一化再进入 UI 状态。
- `catch` 块使用 `catch (err: unknown)` + 类型守卫，禁止 `catch (err: any)`。
- 避免 `as any`；不得已时加注释说明真实边界原因。
- if/else/for/while 必须使用花括号。
- 不要吞掉后端错误；需要把错误转换成用户可理解、可诊断、可恢复的前端状态。
- 不要回退其他窗口或用户已有改动；如果工作区已有无关变更，只处理当前任务需要的文件。

## 长期维护规则

- 改 Dashboard 前先确认真实用户工作流、后端 API contract 和现有视觉/交互模式。
- 新增页面时要同时考虑 loading、empty、error、partial data 和 long-running task 状态。
- 删除 UI 或 API client 前必须有扫描结果、替代入口和验证证据。
- 如果某个能力属于 Core、Agent、主仓库还是 Dashboard 不确定，先做边界判断并记录理由；不要为了拆仓好看裁掉真实链路。
