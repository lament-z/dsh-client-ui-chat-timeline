// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { computeActiveIndex, findChatContainer, findSeqAnchor } from './dom.ts'

function buildDoc(): Document {
  const container = document.createElement('div')
  container.setAttribute('data-conversation-scroll', '')
  Object.defineProperty(container, 'scrollHeight', { value: 4000, configurable: true })
  Object.defineProperty(container, 'clientHeight', { value: 600, configurable: true })
  Object.defineProperty(container, 'scrollTop', { value: 0, configurable: true })
  const flow = document.createElement('div')
  flow.setAttribute('data-chat-flow', '')
  // 0.1.5 契约：flow 子元素按 `turn:N` 前缀键控，用户消息折叠进 turn 卡片，
  // 不再有独立的 `[data-chat-flow-kind="user"]` 行。
  for (let turn = 1; turn <= 3; turn += 1) {
    const anchor = document.createElement('div')
    anchor.setAttribute('data-chat-flow-key', `${turn}:turn-process0`)
    anchor.setAttribute('data-chat-flow-kind', 'turn-process')
    anchor.textContent = `q${turn - 1}`
    flow.appendChild(anchor)
    const tool = document.createElement('div')
    tool.setAttribute('data-chat-flow-key', `${turn}:tool-callcall_x`)
    tool.setAttribute('data-chat-flow-kind', 'tool-call')
    flow.appendChild(tool)
  }
  container.appendChild(flow)
  document.body.appendChild(container)
  return document
}

describe('findChatContainer', () => {
  it('prefers the stable data-conversation-scroll hook', () => {
    const doc = buildDoc()
    expect(findChatContainer(doc)).toBe(doc.querySelector('[data-conversation-scroll]'))
  })
})

describe('findSeqAnchor', () => {
  it('resolves the flow item whose key is prefixed with the turn number', () => {
    const doc = buildDoc()
    const anchor = findSeqAnchor(doc, 2)
    expect(anchor?.textContent).toBe('q1')
    expect(anchor?.getAttribute('data-chat-flow-key')).toBe('2:turn-process0')
  })

  it('returns null for missing or non-numeric turns', () => {
    const doc = buildDoc()
    expect(findSeqAnchor(doc, 9)).toBeNull()
    expect(findSeqAnchor(doc, undefined)).toBeNull()
  })
})

describe('computeActiveIndex', () => {
  it('picks the last anchor above the reading line', () => {
    const doc = buildDoc()
    const container = findChatContainer(doc) as HTMLElement
    const turns = [1, 2, 3]
    const anchors = turns.map((turn) => findSeqAnchor(doc, turn) as HTMLElement)
    const makeRect = (top: number) => ({ top, bottom: top + 10 } as DOMRect)
    const original = anchors.map((anchor) => anchor.getBoundingClientRect.bind(anchor))
    anchors.forEach((anchor, index) => {
      anchor.getBoundingClientRect = () => makeRect(100 + index * 300)
    })
    container.getBoundingClientRect = () => ({ top: 0, bottom: 600 } as DOMRect)
    expect(computeActiveIndex(container, doc, turns)).toBe(0)
    anchors.forEach((anchor, index) => {
      anchor.getBoundingClientRect = original[index]
    })
  })

  it('counts windowless earlier turns as above the viewport', () => {
    const doc = buildDoc()
    const container = findChatContainer(doc) as HTMLElement
    // turn 1/2 不在窗口里（无锚点），窗口从 turn 3 开始且贴着阅读线上方
    const anchor = findSeqAnchor(doc, 3) as HTMLElement
    anchor.getBoundingClientRect = () => ({ top: 200, bottom: 210 } as DOMRect)
    container.getBoundingClientRect = () => ({ top: 0, bottom: 600 } as DOMRect)
    expect(computeActiveIndex(container, doc, [1, 2, 3])).toBe(1)
  })
})
