/**
 * Timeline source: follows the current session through the cordis services
 * face (ctx.sessions) and exposes a useSyncExternalStore-compatible read
 * face over the host-computed turn outline. Client context usage here is
 * type-only; at runtime everything is reached through the ctx services, so
 * the client bundle stays free of cross-package value imports.
 */
// DSH-0.1.2-A1-25: dsh-client-runtime 包已删除，ClientContext 即 cordis Context。
// ctx.sessions 的 Context 合并自 session-controller 的 client 入口（A1-25 迁移表）。
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { buildPreview, MAX_PREVIEW_CHARS, MAX_PREVIEW_PARAGRAPHS, type TimelineItem } from './directory.ts'

/**
 * The slice of the turn outline the timeline consumes — 官方 `turnOutline`
 * 投影（session-turn-outline 域）的 wire 条目：宿主对整份日志 fold 出的
 * 全史轮次索引，无需客户端翻页。
 */
export interface TurnOutlineEntryLike {
  readonly turn: number
  readonly seq: number
  readonly prompt?: string
  readonly response?: string
}

/** The slice of ConversationSnapshot the timeline consumes. */
export interface TimelineSnapshot {
  readonly sessionId: string
  /** One tick per known turn, ascending（官方 outline 顺序）。 */
  readonly items: readonly TimelineItem[]
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
  /**
   * Page the history window back through the given turn's seq（官方
   * `loadThrough` turn-jump loader），so the turn's rows mount and the DOM
   * probe can scroll to them. No-op when the session face lacks the verb.
   */
  jumpThrough(seq: number): Promise<void>
}

interface ObservableLike<T> {
  getSnapshot(): T
  subscribe(listener: () => void): () => void
}

/**
 * Structural face of ctx.sessions this module needs (kept narrow for tests).
 * 0.1.7: the session id is handed in by the host (session-scoped seat inject),
 * `binding(id)` borrows the already-retained scope, `projections.faceOf
 * ('turnOutline')` is the official whole-log turn index, and `loadThrough(seq)`
 * is the turn-jump pagination verb.
 */
export interface SessionsLike {
  binding(
    id: string,
  ): {
    session: ObservableLike<{ running?: boolean }> & {
      loadThrough?(seq: number): Promise<void>
      projections?: {
        faceOf?(key: string): ObservableSnapshotLike<unknown>
      }
    }
    eventSource: ObservableLike<unknown>
  } | undefined
}

/** ObservableSnapshot 的最小结构面（getSnapshot/subscribe）。 */
type ObservableSnapshotLike<T> = ObservableLike<T>

/** Project one outline entry onto a tick (previews are host-bounded already). */
export function itemFromOutline(
  entry: TurnOutlineEntryLike,
  isLive: boolean,
  labels: { userFallback: string; assistantRunning: string; assistantEmpty: string },
): TimelineItem {
  const prompt = typeof entry.prompt === 'string' ? entry.prompt : ''
  const response = typeof entry.response === 'string' ? entry.response : ''
  const assistantKind: TimelineItem['assistantKind'] = response
    ? 'text'
    : isLive
      ? 'running'
      : 'empty'
  return {
    key: `t${entry.turn}`,
    seq: entry.seq,
    time: 0,
    turn: entry.turn,
    userPreview: prompt || labels.userFallback,
    userFallback: !prompt,
    assistantPreview: response || (isLive ? labels.assistantRunning : labels.assistantEmpty),
    assistantKind,
    running: isLive,
  }
}

/** Build the tick list from the outline plus the live running flag. */
export function itemsFromOutline(
  outline: readonly TurnOutlineEntryLike[],
  running: boolean,
  labels: { userFallback: string; assistantRunning: string; assistantEmpty: string },
): TimelineItem[] {
  const last = outline.length - 1
  return outline.map((entry, index) =>
    itemFromOutline(entry, running && index === last, labels),
  )
}

// 保留目录数学的导出面（rail 不再走 nodes 路径，preview 预算常量仍被引用）。
export { buildPreview, MAX_PREVIEW_CHARS, MAX_PREVIEW_PARAGRAPHS }

/** Fallback preview labels when the outline entry carries no text. */
const PREVIEW_LABELS = {
  userFallback: '（无文本）',
  assistantRunning: '（运行中）',
  assistantEmpty: '（空）',
} as const

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
export function createTimelineSource(sessions: SessionsLike, sessionId: string): TimelineSource {
  let state: TimelineState = { sessionId, snapshot: null }
  const listeners = new Set<() => void>()
  let subscribed = false
  let retryTimer: ReturnType<typeof setTimeout> | undefined
  let retryAttempts = 0

  const emit = () => {
    for (const listener of listeners) listener()
  }

  const readBinding = () => {
    try {
      return sessions.binding(sessionId)
    } catch {
      return undefined
    }
  }

  const bind = () => {
    if (retryTimer !== undefined) {
      clearTimeout(retryTimer)
      retryTimer = undefined
    }
    const session = readBinding()?.session
    const outlineFace = (() => {
      try {
        return session?.projections?.faceOf?.('turnOutline') as
          | ObservableLike<readonly TurnOutlineEntryLike[]>
          | undefined
      } catch {
        return undefined
      }
    })()
    if (!session || !outlineFace) {
      // Scope still materializing: keep an empty state and retry with backoff
      // so the rail appears once the binding lands.
      state = { sessionId, snapshot: null }
      emit()
      if (subscribed && retryAttempts < 10) {
        retryAttempts += 1
        retryTimer = setTimeout(bind, 250 * retryAttempts)
      }
      return
    }
    retryAttempts = 0
    const push = () => {
      try {
        const outline = outlineFace.getSnapshot()
        const running = Boolean(session.getSnapshot()?.running)
        state = {
          sessionId,
          snapshot: {
            sessionId,
            items: Array.isArray(outline)
              ? itemsFromOutline(outline, running, PREVIEW_LABELS)
              : [],
            running,
          },
        }
      } catch {
        state = { sessionId, snapshot: null }
      }
      emit()
    }
    push()
    try {
      outlineFace.subscribe(push)
      session.subscribe(push)
    } catch {
      // Observable faces expose no unsubscribe disposer contract here; the
      // subscription rides the plugin fiber and is torn down with it.
    }
  }

  return {
    subscribe(listener: () => void): () => void {
      const first = listeners.size === 0
      listeners.add(listener)
      if (first) {
        subscribed = true
        bind()
      }
      return () => {
        listeners.delete(listener)
      }
    },
    getSnapshot(): TimelineState {
      return state
    },
    jumpThrough(seq: number): Promise<void> {
      const session = readBinding()?.session
      if (typeof session?.loadThrough !== 'function') return Promise.resolve()
      return session.loadThrough(seq).catch(() => {})
    },
  }
}

/** Build the source from the plugin client context and the seat's session id. */
export function timelineSourceFromContext(ctx: ClientContext, sessionId: string): TimelineSource {
  return createTimelineSource(ctx.sessions as unknown as SessionsLike, sessionId)
}
