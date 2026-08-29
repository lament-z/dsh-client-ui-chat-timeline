// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { computeActiveIndex, findChatContainer, findUserRows } from './dom.ts'

function buildDoc(): Document {
  const container = document.createElement('div')
  container.setAttribute('data-conversation-scroll', '')
  Object.defineProperty(container, 'scrollHeight', { value: 4000, configurable: true })
  Object.defineProperty(container, 'clientHeight', { value: 600, configurable: true })
  Object.defineProperty(container, 'scrollTop', { value: 0, configurable: true })
  const flow = document.createElement('div')
  flow.setAttribute('data-chat-flow', '')
  for (let index = 0; index < 3; index += 1) {
    const user = document.createElement('div')
    user.setAttribute('data-chat-flow-kind', 'user')
    user.textContent = `q${index}`
    flow.appendChild(user)
    const tool = document.createElement('div')
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

describe('findUserRows', () => {
  it('returns only user-kind rows in document order', () => {
    const doc = buildDoc()
    const container = findChatContainer(doc)
    const rows = findUserRows(container)
    expect(rows).toHaveLength(3)
    expect(rows.map((row) => row.textContent)).toEqual(['q0', 'q1', 'q2'])
  })
})

describe('computeActiveIndex', () => {
  it('picks the last row above the reading line', () => {
    const doc = buildDoc()
    const container = findChatContainer(doc) as HTMLElement
    const rows = findUserRows(container)
    const makeRect = (top: number) => ({ top, bottom: top + 10 } as DOMRect)
    const original = rows.map((row) => row.getBoundingClientRect.bind(row))
    rows.forEach((row, index) => {
      row.getBoundingClientRect = () => makeRect(100 + index * 300)
    })
    container.getBoundingClientRect = () => ({ top: 0, bottom: 600 } as DOMRect)
    expect(computeActiveIndex(container, rows)).toBe(0)
    rows.forEach((row, index) => {
      row.getBoundingClientRect = original[index]
    })
  })
})
