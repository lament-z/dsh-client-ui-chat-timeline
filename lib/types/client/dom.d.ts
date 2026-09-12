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
    getContainer(): HTMLElement | null;
    /** Index of the tick nearest the reading line, or -1. */
    activeIndex(turns: readonly (number | undefined)[]): number;
}
/**
 * Find the chat scroll container with a candidate chain.
 * 1. the explicit stable hook `[data-conversation-scroll]`;
 * 2. the closest scrollable ancestor of the flow column `[data-chat-flow]`;
 * 3. the largest scrollable element that contains keyed flow items.
 */
export declare function findChatContainer(doc: Document): HTMLElement | null;
/**
 * The rendered row of `turn` (native anchor attribute `data-chat-turn`),
 * skipping hidden rows like the native `anchorElement`. Scoped to the chat
 * container when it is already located (native scopes to its own list), so a
 * stray second mount cannot hijack the anchor. Null when the turn's events
 * are not in the loaded window yet.
 */
export declare function findTurnRow(doc: Document, turn: number | undefined): HTMLElement | null;
/**
 * Native `landOnRow`: instant scroll so the row's top sits 24px below the
 * scrollport top. Returns false when the scrollport cannot be resolved.
 */
export declare function landOnRow(doc: Document, row: HTMLElement): boolean;
/**
 * Native `turnAtLine`: the turn owning the row at a scrollport line.
 * Hit-tests the line first (elementsFromPoint at the container's horizontal
 * center) and falls back to one row scan when layout cannot answer (jsdom,
 * pre-paint). Returns null when no loaded row covers the line.
 */
export declare function turnAtLine(doc: Document, container: HTMLElement, line: number): number | null;
/**
 * The active index (native `syncActiveTurn`): within 25px of the scroll
 * bottom the last tick wins; otherwise the reading line sits at
 * `top + min(96, height * 0.2)` and the active tick is the last one whose
 * turn does not exceed the turn read at that line. When the line covers no
 * loaded row, earlier ticks outside the window count as above the viewport
 * (the window head's predecessor is active, matching 0.1.1 parity).
 */
export declare function computeActiveIndex(container: HTMLElement, doc: Document, turns: readonly (number | undefined)[]): number;
/**
 * 跳到第 index 个刻度的完整落点流程（原生 navigateToTurn 的插件侧等价物）：
 * 1. 按 `data-chat-turn` 找行并原生落位（瞬时、行顶距视口顶 24px）；
 * 2. 行未挂载时先 `loadThrough(turn/start 的 seq)` 把事件窗口翻页到位；
 * 3. 轮询等行渲染后落位。任何一步成功即返回 true。
 */
export declare function jumpToTurn(doc: Document, index: number, turns: readonly (number | undefined)[], seqs: readonly number[], loadThrough: ((seq: number) => Promise<void>) | undefined): Promise<boolean>;
/** Create the probe against a document (injectable for tests). */
export declare function probeChatDom(doc: Document): ChatDomProbe;
