/**
 * Locale dictionaries for the chat-timeline plugin. `zh` is the key-set source
 * of truth; `en` keeps a full key-for-key mirror. Registered through
 * ctx.locale.register(NS, { zh, en }).
 */
/** Simplified Chinese dictionary (key-set source of truth). */
export declare const zh: {
    'nav.label': string;
    'nav.jumpToQuery': string;
    'preview.userFallback': string;
    'preview.assistantEmpty': string;
    'preview.assistantRunning': string;
};
/** The chat-timeline namespace key union. */
export type TimelineKey = keyof typeof zh;
/** English dictionary, key-for-key complete against zh. */
export declare const en: Record<TimelineKey, string>;
