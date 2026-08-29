/**
 * Timeline source: follows the current session through the cordis services
 * face (ctx.sessions) and exposes a useSyncExternalStore-compatible read
 * face over its ConversationSnapshot. All dsh-client-runtime usage here is
 * type-only; at runtime everything is reached through the ctx services, so
 * the client bundle stays free of cross-package value imports.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'

/** The slice of ConversationSnapshot the timeline consumes. */
export interface TimelineSnapshot {
  readonly sessionId: string
  /** Ordered conversation nodes (the snapshot's legacy compatibility field). */
  readonly nodes: readonly unknown[]
  /** Whether the session currently has a running turn. */
  readonly running: boolean
}

/** State handed to React: null snapshot means "no readable session right now". */
export interface TimelineState {
  readonly sessionId: string | undefined
  readonly snapshot: TimelineSnapshot | null
}

/** useSyncExternalStore-compatible source face. */
export interface TimelineSource {
  subscribe(listener: () => void): () => void
  getSnapshot(): TimelineState
}

interface ObservableLike<T> {
  getSnapshot(): T
  subscribe(listener: () => void): () => void
}

/** Structural face of ctx.sessions this module needs (kept narrow for tests). */
export interface SessionsLike {
  readonly list: ObservableLike<{ current?: string }>
  binding(id: string): { session: ObservableLike<{ nodes?: readonly unknown[]; running?: boolean }> } | undefined
}

const EMPTY_STATE: TimelineState = { sessionId: undefined, snapshot: null }

/**
 * Create the source. Subscribes to the sessions list, rebinds to the current
 * session's snapshot feed on selection change, and republishes a stable state
 * object whenever the underlying snapshot changes.
 * @param sessions - the sessions service face (pass ctx.sessions).
 * @returns the source face.
 */
export function createTimelineSource(sessions: SessionsLike): TimelineSource {
  let state: TimelineState = EMPTY_STATE
  const listeners = new Set<() => void>()
  let unbindSession: (() => void) | null = null
  let boundSessionId: string | undefined
  let retryTimer: ReturnType<typeof setTimeout> | undefined
  let retryAttempts = 0

  const emit = () => {
    for (const listener of listeners) listener()
  }

  const rebind = () => {
    if (retryTimer !== undefined) {
      clearTimeout(retryTimer)
      retryTimer = undefined
    }
    let current: string | undefined
    try {
      current = sessions.list.getSnapshot()?.current
    } catch {
      current = undefined
    }
    if (current === boundSessionId && retryAttempts === 0) return
    boundSessionId = current
    unbindSession?.()
    unbindSession = null
    if (current === undefined) {
      state = EMPTY_STATE
      emit()
      return
    }
    let session: ObservableLike<{ nodes?: readonly unknown[]; running?: boolean }> | undefined
    try {
      session = sessions.binding(current)?.session
    } catch {
      session = undefined
    }
    if (!session) {
      // Listed but not yet scoped (cold boot): keep an empty state and retry
      // with backoff so the rail appears once the binding lands.
      state = { sessionId: current, snapshot: null }
      if (retryAttempts < 10) {
        retryAttempts += 1
        retryTimer = setTimeout(rebind, 500 * retryAttempts)
      }
      emit()
      return
    }
    retryAttempts = 0
    const push = () => {
      try {
        const snap = session.getSnapshot()
        state = {
          sessionId: current,
          snapshot: {
            sessionId: current,
            nodes: Array.isArray(snap?.nodes) ? snap.nodes : [],
            running: Boolean(snap?.running),
          },
        }
      } catch {
        state = { sessionId: current, snapshot: null }
      }
      emit()
    }
    push()
    try {
      session.subscribe(push)
      unbindSession = () => {
        // Observable faces expose no unsubscribe disposer contract here; the
        // subscription rides the plugin fiber and is torn down with it.
      }
    } catch {
      unbindSession = null
    }
  }

  return {
    subscribe(listener: () => void): () => void {
      const first = listeners.size === 0
      listeners.add(listener)
      if (first) {
        try {
          sessions.list.subscribe(rebind)
        } catch {
          // Service unavailable: the rail stays hidden, nothing throws.
        }
        rebind()
      }
      return () => {
        listeners.delete(listener)
      }
    },
    getSnapshot(): TimelineState {
      return state
    },
  }
}

/** Build the source from the plugin client context. */
export function timelineSourceFromContext(ctx: ClientContext): TimelineSource {
  return createTimelineSource(ctx.sessions as unknown as SessionsLike)
}
