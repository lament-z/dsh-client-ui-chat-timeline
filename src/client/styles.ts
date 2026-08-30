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
  pointer-events: none;
  opacity: 1;
  transition: opacity 150ms ease-out;
}
.dsh-tl-nav[data-visible="false"] {
  opacity: 0;
  visibility: hidden;
}
.dsh-tl-scroll {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  width: 36px;
  max-height: calc(100% - 96px);
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
  background: Canvas;
  color: CanvasText;
  border: 1px solid color-mix(in srgb, CanvasText 15%, transparent);
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
  opacity: 0.8;
}
.dsh-tl-tip-assistant[data-kind="running"],
.dsh-tl-tip-assistant[data-kind="empty"] {
  opacity: 0.55;
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
