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
    getContainer(): HTMLElement | null;
    /** Human-turn row elements in document order (user kind only). */
    getUserRows(): HTMLElement[];
    /** Index of the human turn nearest the viewport top, or -1. */
    activeIndex(): number;
    /** Scroll the given human turn into view; false when unavailable. */
    jumpTo(index: number, behavior: ScrollBehavior): boolean;
}
/**
 * Find the chat scroll container with a candidate chain.
 * 1. the explicit stable hook `[data-conversation-scroll]`;
 * 2. the closest scrollable ancestor of the flow column `[data-chat-flow]`;
 * 3. the largest scrollable element that contains human rows.
 */
export declare function findChatContainer(doc: Document): HTMLElement | null;
/** Human-turn rows inside the container (falling back to a document-wide query). */
export declare function findUserRows(container: HTMLElement | null): HTMLElement[];
/**
 * The active index: the last human row whose top edge sits above the
 * container's reading line (40px below the top edge), matching the ZCode
 * "unit at viewport top" rule; clamps to the last row at scroll bottom.
 */
export declare function computeActiveIndex(container: HTMLElement, rows: readonly HTMLElement[]): number;
/** Create the probe against a document (injectable for tests). */
export declare function probeChatDom(doc: Document): ChatDomProbe;
