# dsh-client-ui-chat-timeline

DSH Web GUI 插件：在会话区左缘加一条"问题导航时间线"——每个刻度对应一条你的提问，悬停时邻近刻度涟漪式变长，弹出该轮预览卡（用户消息 + 助手回复摘要），点击跳转，滚动时高亮当前回合。

交互设计复刻自 ZCode 桌面客户端的 TurnNavigator（从其 3.10.1 渲染层 bundle 逆向；见工作区 spec `.scratch/chat-timeline/spec.md`）：10px 刻度间距、涟漪 `scaleX 2.6/1.7/1.25`、不透明度 `1/.86/.72/.58`、150ms 过渡、预览卡 320px（120ms 开 / 80ms 关）、少于 2 条提问或会话区窄于 864px 时隐藏、`prefers-reduced-motion` 时跳转改为瞬时、完整 `aria` 标注。

## 要求

- DSH `>=0.1.1-rc.1`（构建与测试基于 `0.1.1-rc.2`）。

## 安装

```sh
dsh plugin --profile web add link:<本目录>
```

然后重启 `dsh web` 并刷新页面。会话中至少有两条你的提问且窗口足够宽时，轨道出现在会话区左缘。

## 说明

- 纯浏览器插件：host 半区为空 cordis 插件。
- 数据全部走 client-runtime 公开契约（`ctx.sessions` + `ConversationSnapshot`）；跳转与滚动同步通过稳定的 `data-*` 钩子探测聊天 DOM，探测失败时降级为纯展示轨。
- 颜色跟随页面配色（`Canvas`/`CanvasText`），不耦合主题 token。

## 许可

MIT
