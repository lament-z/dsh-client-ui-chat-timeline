/**
 * Stylesheet for the chat-timeline rail, injected once as a
 * `<style data-plugin-css="chat-timeline">` tag. All classes carry the
 * `dsh-tl-` prefix; colors use the CSS system colors Canvas/CanvasText so the
 * rail follows the app's color-scheme without reaching into DSH theme tokens.
 * Visual constants replicate the ZCode TurnNavigator (spec section 2.2).
 */
export const TIMELINE_STYLES = `
.dsh-tl-nav {
  position: fixed;
  z-index: 10;
  width: 48px;
  /* 水平：会话列左沿，由 rail 写入 --dsh-tl-left。这是唯一保留的测量值——
     列是 grid 轨道，右侧栏打开时会被挤压，不贴窗口右沿，无法由窗口宽度推导。 */
  left: var(--dsh-tl-left, 0px);
  /* 垂直：原生 TurnNavigator 的 band 模型（eGxaPq_frame 的 --turn-rail-band）。
     会话可视带 = 视口高 − 输入框高；其中点在视口坐标下为
       100dvh − (会话可视高 + 输入框高) / 2
     两个变量由宿主写在滚动容器上，本 seat 在滚动容器内可直接继承，故整个垂直
     几何是纯 CSS：不做测量，也不依赖原生 nav 是否存在于 DOM。 */
  --dsh-tl-band: calc(var(--dsh-conversation-viewport-height, 100dvh) - var(--dsh-composer-height, 152px));
  top: calc(100dvh - (var(--dsh-conversation-viewport-height, 100dvh) + var(--dsh-composer-height, 152px)) / 2);
  transform: translateY(-50%);
  pointer-events: none;
  opacity: 1;
  transition: opacity 150ms ease-out;
}
.dsh-tl-nav[data-visible="false"] {
  opacity: 0;
  visibility: hidden;
}
.dsh-tl-scroll {
  position: relative;
  left: 12px;
  width: 36px;
  /* 原生 frame 的高度上限：band − 64px，再夹到 420px。 */
  max-height: min(max(0px, calc(var(--dsh-tl-band) - 64px)), 420px);
  overflow-x: hidden;
  overflow-y: auto;
  padding-block: 4px;
  pointer-events: auto;
  scrollbar-width: none;
  color: CanvasText;
}
.dsh-tl-scroll::-webkit-scrollbar {
  display: none;
}
.dsh-tl-track {
  position: relative;
  width: 36px;
}
.dsh-tl-slot {
  position: absolute;
  left: 0;
  top: 0;
  height: 10px;
  width: 36px;
  padding: 0;
  border: 0;
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  border-radius: 2px;
  cursor: pointer;
}
.dsh-tl-slot:focus-visible {
  outline: 2px solid CanvasText;
  outline-offset: 2px;
}
.dsh-tl-tick {
  display: block;
  height: 2px;
  width: 12px;
  border-radius: 999px;
  background: currentColor;
  transform-origin: left center;
  transition: height 150ms ease-out, opacity 150ms ease-out, transform 150ms ease-out, background-color 150ms ease-out;
}
@media (prefers-reduced-motion: reduce) {
  .dsh-tl-nav,
  .dsh-tl-tick {
    transition: none;
  }
}
.dsh-tl-tip {
  position: fixed;
  z-index: 60;
  width: 320px;
  max-width: calc(100vw - 2rem);
  padding: 12px;
  border-radius: 10px;
  /* 原生 tooltip 配对（dsh-web-frontend _bubble_）：灰底 + 静态白字，
     主题切换由别名变量跟随；灰底与页面背景天然分层。 */
  background: var(--dsw-alias-tooltip-bg, #43454a);
  color: var(--dsw-static-neutral-bluish-00, #fff);
  border: none;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
  pointer-events: none;
}
.dsh-tl-tip-user {
  margin: 0;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
  white-space: pre-line;
  font-size: 13px;
  line-height: 20px;
  font-weight: 500;
}
.dsh-tl-tip-assistant {
  margin: 8px 0 0;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  overflow: hidden;
  white-space: pre-line;
  font-size: 13px;
  line-height: 20px;
  color: var(--dsw-static-neutral-bluish-300, rgba(255, 255, 255, 0.8));
}
.dsh-tl-tip-assistant[data-kind="running"],
.dsh-tl-tip-assistant[data-kind="empty"] {
  color: var(--dsw-static-neutral-bluish-400, rgba(255, 255, 255, 0.55));
}
/* 插件完全接管原生右侧 Turn 导航条：本样式表只随插件存在，插件卸载时
   removeStyles 移除标签，原生导航条立即恢复。aria-label 跟随宿主语言
   （英文 Turn navigation / 中文 轮次导航），两个都要盖住。 */
nav[aria-label='Turn navigation'],
nav[aria-label='轮次导航'] {
  display: none !important;
}
`

/** Inject the stylesheet once per document. */
export function ensureStyles(doc: Document): void {
  const tagId = 'chat-timeline'
  if (doc.querySelector('style[data-plugin-css="chat-timeline"]') !== null) return
  const tag = doc.createElement('style')
  tag.dataset.plugin = '@lament_z/dsh-client-ui-chat-timeline'
  tag.dataset.pluginCss = tagId
  tag.textContent = TIMELINE_STYLES
  doc.head.appendChild(tag)
}

/** Remove the stylesheet (plugin teardown): restores the native turn navigator. */
export function removeStyles(doc: Document): void {
  doc.querySelector('style[data-plugin-css="chat-timeline"]')?.remove()
}
