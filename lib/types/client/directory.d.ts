/**
 * Timeline directory derivation — the pure core of the plugin.
 *
 * Turns the conversation snapshot's ordered node list into one tick per human
 * input (`user` / `steering`), each carrying a trimmed user preview plus the
 * assistant reply preview in one of three states (text / running / empty).
 * Preview budgeting replicates the ZCode TurnNavigator: at most two
 * paragraphs, whitespace-collapsed, truncated to 220 characters.
 *
 * No DOM, no React, no dsh runtime imports — everything here is plain data so
 * vitest can cover it without fixtures beyond plain objects.
 */
/** Minimal structural shape of a conversation node this module needs. */
export interface TimelineNodeLike {
    kind: string;
    seq: number;
    /** Unix epoch ms when present. */
    time?: number;
    /** User/steering content blocks (each `{ kind, text? }`-like). */
    content?: readonly unknown[];
    /** Assistant content blocks (each `{ kind, text? }`-like). */
    blocks?: readonly unknown[];
}
/** One tick in the timeline directory. */
export interface TimelineItem {
    /** Stable React key (`n<seq>`). */
    readonly key: string;
    /** Seq of the anchoring human node. */
    readonly seq: number;
    /** Anchor time (epoch ms); 0 when unknown. */
    readonly time: number;
    /** Trimmed human input preview. */
    readonly userPreview: string;
    /** True when the human node carried no extractable text. */
    readonly userFallback: boolean;
    /** Trimmed assistant reply preview. */
    readonly assistantPreview: string;
    /** Which assistant preview state applies. */
    readonly assistantKind: 'text' | 'running' | 'empty';
    /** True for the last tick while the session is still running. */
    readonly running: boolean;
}
/** Copy labels the derivation needs (kept out of the pure math for testability). */
export interface TimelineLabels {
    readonly userFallback: string;
    readonly assistantEmpty: string;
    readonly assistantRunning: string;
}
/** Preview budget: at most two paragraphs and 220 characters (ZCode parity). */
export declare const MAX_PREVIEW_CHARS = 220;
export declare const MAX_PREVIEW_PARAGRAPHS = 2;
/** Extract concatenated text from a ContentBlock-like list.
 *  dsh-llm content blocks switch on `type`; assistant blocks use `kind` — accept both. */
export declare function blocksText(blocks: readonly unknown[] | undefined): string;
/** Collapse each paragraph's whitespace and drop empties (ZCode u5e parity). */
export declare function collapseParagraphs(text: string, maxParagraphs: number): string[];
/** Truncate to the budget with an ellipsis, never below the floor (ZCode d5e parity). */
export declare function truncatePreview(text: string, maxChars: number, floor?: number): string;
/** Build one preview string from raw texts under the shared budget. */
export declare function buildPreview(texts: readonly string[], fallback: string): string;
/**
 * Derive the tick directory from the snapshot's ordered node list.
 * @param nodes - conversation snapshot nodes in seq order.
 * @param running - whether the session currently has a running turn.
 * @param labels - localized preview fallbacks.
 * @returns one item per human input, in order.
 */
export declare function buildTimelineItems(nodes: readonly TimelineNodeLike[], running: boolean, labels: TimelineLabels): TimelineItem[];
