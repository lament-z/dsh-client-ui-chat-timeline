/**
 * Chat DOM probe — the only module allowed to know DSH's internal chat DOM.
 *
 * Contract measured on dsh 0.1.1-rc.2 (see .scratch/chat-timeline/issues/03):
 * the scroll container carries `data-conversation-scroll`; each flow row is a
 * `[data-chat-flow-kind]` element whose `user` kind marks a human turn, in the
 * same seq order as the snapshot's user nodes. Every access is defensive:
 * when detection fails the probe degrades to a no-op rail (no jump, no
 * highlight) instead of throwing.
 */

/** Read-only view of the chat DOM the rail interacts with. */
export interface ChatDomProbe {
  /** The chat scroll container, or null when not found. */
  getContainer(): HTMLElement | null
  /** Human-turn row elements in document order (user kind only). */
  getUserRows(): HTMLElement[]
  /** Index of the human turn nearest the viewport top, or -1. */
  activeIndex(): number
  /** Scroll the given human turn into view; false when unavailable. */
  jumpTo(index: number, behavior: ScrollBehavior): boolean
}

/**
 * Find the chat scroll container with a candidate chain.
 * 1. the explicit stable hook `[data-conversation-scroll]`;
 * 2. the closest scrollable ancestor of the flow column `[data-chat-flow]`;
 * 3. the largest scrollable element that contains human rows.
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
    if (element.querySelector('[data-chat-flow-kind="user"]') === null) continue
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

/** Human-turn rows inside the container (falling back to a document-wide query). */
export function findUserRows(container: HTMLElement | null): HTMLElement[] {
  const scope: ParentNode = container ?? document
  return Array.from(scope.querySelectorAll<HTMLElement>('[data-chat-flow-kind="user"]'))
}

/**
 * The active index: the last human row whose top edge sits above the
 * container's reading line (40px below the top edge), matching the ZCode
 * "unit at viewport top" rule; clamps to the last row at scroll bottom.
 */
export function computeActiveIndex(container: HTMLElement, rows: readonly HTMLElement[]): number {
  if (rows.length === 0) return -1
  const top = container.getBoundingClientRect().top + 40
  let active = 0
  for (let index = 0; index < rows.length; index += 1) {
    if (rows[index].getBoundingClientRect().top <= top) active = index
    else break
  }
  const distanceToBottom = container.scrollHeight - container.scrollTop - container.clientHeight
  if (distanceToBottom <= 4) return rows.length - 1
  return active
}

/**
 * Scroll the given human turn into view. Tries a smooth scroll first; DSH's
 * windowed conversation list programs scrollTop on scroll events, which can
 * cancel a smooth animation on the first frame — when nothing has moved after
 * a short grace period the jump falls back to an instant scroll.
 * @returns false when the container or row is unavailable.
 */
function jumpTo(index: number, behavior: ScrollBehavior): boolean {
  const container = findChatContainer(document)
  if (container === null) return false
  const row = findUserRows(container)[index]
  if (row === undefined) return false
  const delta = row.getBoundingClientRect().top - container.getBoundingClientRect().top - 12
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
    getUserRows: () => findUserRows(findChatContainer(doc)),
    activeIndex: () => {
      const container = findChatContainer(doc)
      if (container === null) return -1
      return computeActiveIndex(container, findUserRows(container))
    },
    jumpTo: (index: number, behavior: ScrollBehavior) => jumpTo(index, behavior),
  }
}
