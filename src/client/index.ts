/**
 * Chat-timeline plugin — browser half. Registers the `chat-timeline` locale
 * dictionaries and a `shell.overlay` entry that renders the question
 * navigator rail beside the conversation. Export discipline: the /client
 * surface carries only what cordis loading needs plus types.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale) and its
// LocaleNamespaceMap merge table.
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the ui-layout SlotMap merge (the 'shell.overlay' hole).
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
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
  // Registration is declaration-aware via slots.inject.
  ctx.slots.inject('shell.overlay', () => {
    try {
      return ctx.slots.register({
        name: 'shell.overlay',
        id: ENTRY_ID,
        locale: NS,
        inject: () => ({ source: timelineSourceFromContext(ctx) }),
      }, TimelineRail)
    } catch {
      return () => {}
    }
  })
}

export type { TimelineRailProps } from './rail.tsx'
export type { TimelineKey } from './locales.ts'
export type { TimelineSource, TimelineSnapshot, TimelineState } from './source.ts'
