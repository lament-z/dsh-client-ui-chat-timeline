/**
 * Chat DOM probe — the only module allowed to know DSH's internal chat DOM.
 *
 * Contract measured on dsh 0.1.5-rc.2: the scroll container carries
 * `data-conversation-scroll`, the flow column carries `data-chat-flow`, and
 * every rendered row is keyed `data-chat-flow-key="<seq>:<kind><id>"` — the
 * prefix is the row's durable event **seq**, not the turn number, and the
 * virtualizer may order DOM children independently of visual position.
 * 0.1.2+ folds each completed turn into a Q&A card, so human rows no longer
 * render as standalone `[data-chat-flow-kind="user"]` elements; tick anchors
 * resolve through the seq prefix against the turnOutline projection's
 * `turn/start` seqs. Every access is defensive: when detection fails the
 * probe degrades to a no-op rail (no jump, no highlight) instead of throwing.
 */

/** Read-only view of the chat DOM the rail interacts with. */
export interface ChatDomProbe {
  /** The chat scroll container, or null when not found. */
  getContainer(): HTMLElement | null
  /** Index of the tick nearest the viewport top, or -1. */
  activeIndex(seqs: readonly number[]): number
  /** Scroll the given tick's turn into view; false when unavailable. */
  jumpTo(index: number, seqs: readonly number[], behavior: ScrollBehavior): boolean
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
    if (element.querySelector('[data-chat-flow-key]') === null) continue
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

/** Parse the seq prefix of a `data-chat-flow-key` (`"<seq>:<kind><id>"`), or null. */
function seqOfKey(key: string | null): number | null {
  if (key === null) return null
  const split = key.indexOf(':')
  if (split <= 0) return null
  const seq = Number(key.slice(0, split))
  return Number.isSafeInteger(seq) && seq >= 0 ? seq : null
}

/**
 * The rendered row that starts the coverage of `seq`: the flow child with the
 * smallest seq ≥ the target (DOM order is virtualizer-scrambled, so scan all
 * children). When the loaded window starts after the target, this lands on
 * the window head — the closest reachable position.
 */
export function findSeqAnchor(doc: Document, seq: number | undefined): HTMLElement | null {
  if (seq === undefined || !Number.isSafeInteger(seq)) return null
  const flow = doc.querySelector<HTMLElement>('[data-chat-flow]')
  const scope: ParentNode = flow ?? doc
  let best: HTMLElement | null = null
  let bestSeq = Number.POSITIVE_INFINITY
  for (const child of Array.from(scope.querySelectorAll<HTMLElement>('[data-chat-flow-key]'))) {
    const childSeq = seqOfKey(child.getAttribute('data-chat-flow-key'))
    if (childSeq === null || childSeq < seq) continue
    if (childSeq < bestSeq) {
      best = child
      bestSeq = childSeq
    }
  }
  return best
}

/**
 * The active index: the last tick whose anchor sits above the container's
 * reading line (40px below the top edge), matching the ZCode "unit at
 * viewport top" rule. Turns outside the loaded window count as above when
 * they precede the window and as below when they follow it; at scroll bottom
 * the last tick wins.
 */
export function computeActiveIndex(
  container: HTMLElement,
  doc: Document,
  seqs: readonly number[],
): number {
  if (seqs.length === 0) return -1
  const top = container.getBoundingClientRect().top + 40
  let active = -1
  let firstAnchored = -1
  for (let index = 0; index < seqs.length; index += 1) {
    const anchor = findSeqAnchor(doc, seqs[index])
    if (anchor === null) continue
    if (firstAnchored === -1) firstAnchored = index
    if (anchor.getBoundingClientRect().top <= top) active = index
  }
  // Nothing above the line yet: anchor-less earlier ticks (window starts after
  // them) sit above the viewport by definition, otherwise default to the first
  // anchored tick (0.1.1 parity: the topmost visible turn is the active one).
  if (active === -1) {
    if (firstAnchored === -1) return -1
    return firstAnchored > 0 ? firstAnchored - 1 : 0
  }
  const distanceToBottom = container.scrollHeight - container.scrollTop - container.clientHeight
  if (distanceToBottom <= 4) return seqs.length - 1
  return active
}

/**
 * Scroll the given tick's turn into view. Tries a smooth scroll first; DSH's
 * windowed conversation list programs scrollTop on scroll events, which can
 * cancel a smooth animation on the first frame — when nothing has moved after
 * a short grace period the jump falls back to an instant scroll.
 * @returns false when the container or the turn's anchor is unavailable —
 * the caller is expected to page the turn in (official `loadThrough`) and
 * retry, so no window-edge guessing happens here.
 */
function jumpTo(index: number, seqs: readonly number[], behavior: ScrollBehavior): boolean {
  const container = findChatContainer(document)
  if (container === null) return false
  const anchor = findSeqAnchor(document, seqs[index])
  if (anchor === null) return false
  const delta = anchor.getBoundingClientRect().top - container.getBoundingClientRect().top - 12
  const target = container.scrollTop + delta
  if (behavior === 'auto') {
    container.scrollTo({ top: target, behavior: 'auto' })
    return true
  }
  const startedAt = container.scrollTop
  container.scrollTo({ top: target, behavior: 'smooth' })
  window.setTimeout(() => {
    // Still within a few pixels of the start after the grace period: the
    // smooth animation was cancelled — land instantly instead.
    if (Math.abs(container.scrollTop - startedAt) < 4) {
      container.scrollTo({ top: target, behavior: 'auto' })
    }
  }, 700)
  return true
}

/** Create the probe against a document (injectable for tests). */
export function probeChatDom(doc: Document): ChatDomProbe {
  return {
    getContainer: () => findChatContainer(doc),
    activeIndex: (seqs) => {
      const container = findChatContainer(doc)
      if (container === null) return -1
      return computeActiveIndex(container, doc, seqs)
    },
    jumpTo: (index, seqs, behavior) => jumpTo(index, seqs, behavior),
  }
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * 跳到第 index 个刻度的完整落点流程（官方 turn-jump 的插件侧等价物）：
 * 1. 直接滚动到锚点；2. 锚点未挂载时先 `loadThrough(seq)` 把事件窗口翻页到位；
 * 3. 会话流的虚拟视口只渲染滚动位置附近的行，按目标方向步进滚动直到锚点出现，
 * 最后精确落点。任何一步成功即返回 true。
 */
export async function jumpToTurn(
  doc: Document,
  index: number,
  seqs: readonly number[],
  behavior: ScrollBehavior,
  loadThrough: ((seq: number) => Promise<void>) | undefined,
): Promise<boolean> {
  const container = findChatContainer(doc)
  if (container === null) return false
  if (jumpTo(index, seqs, behavior)) return true
  const seq = seqs[index]
  if (seq !== undefined && loadThrough !== undefined) {
    try {
      await loadThrough(seq)
    } catch {
      // 翻页失败仍然尝试走查（窗口可能已部分就位）。
    }
  }
  for (let attempt = 0; attempt < 14; attempt += 1) {
    if (jumpTo(index, seqs, 'auto')) return true
    const anchored: number[] = []
    seqs.forEach((rowSeq, i) => {
      if (findSeqAnchor(doc, rowSeq) !== null) anchored.push(i)
    })
    if (anchored.length === 0) {
      container.scrollTop = 0
    } else if (index < anchored[0]) {
      container.scrollTop = Math.max(0, container.scrollTop - 4000)
    } else if (index > anchored[anchored.length - 1]) {
      container.scrollTop = container.scrollHeight
    } else {
      // 目标夹在已锚定轮次之间：朝最近的一侧步进。
      const below = [...anchored].reverse().find((i) => i < index)
      const above = anchored.find((i) => i > index)
      const towardAbove = above !== undefined && (below === undefined || index - below >= above - index)
      container.scrollTop += towardAbove ? -4000 : 4000
    }
    await sleep(350)
  }
  return jumpTo(index, seqs, 'auto')
}
