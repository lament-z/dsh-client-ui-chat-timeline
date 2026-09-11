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

/** Unique occupant id inside the shared shell.overlay list slot. */
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

  // The rail floats over the conversation via the frame-wide additive seat.
  // Registration is declaration-aware via slots.inject. 注册失败降级为一条
  // console 错误（不抛进 loader，也不静默——留诊断线索）。
  ctx.slots.inject('shell.overlay', () => {
    try {
      return ctx.slots.register({
        name: 'shell.overlay',
        id: ENTRY_ID,
        locale: NS,
        inject: () => ({ source: timelineSourceFromContext(ctx) }),
      }, TimelineRail)
    } catch (err) {
      console.error('chat-timeline: shell.overlay register failed:', err)
      return () => {}
    }
  })
}

export type { TimelineRailProps } from './rail.tsx'
export type { TimelineKey } from './locales.ts'
export type { TimelineSource, TimelineSnapshot, TimelineState } from './source.ts'
