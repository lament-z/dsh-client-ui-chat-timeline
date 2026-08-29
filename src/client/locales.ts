/**
 * Locale dictionaries for the chat-timeline plugin. `zh` is the key-set source
 * of truth; `en` keeps a full key-for-key mirror. Registered through
 * ctx.locale.register(NS, { zh, en }).
 */

/** Simplified Chinese dictionary (key-set source of truth). */
export const zh = {
  'nav.label': '对话问题导航',
  'nav.jumpToQuery': '跳转到第 {index} 条问题',
  'preview.userFallback': '用户输入',
  'preview.assistantEmpty': '暂无助手正文',
  'preview.assistantRunning': '助手仍在工作',
}

/** The chat-timeline namespace key union. */
export type TimelineKey = keyof typeof zh

/** English dictionary, key-for-key complete against zh. */
export const en: Record<TimelineKey, string> = {
  'nav.label': 'Conversation question navigator',
  'nav.jumpToQuery': 'Jump to question {index}',
  'preview.userFallback': 'User input',
  'preview.assistantEmpty': 'No assistant text yet',
  'preview.assistantRunning': 'Assistant is still working',
}
