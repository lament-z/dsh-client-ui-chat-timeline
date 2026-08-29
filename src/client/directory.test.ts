import { describe, expect, it } from 'vitest'
import {
  buildPreview,
  buildTimelineItems,
  blocksText,
  collapseParagraphs,
  truncatePreview,
} from './directory.ts'

const LABELS = {
  userFallback: '用户输入',
  assistantEmpty: '暂无助手正文',
  assistantRunning: '助手仍在工作',
}

function userNode(seq: number, text: string, time = 1000) {
  return { kind: 'user', seq, time, content: [{ kind: 'text', text }] }
}

function assistantNode(seq: number, texts: string[], time = 2000) {
  return { kind: 'assistant', seq, time, blocks: texts.map((text) => ({ kind: 'text', text })) }
}

describe('blocksText', () => {
  it('joins text blocks and ignores other kinds', () => {
    const blocks = [{ kind: 'text', text: 'a' }, { kind: 'tool-call', callId: 'x' }, { kind: 'text', text: 'b' }]
    expect(blocksText(blocks)).toBe('a\n\nb')
  })

  it('accepts the dsh-llm `type` discriminant for user content', () => {
    const blocks = [{ type: 'text', text: '你好' }, { type: 'image', ref: 'x' }, { type: 'text', text: '世界' }]
    expect(blocksText(blocks)).toBe('你好\n\n世界')
  })

  it('returns empty for absent or malformed blocks', () => {
    expect(blocksText(undefined)).toBe('')
    expect(blocksText([null, 42, { kind: 'text' }, { type: 'text' }])).toBe('')
  })
})

describe('preview budgeting', () => {
  it('collapses whitespace inside paragraphs and drops empties', () => {
    expect(collapseParagraphs('  a \n\n b\t c  \n\n\n', 2)).toEqual(['a', 'b c'])
  })

  it('caps the paragraph count', () => {
    expect(collapseParagraphs('a\n\nb\n\nc\n\nd', 2)).toEqual(['a', 'b'])
  })

  it('passes through short text and truncates long text with an ellipsis', () => {
    expect(truncatePreview('short', 220)).toBe('short')
    const long = 'x'.repeat(500)
    const cut = truncatePreview(long, 220)
    expect(cut).toHaveLength(220)
    expect(cut.endsWith('...')).toBe(true)
  })

  it('never returns less than the floor budget', () => {
    const cut = truncatePreview('abcdefghijk', 4)
    expect(cut).toHaveLength(8)
    expect(cut.endsWith('...')).toBe(true)
  })

  it('falls back to the label when a side has no text', () => {
    expect(buildPreview([], LABELS.userFallback)).toBe('用户输入')
  })
})

describe('buildTimelineItems', () => {
  it('produces one tick per human input with assistant previews attached', () => {
    const nodes = [
      userNode(1, '第一问'),
      assistantNode(2, ['第一答']),
      { kind: 'tool-call', seq: 3 },
      assistantNode(4, ['第一答续']),
      userNode(5, '第二问'),
      { kind: 'context', seq: 6 },
    ]
    const items = buildTimelineItems(nodes, false, LABELS)
    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({
      key: 'n1', seq: 1, userPreview: '第一问', assistantPreview: '第一答\n第一答续', assistantKind: 'text', running: false,
    })
    expect(items[1]).toMatchObject({ key: 'n5', userPreview: '第二问', assistantKind: 'empty', assistantPreview: '暂无助手正文' })
  })

  it('treats steering nodes as human ticks', () => {
    const nodes = [
      userNode(1, '主问'),
      assistantNode(2, ['答']),
      { kind: 'steering', seq: 3, content: [{ kind: 'text', text: '插一句' }] },
    ]
    const items = buildTimelineItems(nodes, false, LABELS)
    expect(items.map((item) => item.userPreview)).toEqual(['主问', '插一句'])
  })

  it('marks the last tick running while the session runs', () => {
    const nodes = [userNode(1, 'q'), assistantNode(2, ['partial']), userNode(3, 'q2')]
    const items = buildTimelineItems(nodes, true, LABELS)
    expect(items[0].running).toBe(false)
    expect(items[1].running).toBe(true)
    expect(items[1].assistantKind).toBe('running')
    expect(items[1].assistantPreview).toBe('助手仍在工作')
  })

  it('keeps the text preview on a live turn that already streamed body text', () => {
    const nodes = [userNode(1, 'q1'), assistantNode(2, ['a1']), userNode(3, 'q2'), assistantNode(4, ['a2'])]
    const items = buildTimelineItems(nodes, true, LABELS)
    expect(items[0].running).toBe(false)
    expect(items[0].assistantKind).toBe('text')
    expect(items[1].running).toBe(true)
    expect(items[1].assistantKind).toBe('text')
    expect(items[1].assistantPreview).toBe('a2')
  })

  it('returns an empty directory for conversations without human input', () => {
    expect(buildTimelineItems([{ kind: 'context', seq: 1 }], false, LABELS)).toEqual([])
    expect(buildTimelineItems([], true, LABELS)).toEqual([])
  })

  it('survives nodes without time or text payloads', () => {
    const nodes = [
      { kind: 'user', seq: 7 },
      { kind: 'assistant', seq: 8, blocks: [{ kind: 'reasoning', text: 'think' }] },
    ]
    const items = buildTimelineItems(nodes, false, LABELS)
    expect(items).toHaveLength(1)
    expect(items[0].time).toBe(0)
    expect(items[0].userFallback).toBe(true)
    expect(items[0].userPreview).toBe('用户输入')
    expect(items[0].assistantKind).toBe('empty')
  })
})
