/**
 * Chat DOM probe — the only module allowed to know DSH's internal chat DOM.
 *
 * Contract replicated 1:1 from the native chat view (dsh-client-ui-chat
 * 0.1.5-rc.2, ChatView):
 * - every rendered row carries `data-chat-turn="<turn>"` (plus
 *   `data-chat-anchor-key` / `data-chat-flow-key` with the node key, which is
 *   NOT seq-prefixed — never parse seqs out of flow keys);
 * - the scrollport is `row.closest('[data-conversation-scroll]')`;
 * - landing on a turn is an instant `el.scrollTop += flowTop(row, el) - 24`;
 * - a turn outside the loaded event window is paged in through the official
 *   `session.loadThrough(turn/start seq)` verb, then landed once its row
 *   renders (the native pendingJump/settle loop, plugin-side as a poll);
 * - the active turn reads the line `top + min(96, height * 0.2)` via
 *   `elementsFromPoint` hit-testing with a row-scan fallback, and the last
 *   turn wins within 25px of the scroll bottom.
 * Every access is defensive: when detection fails the probe degrades to a
 * no-op rail (no jump, no highlight) instead of throwing.
 */

/** Read-only view of the chat DOM the rail interacts with. */
export interface ChatDomProbe {
  /** The chat scroll container, or null when not found. */
  getContainer(): HTMLElement | null
  /** Index of the tick nearest the reading line, or -1. */
  activeIndex(turns: readonly (number | undefined)[]): number
}

/**
 * Find the chat scroll container with a candidate chain.
 * 1. the explicit stable hook `[data-conversation-scroll]`;
 * 2. the closest scrollable ancestor of the flow column `[data-chat-flow]`;
 * 3. the largest scrollable element that contains keyed flow items.
 */
export function findChatContainer(doc: Document): HTMLElement | null {
  const direct = doc.querySelector<HTMLElement>('[data-conversation-scroll]')
  if (direct !== null) return direct
  const flow = doc.querySelector<HTMLElement>('[data-chat-flow]')
  const ancestor = flow !== null ? scrollableAncestor(flow) : null
  if (ancestor !== null) return ancestor
  let best: HTMLElement | null = null
  let bestHeight = 0
  for (const element of Array.from(doc.querySelectorAll<HTMLElement>('*'))) {
    if (!isScrollable(element)) continue
    if (element.querySelector('[data-chat-turn]') === null) continue
    const height = element.clientHeight
    if (height > bestHeight) {
      best = element
      bestHeight = height
    }
  }
  return best
}

function isScrollable(element: HTMLElement): boolean {
  const style = element.ownerDocument.defaultView?.getComputedStyle(element)
  if (style === undefined) return false
  if (!/(auto|scroll)/.test(style.overflowY)) return false
  return element.scrollHeight > element.clientHeight + 40 && element.clientHeight > 200
}

function scrollableAncestor(element: HTMLElement): HTMLElement | null {
  let node: HTMLElement | null = element
  while (node !== null) {
    if (isScrollable(node)) return node
    node = node.parentElement
  }
  return null
}

/**
 * The rendered row of `turn` (native anchor attribute `data-chat-turn`),
 * skipping hidden rows like the native `anchorElement`. Scoped to the chat
 * container when it is already located (native scopes to its own list), so a
 * stray second mount cannot hijack the anchor. Null when the turn's events
 * are not in the loaded window yet.
 */
export function findTurnRow(doc: Document, turn: number | undefined): HTMLElement | null {
  if (turn === undefined || !Number.isSafeInteger(turn) || turn < 0) return null
  const scope: ParentNode = findChatContainer(doc) ?? doc
  return scope.querySelector<HTMLElement>(`[data-chat-turn="${turn}"]:not([hidden])`)
}

/** Native `scrollerOf`: the conversation scrollport owning the row. */
function scrollerOfRow(doc: Document, row: HTMLElement): HTMLElement | null {
  return row.closest<HTMLElement>('[data-conversation-scroll]') ?? findChatContainer(doc)
}

/** Row position in scrollport coordinates (native `flowTop`). */
function flowTop(row: HTMLElement, scroller: HTMLElement): number {
  return row.getBoundingClientRect().top - scroller.getBoundingClientRect().top
}

/**
 * Native `landOnRow`: instant scroll so the row's top sits 24px below the
 * scrollport top. Returns false when the scrollport cannot be resolved.
 */
export function landOnRow(doc: Document, row: HTMLElement): boolean {
  const el = scrollerOfRow(doc, row)
  if (el === null) return false
  el.scrollTop += flowTop(row, el) - 24
  return true
}

/**
 * Native `turnAtLine`: the turn owning the row at a scrollport line.
 * Hit-tests the line first (elementsFromPoint at the container's horizontal
 * center) and falls back to one row scan when layout cannot answer (jsdom,
 * pre-paint). Returns null when no loaded row covers the line.
 */
export function turnAtLine(doc: Document, container: HTMLElement, line: number): number | null {
  const content = container.getBoundingClientRect()
  if (typeof doc.elementsFromPoint === 'function' && content.width > 0) {
    for (const element of doc.elementsFromPoint(content.left + content.width / 2, line)) {
      const row = element instanceof HTMLElement ? element.closest<HTMLElement>('[data-chat-turn]') : null
      const turn = Number(row?.dataset.chatTurn)
      if (row !== null && container.contains(row) && Number.isSafeInteger(turn)) return turn
    }
  }
  let found: number | null = null
  for (const row of Array.from(container.querySelectorAll<HTMLElement>('[data-chat-turn]'))) {
    if (row.getBoundingClientRect().top > line) break
    const turn = Number(row.dataset.chatTurn)
    if (Number.isSafeInteger(turn)) found = turn
  }
  return found
}

/**
 * The active index (native `syncActiveTurn`): within 25px of the scroll
 * bottom the last tick wins; otherwise the reading line sits at
 * `top + min(96, height * 0.2)` and the active tick is the last one whose
 * turn does not exceed the turn read at that line. When the line covers no
 * loaded row, earlier ticks outside the window count as above the viewport
 * (the window head's predecessor is active, matching 0.1.1 parity).
 */
export function computeActiveIndex(
  container: HTMLElement,
  doc: Document,
  turns: readonly (number | undefined)[],
): number {
  if (turns.length === 0) return -1
  if (container.scrollHeight - container.scrollTop - container.clientHeight <= 25) {
    return turns.length - 1
  }
  const firstDefined = turns.findIndex((turn) => turn !== undefined)
  if (firstDefined === -1) return -1
  const reading = container.getBoundingClientRect().top + Math.min(96, container.clientHeight * 0.2)
  const readTurn = turnAtLine(doc, container, reading)
  let active = -1
  if (readTurn !== null) {
    for (let index = 0; index < turns.length; index += 1) {
      const turn = turns[index]
      if (turn === undefined || turn > readTurn) continue
      active = index
    }
  }
  if (active !== -1) return active
  return firstDefined > 0 ? firstDefined - 1 : 0
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/** Landing poll budget after `loadThrough` (native settles via its effects; 5s here). */
const LAND_POLL_ATTEMPTS = 20
const LAND_POLL_INTERVAL_MS = 250

/**
 * 跳到第 index 个刻度的完整落点流程（原生 navigateToTurn 的插件侧等价物）：
 * 1. 按 `data-chat-turn` 找行并原生落位（瞬时、行顶距视口顶 24px）；
 * 2. 行未挂载时先 `loadThrough(turn/start 的 seq)` 把事件窗口翻页到位；
 * 3. 轮询等行渲染后落位。任何一步成功即返回 true。
 */
export async function jumpToTurn(
  doc: Document,
  index: number,
  turns: readonly (number | undefined)[],
  seqs: readonly number[],
  loadThrough: ((seq: number) => Promise<void>) | undefined,
): Promise<boolean> {
  const turn = turns[index]
  if (turn === undefined) return false
  if (landOnRowByTurn(doc, turn)) return true
  const seq = seqs[index]
  if (seq !== undefined && loadThrough !== undefined) {
    try {
      await loadThrough(seq)
    } catch {
      // 翻页失败仍然轮询（窗口可能已部分就位）。
    }
  }
  for (let attempt = 0; attempt < LAND_POLL_ATTEMPTS; attempt += 1) {
    await sleep(LAND_POLL_INTERVAL_MS)
    if (landOnRowByTurn(doc, turn)) return true
  }
  return false
}

function landOnRowByTurn(doc: Document, turn: number): boolean {
  const row = findTurnRow(doc, turn)
  if (row === null) return false
  return landOnRow(doc, row)
}

/** Create the probe against a document (injectable for tests). */
export function probeChatDom(doc: Document): ChatDomProbe {
  return {
    getContainer: () => findChatContainer(doc),
    activeIndex: (turns) => {
      const container = findChatContainer(doc)
      if (container === null) return -1
      return computeActiveIndex(container, doc, turns)
    },
  }
}
