# DSH Chat Timeline

[English](./README.md) | 简体中文

DSH Web 插件：在会话区旁加一条**问题导航刻度条**——每个刻度对应一条你的提问，悬停涟漪反馈、逐轮预览卡、点击跳转、滚动同步高亮当前轮次。交互设计复刻 ZCode 桌面客户端的 TurnNavigator；跳转机制直接复用 DSH 宿主自己的轮次导航实现，跳转行为与原生完全一致——包括跨事件翻页窗口的跳转。

## 功能

- **一问一刻度，全史可导航。** 刻度来自宿主官方 `turnOutline` 投影（session-turn-outline 域）：宿主对整份日志 fold 出的全史轮次索引，无需先把事件窗口翻页进来，会话里每条提问都可直达。
- **点击跳转，原生机制。** 落位复刻宿主 ChatView 的 `navigateToTurn`/`landOnRow`：按原生 `data-chat-turn` 锚点找到轮次行，瞬时滚动到行顶距视口顶 24px 处；轮次不在已加载窗口时，先走官方 `session.loadThrough(turn/start seq)` 翻页再落位。
- **滚动同步高亮。** 当前刻度跟随宿主自己的阅读线规则（`top + min(96, 高度*0.2)` 处命中测试，距底部 25px 内最后一刻度胜出），刻度条与内容永远一致。
- **悬停涟漪与预览卡。** 与 ZCode TurnNavigator 对齐：涟漪 `scaleX 2.6/1.7/1.25`、不透明度 `1/.86/.72/.58`、150ms 过渡；320px 预览卡延迟 120ms 弹出（80ms 关闭），展示用户提问 + 助手回复摘要；配色使用宿主原生 tooltip 令牌（灰底白字，跟随亮/暗主题）。
- **干净地接管原生导航条。** 插件存活期间，宿主内置的右侧 Turn 导航条被隐藏；卸载插件立即恢复。本刻度条自身不设条数或宽度门槛。
- **原生 band 几何，纯 CSS 计算。** 刻度条的纵向位置就是宿主自己的 band 规则——视口高减输入框高再取半——写成一条 CSS `calc()`，直接读宿主 `--dsh-conversation-viewport-height` / `--dsh-composer-height` 变量。没有任何 JavaScript 测量，也不再依赖原生导航条存在于 DOM 才能定位自己的 band。

## 挂载方式

刻度条注册在宿主的 **session 作用域** seat `conversation.input.overlay` 上，这个选择是承重的。DSH 0.1.7 起，打开的会话不再能从 sessions 服务里查到——list 快照删掉了 `current` 字段，`binding(id)` 也只借已保留的 scope——因此 session 作用域 seat 是唯一受支持的通道：宿主会把该作用域的 session id 传进注册的 `inject`。注册在这里同时让刻度条落在会话滚动容器内部，而 band 变量正是在该容器上定义、因而能被继承。

于是纵向几何完全不需要测量。唯一保留的测量值是横向左沿：会话列是一条 grid 轨道，右侧栏打开时会把它挤窄，因此无法由窗口边缘偏移推导。

## 要求

- DSH `>=0.1.1-rc.1`。本版基于 `0.1.7-rc.2` 构建与实测；它注册的 seat 及该 seat 的 session 作用域 `inject` 在 `0.1.5-rc.2` 上同样验证过。
- 纯浏览器插件：host 半区为空 cordis 插件，无需任何配置。

## 安装

```sh
# 推荐：直接从 GitHub 安装（lib 预构建产物已入库）
dsh plugin --profile web add github:lament-z/dsh-client-ui-chat-timeline

# 备选：从 npm 安装
dsh plugin --profile web add @lament_z/dsh-client-ui-chat-timeline

# 从本地 clone / 工作副本安装
dsh plugin --profile web add link:<本目录>
```

然后重启 `dsh web` 并刷新页面。刻度条出现在任意会话旁；插件存活期间宿主右侧导航条隐藏，移除插件的瞬间原样恢复。

## 说明

- 跳转与高亮复用宿主稳定契约：`data-chat-turn` 行锚点、`[data-conversation-scroll]` 滚动容器、`session.loadThrough` 与 `turnOutline` 投影。探测失败时降级为纯展示轨（或无轨），绝不做坏页面。
- 刻度条为 `position: fixed` 且按宿主布局变量定位，因此前提是会话的祖先链上没有元素建立 containing block（`transform` / `filter` / `contain`）。本版验证过的所有布局均满足该前提。
- 预览卡是有意耦合主题的唯一表面：使用宿主 tooltip 令牌实现原生灰；刻度条本体坚持系统 `Canvas`/`CanvasText` 配色。
- 失败形态是纯展示轨（或无轨），绝不会是坏页面。

## 许可

MIT
