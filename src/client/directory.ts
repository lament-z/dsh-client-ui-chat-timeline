/**
 * Timeline directory derivation — the pure core of the plugin.
 *
 * Turns the conversation snapshot's ordered node list into one tick per human
 * input (`user` / `steering`), each carrying a trimmed user preview plus the
 * assistant reply preview in one of three states (text / running / empty).
 * Preview budgeting replicates the ZCode TurnNavigator: at most two
 * paragraphs, whitespace-collapsed, truncated to 220 characters.
 *
 * No DOM, no React, no dsh runtime imports — everything here is plain data so
 * vitest can cover it without fixtures beyond plain objects.
 */

/** Minimal structural shape of a conversation node this module needs. */
export interface TimelineNodeLike {
  kind: string
  seq: number
  /** Unix epoch ms when present. */
  time?: number
  /** User/steering content blocks (each `{ kind, text? }`-like). */
  content?: readonly unknown[]
  /** Assistant content blocks (each `{ kind, text? }`-like). */
  blocks?: readonly unknown[]
}

/** One tick in the timeline directory. */
export interface TimelineItem {
  /** Stable React key (`n<seq>`). */
  readonly key: string
  /** Seq of the anchoring human node. */
  readonly seq: number
  /** Anchor time (epoch ms); 0 when unknown. */
  readonly time: number
  /** Trimmed human input preview. */
  readonly userPreview: string
  /** True when the human node carried no extractable text. */
  readonly userFallback: boolean
  /** Trimmed assistant reply preview. */
  readonly assistantPreview: string
  /** Which assistant preview state applies. */
  readonly assistantKind: 'text' | 'running' | 'empty'
  /** True for the last tick while the session is still running. */
  readonly running: boolean
}

/** Copy labels the derivation needs (kept out of the pure math for testability). */
export interface TimelineLabels {
  readonly userFallback: string
  readonly assistantEmpty: string
  readonly assistantRunning: string
}

/** Preview budget: at most two paragraphs and 220 characters (ZCode parity). */
export const MAX_PREVIEW_CHARS = 220
export const MAX_PREVIEW_PARAGRAPHS = 2

/** Human node kinds that anchor a tick. */
const HUMAN_KINDS = new Set(['user', 'steering'])

/** Extract concatenated text from a ContentBlock-like list.
 *  dsh-llm content blocks switch on `type`; assistant blocks use `kind` — accept both. */
export function blocksText(blocks: readonly unknown[] | undefined): string {
  if (!Array.isArray(blocks)) return ''
  const parts: string[] = []
  for (const block of blocks) {
    if (block !== null && typeof block === 'object') {
      const record = block as { kind?: unknown; type?: unknown; text?: unknown }
      if (record.kind === 'text' || record.type === 'text') {
        if (typeof record.text === 'string' && record.text.length > 0) parts.push(record.text)
      }
    }
  }
  return parts.join('\n\n')
}

/** Collapse each paragraph's whitespace and drop empties (ZCode u5e parity). */
export function collapseParagraphs(text: string, maxParagraphs: number): string[] {
  return text
    .trim()
    .split(/\n\s*\n/u)
    .map((paragraph) => paragraph.replace(/\s+/gu, ' ').trim())
    .filter(Boolean)
    .slice(0, Math.max(1, maxParagraphs))
}

/** Truncate to the budget with an ellipsis, never below the floor (ZCode d5e parity). */
export function truncatePreview(text: string, maxChars: number, floor = 8): string {
  const budget = Math.max(floor, maxChars)
  if (text.length <= budget) return text
  return `${text.slice(0, budget - 3).trimEnd()}...`
}

/** Build one preview string from raw texts under the shared budget. */
export function buildPreview(texts: readonly string[], fallback: string): string {
  const paragraphs = collapseParagraphs(texts.join('\n\n'), MAX_PREVIEW_PARAGRAPHS)
  if (paragraphs.length === 0) return fallback
  return truncatePreview(paragraphs.join('\n'), MAX_PREVIEW_CHARS)
}

/**
 * Derive the tick directory from the snapshot's ordered node list.
 * @param nodes - conversation snapshot nodes in seq order.
 * @param running - whether the session currently has a running turn.
 * @param labels - localized preview fallbacks.
 * @returns one item per human input, in order.
 */
export function buildTimelineItems(
  nodes: readonly TimelineNodeLike[],
  running: boolean,
  labels: TimelineLabels,
): TimelineItem[] {
  interface Draft {
    key: string
    seq: number
    time: number
    userTexts: string[]
    hasUserText: boolean
    assistantTexts: string[]
  }
  const drafts: Draft[] = []
  for (const node of nodes) {
    if (HUMAN_KINDS.has(node.kind)) {
      const text = blocksText(node.content)
      drafts.push({
        key: `n${node.seq}`,
        seq: node.seq,
        time: typeof node.time === 'number' ? node.time : 0,
        userTexts: text === '' ? [] : [text],
        hasUserText: text !== '',
        assistantTexts: [],
      })
      continue
    }
    if (node.kind !== 'assistant' || drafts.length === 0) continue
    const text = blocksText(node.blocks)
    if (text !== '') drafts[drafts.length - 1].assistantTexts.push(text)
  }
  const last = drafts.length - 1
  return drafts.map((draft, index) => {
    const isLive = running && index === last
    const assistantTexts = draft.assistantTexts
    const assistantKind: TimelineItem['assistantKind'] = assistantTexts.length > 0
      ? 'text'
      : isLive
        ? 'running'
        : 'empty'
    return {
      key: draft.key,
      seq: draft.seq,
      time: draft.time,
      userPreview: buildPreview(draft.userTexts, labels.userFallback),
      userFallback: !draft.hasUserText,
      assistantPreview: buildPreview(assistantTexts, isLive ? labels.assistantRunning : labels.assistantEmpty),
      assistantKind,
      running: isLive,
    }
  })
}
