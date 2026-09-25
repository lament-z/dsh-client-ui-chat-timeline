import type { Context as ClientContext } from '@deepseek-ai/cordis';
import { buildPreview, MAX_PREVIEW_CHARS, MAX_PREVIEW_PARAGRAPHS, type TimelineItem } from './directory.ts';
/**
 * The slice of the turn outline the timeline consumes — 官方 `turnOutline`
 * 投影（session-turn-outline 域）的 wire 条目：宿主对整份日志 fold 出的
 * 全史轮次索引，无需客户端翻页。
 */
export interface TurnOutlineEntryLike {
    readonly turn: number;
    readonly seq: number;
    readonly prompt?: string;
    readonly response?: string;
}
/** The slice of ConversationSnapshot the timeline consumes. */
export interface TimelineSnapshot {
    readonly sessionId: string;
    /** One tick per known turn, ascending（官方 outline 顺序）。 */
    readonly items: readonly TimelineItem[];
    /** Whether the session currently has a running turn. */
    readonly running: boolean;
}
/** State handed to React: null snapshot means "no readable session right now". */
export interface TimelineState {
    readonly sessionId: string | undefined;
    readonly snapshot: TimelineSnapshot | null;
}
/** useSyncExternalStore-compatible source face. */
export interface TimelineSource {
    subscribe(listener: () => void): () => void;
    getSnapshot(): TimelineState;
    /**
     * Page the history window back through the given turn's seq（官方
     * `loadThrough` turn-jump loader），so the turn's rows mount and the DOM
     * probe can scroll to them. No-op when the session face lacks the verb.
     */
    jumpThrough(seq: number): Promise<void>;
}
interface ObservableLike<T> {
    getSnapshot(): T;
    subscribe(listener: () => void): () => void;
}
/**
 * Structural face of ctx.sessions this module needs (kept narrow for tests).
 * 0.1.7: the session id is handed in by the host (session-scoped seat inject),
 * `binding(id)` borrows the already-retained scope, `projections.faceOf
 * ('turnOutline')` is the official whole-log turn index, and `loadThrough(seq)`
 * is the turn-jump pagination verb.
 */
export interface SessionsLike {
    binding(id: string): {
        session: ObservableLike<{
            running?: boolean;
        }> & {
            loadThrough?(seq: number): Promise<void>;
            projections?: {
                faceOf?(key: string): ObservableSnapshotLike<unknown>;
            };
        };
        eventSource: ObservableLike<unknown>;
    } | undefined;
}
/** ObservableSnapshot 的最小结构面（getSnapshot/subscribe）。 */
type ObservableSnapshotLike<T> = ObservableLike<T>;
/** Project one outline entry onto a tick (previews are host-bounded already). */
export declare function itemFromOutline(entry: TurnOutlineEntryLike, isLive: boolean, labels: {
    userFallback: string;
    assistantRunning: string;
    assistantEmpty: string;
}): TimelineItem;
/** Build the tick list from the outline plus the live running flag. */
export declare function itemsFromOutline(outline: readonly TurnOutlineEntryLike[], running: boolean, labels: {
    userFallback: string;
    assistantRunning: string;
    assistantEmpty: string;
}): TimelineItem[];
export { buildPreview, MAX_PREVIEW_CHARS, MAX_PREVIEW_PARAGRAPHS };
/**
 * Create the source for one session. The id is supplied by the host — the
 * session-scoped seat hands it to `inject` — so this no longer guesses which
 * session is open and no longer watches the sessions list: it binds straight
 * to that session's outline projection and republishes whenever the outline or
 * the running flag moves.
 *
 * A bounded retry covers the materialization window (the seat can render a
 * beat before `binding(id)` answers); after that the rail stays hidden.
 * @param sessions - the sessions service face (pass ctx.sessions).
 * @param sessionId - the session this rail belongs to.
 * @returns the source face.
 */
export declare function createTimelineSource(sessions: SessionsLike, sessionId: string): TimelineSource;
/** Build the source from the plugin client context and the seat's session id. */
export declare function timelineSourceFromContext(ctx: ClientContext, sessionId: string): TimelineSource;
