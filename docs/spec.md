# Spec: DSH 聊天时间线插件（chat-timeline）

Status: ready-for-agent（方案定稿，待确认后实施）
Date: 2026-08-28
Source: 从 ZCode 桌面客户端 3.10.1 渲染层 bundle 逆向还原的 TurnNavigator 实现 + DSH 0.1.1-rc.2 官方插件 API

## 1. 目标

把 ZCode 对话窗口左侧的"问题导航时间线"复刻为 DSH Web GUI 插件：
一条悬浮在会话区左缘的刻度轨，每个刻度对应一条用户提问；悬停时刻度按距离涟漪式变长，
并弹出该轮对话的缩略预览卡（用户消息 + 助手回复摘要）；点击平滑滚动定位；滚动时高亮当前回合。

## 2. 原版实现还原（ZCode TurnNavigator）

来源：`app.asar` → `out/renderer/assets/styles-C2WGZ-SY.js`（组件）+ `IntlProvider-CyTmJHD8.js`（文案）。
内部命名：i18n 命名空间 `chat.turnNavigator.*`；埋点 `v4-turn-navigator` / `-item` / `-tooltip`。

### 2.1 数据模型

- 目录 = 会话行流中 `kind === 'userInput'` 且 `origin === 'realUser'` 的行（排除排队/转向/自动化输入）。
- 每个刻度 item：`{ key, turnId, unitIndex, rowId, userPreview, assistantPreview, assistantPreviewKind: 'text'|'running'|'empty', isRunning }`。
- 预览文本裁剪：取前 N=2 个非空段落，段内空白折叠为单空格，拼接后截断到 220 字符
  （`maxPreviewChars=220`，最少 8，截断为 `slice(0, 217).trimEnd() + '...'`）。
- 助手侧三种状态：有正文 → `text`（取同样的裁剪规则）；回合仍在跑 → `running`（固定文案"助手仍在工作"）；
  无正文 → `empty`（"暂无助手正文"）。用户侧兜底文案"用户输入"。
- 显示门槛：问题数 `< 2` 时整个导航不渲染。
- 历史水合：视口只保留尾部窗口行，导航需要"完整问题目录"时按页向前拉全量历史
  （`rowsRange` 翻页直到 `hasMore=false`）；少于 2 条问题 → 终态 `not-enough-queries`（隐藏）。
  目录版本号随"真实用户输入行的增删"自增，重算目录。
- 宽度门槛：对话容器 `< 864px` 时导航隐藏（container query），且不触发历史水合。

### 2.2 视觉系统（精确常量）

- 轨道容器：`absolute inset-y-0 left-0 w-12 z-10`，默认 `opacity-0 -translate-x-2 invisible`，
  `transition-[opacity,transform,visibility] duration-150 ease-out`；仅 `@min-[864px]/conversation` 可见。
- 滚动区：`left-3 top-1/2 -translate-y-1/2 w-9 max-h-[calc(100%-6rem)] py-1 overflow-y-auto scrollbar-hide`（垂直居中，超高内部滚动）。
- 虚拟化：`@tanstack/react-virtual`，`estimateSize=10px`，`overscan=6`；每项占位 `h-2.5 w-9`（10px×36px）。
- 刻度线：`span block h-0.5 w-3 rounded-full origin-left`（2px 高、12px 宽），
  `transition-[height,opacity,transform,background-color] duration-150 ease-out`，
  靠 `scaleX` 伸长（origin-left 即向右长）。
- 涟漪（`_5e`，按与焦点项的距离 d）——**焦点 = 悬停/键盘聚焦项（v5e 只返回交互项），
  静止（无悬停）时所有刻度等长（scaleX 1、subtlest 色、opacity .58）**：
  - d=0（悬停项）：`scaleX 2.6`，`opacity 1`，tone=`focus`（前景色）
  - d=1：`scaleX 1.7`，`opacity .86`
  - d=2：`scaleX 1.25`，`opacity .72`
  - 其余：`scaleX 1`，`opacity .58`（`bg-foreground-subtlest`）
- 当前所在回合的刻度（静止时）：**不拉长**，用颜色指示——`bg-foreground` + `opacity .9`；
  运行中回合：`opacity = max(档位, .72)`。
- 最后一轮若在运行，作为"live unit"不参与虚拟化，单独渲染在轨尾。

### 2.3 交互

- 焦点项 = 悬停/键盘聚焦项（离开轨道即清除），否则 = 视口顶部所在的回合（按虚拟列表偏移换算）。
- 点击刻度 → 跳到对应回合；`prefers-reduced-motion` 时用 `auto`，否则 `smooth` 滚动。
- Tooltip（Radix）：`openDelay 120ms / closeDelay 80ms`，`side=right sideOffset=8`，
  宽 `w-80`（320px）`p-3`：用户预览 `line-clamp-2 font-medium`，助手预览 `line-clamp-3`
  （text 态 80% 不透明度，running/empty 态用 subtle 色）。
- 无障碍：`nav aria-label="对话问题导航" aria-busy`；每钮 `aria-label="跳转到第 {N} 条问题"
  aria-posinset aria-setsize`，当前项 `aria-current="location"`。
- 键盘聚焦与悬停同权（onFocus 也设置焦点项）。

## 3. DSH 侧设计

### 3.1 包形态

- 包名 `@linxin666/dsh-client-ui-chat-timeline`，cordis 行 id `ui-chat-timeline`；纯浏览器插件（host 半区空）。
- 按 dsh-web 官方模板：`cordis.patch.yml` + `dsh.bundle.patch` + `dsh.client: {inject: ['@deepseek-ai/dsh-client-runtime'], platform: 'web'}`；
  声明 `dsh.engines.dsh: ">=0.1.1-rc.1"`（本机 0.1.1-rc.2）。
- React 18 组件，构建走 shared/tsdown.client.ts 形态；文案走 `ctx.locale`（zh/en 双语，无 emoji）。

### 3.2 挂载与数据

- 挂点：`shell.overlay`（全局 list 插槽，additive），渲染 `position: fixed/absolute` 左缘轨，容器 `pointer-events:none`、刻度区 `auto`，避免遮挡聊天。
- 会话数据：全局插槽用"跟随当前会话"的标准 kit 读取当前会话快照；实现第一步先做 spike，
  确认从 client runtime 读"当前会话按序消息行（用户输入 + 助手文本）"的确切路径
  （候选：sessions 服务的当前会话快照 / store 契约；参考 dsh-session-id 对 sessions list 的读法）。
- 目录推导 = ZCode 同款：取用户输入行（过滤命令/系统注入类），每条配其后首个助手文本行做预览。
- 大历史：DSH 会话快照自身带全量或分页接口待 spike 确认；若无全量，先只列已加载部分（降级，不阻塞）。

### 3.3 定位与滚动同步（与原版的差异点）

原版直接用虚拟列表偏移精确换算；DSH 插件拿不到内部虚拟化参数，改用 DOM 推导并隔离在单模块：

- 找聊天滚动容器与消息节点（类名/结构探测 + 多候选降级；找不到则刻度只高亮不跳转）。
- 滚动同步：监听容器 scroll → 最近视口顶部的用户消息 → active 刻度。
- 跳转：`scrollIntoView({behavior: smooth|auto, block: 'start'})`。
- DOM 探测失败时功能降级为"纯展示轨"，不抛错。

### 3.4 视觉与交互

完整复刻 §2.2/§2.3 的常量：48px 轨、10px 项距、12×2px 刻度、涟漪 2.6/1.7/1.25 + 1/.86/.72/.58、
150ms ease-out、tooltip 320px/120ms/80ms、`<2` 条隐藏、`<864px` 隐藏、`prefers-reduced-motion` 降级、
aria 全套。主题色用 DSH 主题变量（foreground/subtlest 系列）映射。

## 4. 实施步骤

1. ~~`‌plugin` 目录改名为正常名称~~（已完成 2026-08-29：`U+200C plugin` → `plugin`；ZCode 侧边栏如仍显示旧条目需重新添加新路径）。
2. 脚手架：按官方 plugin-template 生成包结构。
3. Spike：确认当前会话消息行的读取路径 + 聊天 DOM 结构探测（写探测模块 + jsdom 测试）。
4. 实现：目录推导（纯函数 + vitest）→ 轨道 UI（虚拟化可先简单窗口化）→ tooltip → 滚动同步 → i18n → 主题。
5. 构建：`pnpm build && pnpm typecheck && pnpm test`。
6. 安装：`dsh plugin --profile web add link:<包目录>`；需用户自行重启 `dsh web` 后刷新页面验证。
7. 验收：长会话截图对照原版（含悬停涟漪、预览卡、active 跟随、窄窗隐藏）。

## 5. 风险

- DSH 无公开"消息行"读取契约的部分依赖内部快照结构 → 升级可能变，隔离在数据模块。
- 聊天 DOM 为内部实现 → 探测失败时降级为展示轨。
- 与 Skin Center 的壁纸/皮肤叠加时 z-index 冲突 → 轨道 z-index 取低位并避让。
- 插件市场规则：若日后发布需遵守 dsh-web 家族规范（命名、README 三件套、engines、mountOnce、无 emoji）。
