/**
 * Timeline source: follows the current session through the cordis services
 * face (ctx.sessions) and exposes a useSyncExternalStore-compatible read
 * face over its ConversationSnapshot. All dsh-client-runtime usage here is
 * type-only; at runtime everything is reached through the ctx services, so
 * the client bundle stays free of cross-package value imports.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
/** The slice of ConversationSnapshot the timeline consumes. */
export interface TimelineSnapshot {
    readonly sessionId: string;
    /** Ordered conversation nodes (the snapshot's legacy compatibility field). */
    readonly nodes: readonly unknown[];
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
}
interface ObservableLike<T> {
    getSnapshot(): T;
    subscribe(listener: () => void): () => void;
}
/** Structural face of ctx.sessions this module needs (kept narrow for tests). */
export interface SessionsLike {
    readonly list: ObservableLike<{
        current?: string;
    }>;
    binding(id: string): {
        session: ObservableLike<{
            nodes?: readonly unknown[];
            running?: boolean;
        }>;
    } | undefined;
}
/**
 * Create the source. Subscribes to the sessions list, rebinds to the current
 * session's snapshot feed on selection change, and republishes a stable state
 * object whenever the underlying snapshot changes.
 * @param sessions - the sessions service face (pass ctx.sessions).
 * @returns the source face.
 */
export declare function createTimelineSource(sessions: SessionsLike): TimelineSource;
/** Build the source from the plugin client context. */
export declare function timelineSourceFromContext(ctx: ClientContext): TimelineSource;
export {};
