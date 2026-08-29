import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';
import type { TimelineSource } from './source.ts';
/** Component props: the locale seat plus the injected session source. */
export type TimelineRailProps = PropsLocale<'chat-timeline'> & {
    /** The current-session snapshot source (built from ctx.sessions). */
    source: TimelineSource;
};
/**
 * Render the question navigator rail.
 * @param props - composed slot props.
 * @returns the rail, or null when it should not render.
 */
export declare function TimelineRail({ source, t }: TimelineRailProps): import("react").JSX.Element | null;
