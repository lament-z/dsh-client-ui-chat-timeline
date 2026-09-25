import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';
import type { TimelineSource } from './source.ts';
/** Component props: the locale seat, the seat's session id, and the source. */
export type TimelineRailProps = PropsLocale<'chat-timeline'> & {
    /** The session this rail belongs to (host-supplied by the seat's inject). */
    sessionId: string;
    /** That session's snapshot source (built from ctx.sessions). */
    source: TimelineSource;
};
/**
 * Render the question navigator rail.
 * @param props - composed slot props.
 * @returns the rail, or null when it should not render.
 */
export declare function TimelineRail({ sessionId, source, t }: TimelineRailProps): import("react").JSX.Element | null;
