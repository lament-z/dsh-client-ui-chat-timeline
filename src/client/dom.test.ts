// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { computeActiveIndex, findChatContainer, findTurnRow, jumpToTurn, landOnRow } from './dom.ts'

function buildDoc(): Document {
  // jsdom 的 document 全局共享，先清掉上一个用例挂载的容器，避免 doc 级查询串场。
  document.body.innerHTML = ''
  const container = document.createElement('div')
  container.setAttribute('data-conversation-scroll', '')
  Object.defineProperty(container, 'scrollHeight', { value: 4000, configurable: true })
  Object.defineProperty(container, 'clientHeight', { value: 600, configurable: true })
  Object.defineProperty(container, 'scrollTop', { value: 0, writable: true, configurable: true })
  const flow = document.createElement('div')
  flow.setAttribute('data-chat-flow', '')
  // 0.1.5 原生契约（dsh-client-ui-chat ChatView）：每行带 data-chat-turn
  // （轮次号）与 data-chat-anchor-key/data-chat-flow-key（节点 key，非 seq 前缀）。
  for (let turn = 1; turn <= 3; turn += 1) {
    const row = document.createElement('div')
    row.setAttribute('data-chat-turn', String(turn))
    row.setAttribute('data-chat-anchor-key', `turn${turn}:node`)
    row.setAttribute('data-chat-flow-key', `turn${turn}:node`)
    row.setAttribute('data-chat-flow-kind', 'turn-process')
    row.textContent = `q${turn - 1}`
    flow.appendChild(row)
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

describe('findTurnRow', () => {
  it('resolves the rendered row by its turn number', () => {
    const doc = buildDoc()
    expect(findTurnRow(doc, 2)?.textContent).toBe('q1')
    expect(findTurnRow(doc, 2)?.getAttribute('data-chat-turn')).toBe('2')
  })

  it('returns null for missing or invalid turns', () => {
    const doc = buildDoc()
    expect(findTurnRow(doc, 9)).toBeNull()
    expect(findTurnRow(doc, undefined)).toBeNull()
    expect(findTurnRow(doc, -1)).toBeNull()
  })
})

describe('landOnRow', () => {
  it('scrolls the row top to 24px below the scrollport top (native landOnRow)', () => {
    const doc = buildDoc()
    const container = findChatContainer(doc) as HTMLElement
    container.getBoundingClientRect = () => ({ top: 0, bottom: 600 } as DOMRect)
    const row = findTurnRow(doc, 2) as HTMLElement
    row.getBoundingClientRect = () => ({ top: 500, bottom: 510 } as DOMRect)
    expect(landOnRow(doc, row)).toBe(true)
    expect(container.scrollTop).toBe(500 - 0 - 24)
  })
})

describe('computeActiveIndex', () => {
  it('picks the last turn not exceeding the turn read at the native reading line', () => {
    const doc = buildDoc()
    const container = findChatContainer(doc) as HTMLElement
    // 阅读线 = top(0) + min(96, 600*0.2=120) = 96；turn 1 行在线上方、turn 2 在线下方
    const tops: Record<number, number> = { 1: 50, 2: 400, 3: 700 }
    for (const [turnText, top] of Object.entries(tops)) {
      const row = findTurnRow(doc, Number(turnText)) as HTMLElement
      row.getBoundingClientRect = () => ({ top, bottom: top + 10 } as DOMRect)
    }
    container.getBoundingClientRect = () => ({ top: 0, bottom: 600 } as DOMRect)
    expect(computeActiveIndex(container, doc, [1, 2, 3])).toBe(0)
  })

  it('advances the active index once the reading line crosses the next turn row', () => {
    const doc = buildDoc()
    const container = findChatContainer(doc) as HTMLElement
    const tops: Record<number, number> = { 1: -200, 2: 90, 3: 700 }
    for (const [turnText, top] of Object.entries(tops)) {
      const row = findTurnRow(doc, Number(turnText)) as HTMLElement
      row.getBoundingClientRect = () => ({ top, bottom: top + 10 } as DOMRect)
    }
    container.getBoundingClientRect = () => ({ top: 0, bottom: 600 } as DOMRect)
    expect(computeActiveIndex(container, doc, [1, 2, 3])).toBe(1)
  })

  it('the last tick wins at the scroll bottom (25px native rule)', () => {
    const doc = buildDoc()
    const container = findChatContainer(doc) as HTMLElement
    Object.defineProperty(container, 'scrollTop', { value: 3400, writable: true, configurable: true })
    container.getBoundingClientRect = () => ({ top: 0, bottom: 600 } as DOMRect)
    expect(computeActiveIndex(container, doc, [1, 2, 3])).toBe(2)
  })

  it('counts windowless earlier turns as above the viewport', () => {
    const doc = buildDoc()
    const container = findChatContainer(doc) as HTMLElement
    // turns 1/2 不在窗口里（无行），窗口从 turn 3 开始且在阅读线上方
    const row = findTurnRow(doc, 3) as HTMLElement
    row.getBoundingClientRect = () => ({ top: 200, bottom: 210 } as DOMRect)
    container.getBoundingClientRect = () => ({ top: 0, bottom: 600 } as DOMRect)
    expect(computeActiveIndex(container, doc, [1, 2, 3])).toBe(1)
  })
})

describe('jumpToTurn', () => {
  it('lands instantly when the turn row is already mounted', async () => {
    const doc = buildDoc()
    const container = findChatContainer(doc) as HTMLElement
    container.getBoundingClientRect = () => ({ top: 0, bottom: 600 } as DOMRect)
    const row = findTurnRow(doc, 3) as HTMLElement
    row.getBoundingClientRect = () => ({ top: 800, bottom: 810 } as DOMRect)
    const loadThroughCalls: number[] = []
    const landed = await jumpToTurn(doc, 2, [1, 2, 3], [10, 20, 30], async (seq) => {
      loadThroughCalls.push(seq)
    })
    expect(landed).toBe(true)
    expect(loadThroughCalls).toEqual([])
    expect(container.scrollTop).toBe(800 - 24)
  })

  it('pages through the official loadThrough and lands once the row renders', async () => {
    const doc = buildDoc()
    const container = findChatContainer(doc) as HTMLElement
    container.getBoundingClientRect = () => ({ top: 0, bottom: 600 } as DOMRect)
    // turn 1 在窗口之外：先移除它的行，模拟未翻页状态。
    doc.querySelector('[data-chat-turn="1"]')?.remove()
    const loadThroughCalls: number[] = []
    const landed = await jumpToTurn(doc, 0, [1, 2, 3], [10, 20, 30], async (seq) => {
      loadThroughCalls.push(seq)
      // 翻页完成后轮次行才挂载（模拟窗口前移）。
      const row = document.createElement('div')
      row.setAttribute('data-chat-turn', '1')
      row.getBoundingClientRect = () => ({ top: 120, bottom: 130 } as DOMRect)
      doc.querySelector('[data-chat-flow]')?.appendChild(row)
    })
    expect(landed).toBe(true)
    expect(loadThroughCalls).toEqual([10])
    expect(container.scrollTop).toBe(120 - 24)
  })

  it('returns false when the row never renders', async () => {
    const doc = buildDoc()
    const landed = await jumpToTurn(doc, 2, [1, 2, undefined], [10, 20, 30], async () => {})
    expect(landed).toBe(false)
  })
})
