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
    getContainer(): HTMLElement | null;
    /** Index of the tick nearest the viewport top, or -1. */
    activeIndex(seqs: readonly number[]): number;
    /** Scroll the given tick's turn into view; false when unavailable. */
    jumpTo(index: number, seqs: readonly number[], behavior: ScrollBehavior): boolean;
}
/**
 * Find the chat scroll container with a candidate chain.
 * 1. the explicit stable hook `[data-conversation-scroll]`;
 * 2. the closest scrollable ancestor of the flow column `[data-chat-flow]`;
 * 3. the largest scrollable element that contains keyed flow items.
 */
export declare function findChatContainer(doc: Document): HTMLElement | null;
/**
 * The rendered row that starts the coverage of `seq`: the flow child with the
 * smallest seq ≥ the target (DOM order is virtualizer-scrambled, so scan all
 * children). When the loaded window starts after the target, this lands on
 * the window head — the closest reachable position.
 */
export declare function findSeqAnchor(doc: Document, seq: number | undefined): HTMLElement | null;
/**
 * The active index: the last tick whose anchor sits above the container's
 * reading line (40px below the top edge), matching the ZCode "unit at
 * viewport top" rule. Turns outside the loaded window count as above when
 * they precede the window and as below when they follow it; at scroll bottom
 * the last tick wins.
 */
export declare function computeActiveIndex(container: HTMLElement, doc: Document, seqs: readonly number[]): number;
/** Create the probe against a document (injectable for tests). */
export declare function probeChatDom(doc: Document): ChatDomProbe;
/**
 * 跳到第 index 个刻度的完整落点流程（官方 turn-jump 的插件侧等价物）：
 * 1. 直接滚动到锚点；2. 锚点未挂载时先 `loadThrough(seq)` 把事件窗口翻页到位；
 * 3. 会话流的虚拟视口只渲染滚动位置附近的行，按目标方向步进滚动直到锚点出现，
 * 最后精确落点。任何一步成功即返回 true。
 */
export declare function jumpToTurn(doc: Document, index: number, seqs: readonly number[], behavior: ScrollBehavior, loadThrough: ((seq: number) => Promise<void>) | undefined): Promise<boolean>;
