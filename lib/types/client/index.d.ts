/**
 * Chat-timeline plugin — browser half. Registers the `chat-timeline` locale
 * dictionaries and a `shell.overlay` entry that renders the question
 * navigator rail beside the conversation. Export discipline: the /client
 * surface carries only what cordis loading needs plus types.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
import { type TimelineKey } from './locales.ts';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        /** Chat-timeline surface copy. */
        'chat-timeline': TimelineKey;
    }
}
/** Services required by this plugin. */
export declare const inject: string[];
/**
 * Register the timeline surface.
 * @param ctx - client root context.
 */
export declare function apply(ctx: ClientContext): void;
export type { TimelineRailProps } from './rail.tsx';
export type { TimelineKey } from './locales.ts';
export type { TimelineSource, TimelineSnapshot, TimelineState } from './source.ts';
