# DSH Chat Timeline

[English](./README.md) | 简体中文

DSH Web 插件：在会话区旁加一条**问题导航刻度条**——每个刻度对应一条你的提问，悬停涟漪反馈、逐轮预览卡、点击跳转、滚动同步高亮当前轮次。交互设计复刻 ZCode 桌面客户端的 TurnNavigator；跳转机制直接复用 DSH 宿主自己的轮次导航实现，跳转行为与原生完全一致——包括跨事件翻页窗口的跳转。

## 功能

- **一问一刻度，全史可导航。** 刻度来自宿主官方 `turnOutline` 投影（session-turn-outline 域）：宿主对整份日志 fold 出的全史轮次索引，无需先把事件窗口翻页进来，会话里每条提问都可直达。
- **点击跳转，原生机制。** 落位复刻宿主 ChatView 的 `navigateToTurn`/`landOnRow`：按原生 `data-chat-turn` 锚点找到轮次行，瞬时滚动到行顶距视口顶 24px 处；轮次不在已加载窗口时，先走官方 `session.loadThrough(turn/start seq)` 翻页再落位。
- **滚动同步高亮。** 当前刻度跟随宿主自己的阅读线规则（`top + min(96, 高度*0.2)` 处命中测试，距底部 25px 内最后一刻度胜出），刻度条与内容永远一致。
- **悬停涟漪与预览卡。** 与 ZCode TurnNavigator 对齐：涟漪 `scaleX 2.6/1.7/1.25`、不透明度 `1/.86/.72/.58`、150ms 过渡；320px 预览卡延迟 120ms 弹出（80ms 关闭），展示用户提问 + 助手回复摘要；配色使用宿主原生 tooltip 令牌（灰底白字，跟随亮/暗主题）。
- **干净地接管原生导航条。** 插件存活期间，宿主内置的右侧 Turn 导航条被隐藏；卸载插件立即恢复。原生导航条出现时本刻度条必然出现——没有条数或宽度门槛。
- **与原生几何对齐。** 刻度条纵向位置遵循宿主自己的 band 公式（视口高减输入框高，读宿主 `--dsh-conversation-viewport-height` / `--dsh-composer-height` 变量），永远不会偏离原生导航条该在的位置。

## 要求

- DSH `>=0.1.1-rc.1`（构建与测试基于 `0.1.5-rc.2`）。
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
- 预览卡是有意耦合主题的唯一表面：使用宿主 tooltip 令牌实现原生灰；刻度条本体坚持系统 `Canvas`/`CanvasText` 配色。

## 许可

MIT
