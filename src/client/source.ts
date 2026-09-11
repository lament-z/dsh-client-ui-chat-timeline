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
 * 0.1.5: `binding.session.projections.faceOf('turnOutline')` is the official
 * whole-log turn index; `loadThrough(seq)` is the turn-jump pagination verb.
 */
export interface SessionsLike {
  list: ObservableLike<{ current?: string }>
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

const EMPTY_STATE: TimelineState = { sessionId: undefined, snapshot: null }

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

/**
 * Create the source. Subscribes to the sessions list, rebinds to the current
 * session's outline projection on selection change (polling while no session
 * is selected — the list store need not notify on pure selection switches),
 * and republishes a stable state whenever the outline or running flag moves.
 * @param sessions - the sessions service face (pass ctx.sessions).
 * @returns the source face.
 */
export function createTimelineSource(sessions: SessionsLike): TimelineSource {
  let state: TimelineState = EMPTY_STATE
  const listeners = new Set<() => void>()
  let subscribed = false
  let unbindSession: (() => void) | null = null
  let boundSessionId: string | undefined
  let retryTimer: ReturnType<typeof setTimeout> | undefined
  let retryAttempts = 0
  let noSessionPolls = 0

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
    if (current === undefined) {
      // 尚未选中会话：list 存储在纯选择切换时可能不通知，轮询等它出现。
      state = EMPTY_STATE
      emit()
      if (subscribed && noSessionPolls < 60) {
        noSessionPolls += 1
        retryTimer = setTimeout(rebind, 1000)
      }
      return
    }
    noSessionPolls = 0
    boundSessionId = current
    unbindSession?.()
    unbindSession = null
    let bound: ReturnType<NonNullable<SessionsLike['binding']>> | undefined
    try {
      bound = sessions.binding(current)
    } catch {
      bound = undefined
    }
    const session = bound?.session
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
        const outline = outlineFace.getSnapshot()
        const running = Boolean(session.getSnapshot()?.running)
        state = {
          sessionId: current,
          snapshot: {
            sessionId: current,
            items: Array.isArray(outline)
              ? itemsFromOutline(outline, running, {
                  userFallback: '（无文本）',
                  assistantRunning: '（运行中）',
                  assistantEmpty: '（空）',
                })
              : [],
            running,
          },
        }
      } catch {
        state = { sessionId: current, snapshot: null }
      }
      emit()
    }
    push()
    try {
      outlineFace.subscribe(push)
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
        subscribed = true
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
    jumpThrough(seq: number): Promise<void> {
      let current: string | undefined
      try {
        current = sessions.list.getSnapshot()?.current
      } catch {
        current = undefined
      }
      const session = current === undefined ? undefined : sessions.binding(current)?.session
      if (typeof session?.loadThrough !== 'function') return Promise.resolve()
      return session.loadThrough(seq).catch(() => {})
    },
  }
}

/** Build the source from the plugin client context. */
export function timelineSourceFromContext(ctx: ClientContext): TimelineSource {
  return createTimelineSource(ctx.sessions as unknown as SessionsLike)
}
