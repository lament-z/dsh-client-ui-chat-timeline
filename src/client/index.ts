/**
 * Chat-timeline plugin — browser half. Registers the `chat-timeline` locale
 * dictionaries and a `shell.overlay` entry that renders the question
 * navigator rail beside the conversation. Export discipline: the /client
 * surface carries only what cordis loading needs plus types.
 */
// DSH-0.1.2-A1-25: dsh-client-runtime 包已删除，ClientContext 即 cordis Context。
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the locale plugin's Context merge (ctx.locale) and its
// LocaleNamespaceMap merge table.
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the ui-layout SlotMap merge (the 'shell.overlay' hole).
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
// Type-only: pulls the ui-conversation SlotMap merge (the
// 'conversation.input.overlay' hole the rail registers into).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// DSH-0.1.5-A1-14/A2-13: ctx.slots 的 Context 合并自 ui-renderer 的 client 入口。
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import { TimelineRail } from './rail.tsx'
import { timelineSourceFromContext } from './source.ts'
import { en, zh, type TimelineKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Chat-timeline surface copy. */
    'chat-timeline': TimelineKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'chat-timeline'

/**
 * Session-scoped seat the rail occupies.
 *
 * DSH 0.1.7 moved "which session is open" out of the sessions service: the list
 * snapshot no longer carries `current`, `binding(id)` only borrows an already
 * retained scope, and session-controller states outright that view selection
 * stays outside the Controller. The only supported way to learn the open
 * session is a session-scoped seat, whose `inject` receives the scope
 * binding's key — the session id. A root-scope seat (shell.overlay) cannot be
 * told, which is why the rail no longer lives there.
 *
 * `conversation.input.overlay` is rendered for every open session, and unlike
 * `conversation.view` it is not enumerated into the conversation's view tabs.
 * It also sits inside the conversation scroller, so the host's geometry
 * variables (--dsh-conversation-viewport-height / --dsh-composer-height)
 * inherit to the rail.
 */
const SEAT = 'conversation.input.overlay'

/** Unique occupant id inside the shared conversation.input.overlay list slot. */
const ENTRY_ID = 'chat-timeline'

/** Services required by this plugin. */
export const inject = ['slots', 'locale', 'sessions']

/**
 * Register the timeline surface.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => {
    try {
      return ctx.locale.register(NS, { zh, en })
    } catch {
      return () => {}
    }
  }, 'chat-timeline: dictionaries')

  // The rail is a frame-wide overlay, but it is registered on a session-scoped
  // seat: that is the only channel through which 0.1.7 hands out the open
  // session id. Registration is declaration-aware via slots.inject. 注册失败
  // 降级为一条 console 错误（不抛进 loader，也不静默——留诊断线索）。
  ctx.slots.inject(SEAT, () => {
    try {
      return ctx.slots.register({
        name: SEAT,
        id: ENTRY_ID,
        order: 0,
        locale: NS,
        // Session-scoped registrations receive the scope binding's key, i.e.
        // the session id (renderer runInject pushes binding.key).
        inject: (sessionId: string) => ({
          sessionId,
          source: timelineSourceFromContext(ctx, sessionId),
        }),
      }, TimelineRail)
    } catch (err) {
      console.error(`chat-timeline: ${SEAT} register failed:`, err)
      return () => {}
    }
  })
}

export type { TimelineRailProps } from './rail.tsx'
export type { TimelineKey } from './locales.ts'
export type { TimelineSource, TimelineSnapshot, TimelineState } from './source.ts'
