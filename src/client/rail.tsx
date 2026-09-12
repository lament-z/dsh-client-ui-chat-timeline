/**
 * TimelineRail — the shell.overlay entry: a left-edge tick rail over the
 * conversation, one tick per human question. Visual and interaction constants
 * replicate the ZCode TurnNavigator (see .scratch/chat-timeline/spec.md):
 * hover ripple scaleX 2.6/1.7/1.25 with opacity 1/.86/.72/.58 over 150ms,
 * 320px preview cards after a 120ms delay, >=2 questions to render, >=864px
 * container width, prefers-reduced-motion fallback, full aria labelling.
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { type TimelineItem } from './directory.ts'
import type { TimelineKey } from './locales.ts'
import { jumpToTurn, probeChatDom, type ChatDomProbe } from './dom.ts'
import { ensureStyles, removeStyles } from './styles.ts'
import type { TimelineSource } from './source.ts'

/** Component props: the locale seat plus the injected session source. */
export type TimelineRailProps = PropsLocale<'chat-timeline'> & {
  /** The current-session snapshot source (built from ctx.sessions). */
  source: TimelineSource
}

/** Slot height per tick (10px pitch, ZCode parity). */
const ITEM_PITCH = 10
/** Preview-card hover delays (ms). */
const TIP_OPEN_DELAY = 120
const TIP_CLOSE_DELAY = 80

interface Rect {
  left: number
  top: number
  height: number
  width: number
  /** Rail band center, viewport-relative to the container top (native --turn-rail-band rule). */
  centerY: number
}

/** Default composer height when the host variable is absent (native fallback). */
const COMPOSER_HEIGHT_FALLBACK = 152

/** Ripple visual per distance from the hovered tick (ZCode _5e parity).
 *  The ripple is interaction-only: at rest every tick is idle (scaleX 1),
 *  and the current position is signalled by color/opacity, not length. */
function ripple(distance: number): { opacity: number; scaleX: number; tone: 'peak' | 'near' | 'mid' | 'idle' } {
  if (distance === 0) return { opacity: 1, scaleX: 2.6, tone: 'peak' }
  if (distance === 1) return { opacity: 0.86, scaleX: 1.7, tone: 'near' }
  if (distance === 2) return { opacity: 0.72, scaleX: 1.25, tone: 'mid' }
  return { opacity: 0.58, scaleX: 1, tone: 'idle' }
}

/** Tick colors: foreground for the hovered peak and the current turn at rest,
 *  the subtlest text tone otherwise (ZCode bg-foreground / -subtlest parity
 *  through system colors). */
const TICK_COLOR_FOREGROUND = 'CanvasText'
const TICK_COLOR_SUBTLE = 'color-mix(in srgb, CanvasText 42%, transparent)'

/**
 * Render the question navigator rail.
 * @param props - composed slot props.
 * @returns the rail, or null when it should not render.
 */
export function TimelineRail({ source, t }: TimelineRailProps) {
  const state = useSyncExternalStore(source.subscribe, source.getSnapshot)
  const probe = useMemo<ChatDomProbe | null>(() => (typeof document === 'undefined' ? null : probeChatDom(document)), [])
  const [containerVersion, setContainerVersion] = useState(0)
  const [rect, setRect] = useState<Rect | null>(null)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [hoverIndex, setHoverIndex] = useState<number | undefined>(undefined)
  const [tipIndex, setTipIndex] = useState<number | undefined>(undefined)
  const timers = useRef<{ open: number | undefined; close: number | undefined }>({ open: undefined, close: undefined })
  const frame = useRef(0)

  const snapshot = state.snapshot
  // 官方 turnOutline 数据面：source 直接产出刻度（宿主已算好全史预览）。
  const items = useMemo<TimelineItem[]>(
    () => (snapshot === null ? [] : (snapshot.items as TimelineItem[])),
    [snapshot],
  )
  const sourceRef = useRef(source)
  sourceRef.current = source
  const itemsRef = useRef<TimelineItem[]>([])
  itemsRef.current = items
  // 0.1.5 原生锚点：行按 `data-chat-turn="<turn>"` 键控（dsh-client-ui-chat
  // ChatView），跳转与高亮都按轮次号走原生逻辑；seq 仅用于 loadThrough 翻页。
  const seqs = useMemo(() => items.map((item) => item.seq), [items])
  const seqsRef = useRef<number[]>([])
  seqsRef.current = seqs
  const turns = useMemo(() => items.map((item) => item.turn), [items])
  const turnsRef = useRef<(number | undefined)[]>([])
  turnsRef.current = turns

  useEffect(() => {
    if (typeof document === 'undefined') return
    ensureStyles(document)
    // 卸载时移除样式表：隐藏原生 Turn 导航的规则随标签消失，原生立即恢复。
    return () => removeStyles(document)
  }, [])

  // Find the chat container: re-probe when the session changes and briefly
  // afterwards (the conversation mounts a beat later than the selection).
  useEffect(() => {
    if (probe === null) return
    let attempts = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    const tick = () => {
      const container = probe.getContainer()
      if (container !== null || attempts >= 10) {
        setContainerVersion((version) => version + 1)
        return
      }
      attempts += 1
      timer = setTimeout(tick, 300)
    }
    tick()
    return () => {
      if (timer !== undefined) clearTimeout(timer)
    }
  }, [probe, state.sessionId])

  // Attach scroll/size watchers to the container once found.
  useEffect(() => {
    if (probe === null || containerVersion === 0) return
    const container = probe.getContainer()
    if (container === null) {
      setRect(null)
      return
    }
    const sync = () => {
      if (frame.current !== 0) return
      frame.current = requestAnimationFrame(() => {
        frame.current = 0
        const box = container.getBoundingClientRect()
        // 原生 TurnNavigator（eGxaPq_frame）定位复刻：
        // 中心 = sticky 槽位 y + (视口高 − 输入框高) / 2，两个高度都读宿主变量。
        // 槽位即原生导航条的父元素（sticky, height 0），拿不到时退化为容器顶。
        const style = getComputedStyle(container)
        const composerHeight = Number.parseFloat(style.getPropertyValue('--dsh-composer-height')) || COMPOSER_HEIGHT_FALLBACK
        const viewportHeight = Number.parseFloat(style.getPropertyValue('--dsh-conversation-viewport-height')) || window.innerHeight
        const slot = document.querySelector('nav[aria-label="Turn navigation"]')?.parentElement
        const slotTop = slot !== null && slot !== undefined ? slot.getBoundingClientRect().top : box.top
        const bandCenter = (viewportHeight - composerHeight) / 2
        setRect({
          left: box.left,
          top: box.top,
          height: box.height,
          width: box.width,
          centerY: Math.max(0, slotTop - box.top + bandCenter),
        })
        setActiveIndex(probe.activeIndex(turnsRef.current))
      })
    }
    sync()
    container.addEventListener('scroll', sync, { passive: true })
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(sync)
    observer?.observe(container)
    window.addEventListener('resize', sync)
    return () => {
      container.removeEventListener('scroll', sync)
      observer?.disconnect()
      window.removeEventListener('resize', sync)
      if (frame.current !== 0) cancelAnimationFrame(frame.current)
      frame.current = 0
    }
  }, [probe, containerVersion])

  // items 变化（事件窗口增长/切换会话）后重算一次 active 高亮。
  useEffect(() => {
    if (probe === null || containerVersion === 0 || rect === null) return
    setActiveIndex(probe.activeIndex(turns))
  }, [probe, containerVersion, rect, turns])

  // 完全模仿原生：只要会话可读且容器在，刻度条就渲染——不设条数/宽度门槛，
  // 原生导航条的隐藏完全交给本插件的接管规则。
  const visible = snapshot !== null && rect !== null
  // The ripple follows the pointer only (ZCode v5e parity): at rest every tick
  // is equal length and the current turn stands out by color/opacity alone.
  const focusIndex = hoverIndex

  const scheduleTip = useCallback((index: number | undefined) => {
    if (timers.current.open !== undefined) window.clearTimeout(timers.current.open)
    if (timers.current.close !== undefined) window.clearTimeout(timers.current.close)
    if (index === undefined) {
      timers.current.close = window.setTimeout(() => setTipIndex(undefined), TIP_CLOSE_DELAY)
      return
    }
    timers.current.open = window.setTimeout(() => setTipIndex(index), TIP_OPEN_DELAY)
  }, [])

  useEffect(() => () => {
    if (timers.current.open !== undefined) window.clearTimeout(timers.current.open)
    if (timers.current.close !== undefined) window.clearTimeout(timers.current.close)
  }, [])

  const jump = useCallback((index: number) => {
    // 原生 navigateToTurn 流程：行已挂载直接落位；未挂载走官方 loadThrough
    // 翻页后落位。落位是瞬时滚动（原生 landOnRow 语义），无需 motion 分支。
    void jumpToTurn(
      document,
      index,
      turnsRef.current,
      seqsRef.current,
      (seq: number) => sourceRef.current?.jumpThrough(seq) ?? Promise.resolve(),
    )
  }, [])

  if (!visible || probe === null || rect === null) return null

  const trackHeight = items.length * ITEM_PITCH
  const tip = tipIndex !== undefined ? items[tipIndex] : undefined

  return (
    <>
      <nav
        aria-label={t('nav.label')}
        className="dsh-tl-nav"
        data-visible={visible ? 'true' : 'false'}
        data-testid="dsh-chat-timeline"
        data-item-count={items.length}
        style={{ left: rect.left, top: rect.top, height: rect.height, '--dsh-tl-center-y': `${rect.centerY}px` } as React.CSSProperties}
      >
        <div
          className="dsh-tl-scroll"
          onPointerLeave={() => {
            setHoverIndex(undefined)
            scheduleTip(undefined)
          }}
        >
          <div className="dsh-tl-track" style={{ height: `${trackHeight}px` }}>
            {items.map((item, index) => {
              const isActive = index === activeIndex
              const distance = focusIndex === undefined ? 3 : Math.abs(index - focusIndex)
              const look = ripple(distance)
              const activeAtRest = focusIndex === undefined && isActive
              const foreground = look.tone === 'peak' || activeAtRest
              const opacity = activeAtRest
                ? 0.9
                : item.running
                  ? Math.max(look.opacity, 0.72)
                  : look.opacity
              return (
                <div
                  key={item.key}
                  className="dsh-tl-slot"
                  style={{ transform: `translateY(${index * ITEM_PITCH}px)` }}
                  onMouseEnter={() => {
                    setHoverIndex(index)
                    scheduleTip(index)
                  }}
                  onFocus={() => {
                    setHoverIndex(index)
                    scheduleTip(index)
                  }}
                  onBlur={() => {
                    setHoverIndex(undefined)
                    scheduleTip(undefined)
                  }}
                >
                  <button
                    type="button"
                    aria-current={isActive ? 'location' : undefined}
                    aria-label={t('nav.jumpToQuery', { index: String(index + 1) })}
                    aria-posinset={index + 1}
                    aria-setsize={items.length}
                    data-testid="dsh-chat-timeline-item"
                    data-item-index={index}
                    data-active={isActive ? 'true' : 'false'}
                    data-running={item.running ? 'true' : 'false'}
                    onClick={() => jump(index)}
                    className="dsh-tl-slot-inner"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'flex-start',
                      width: '100%',
                      height: '100%',
                      padding: 0,
                      border: 0,
                      background: 'transparent',
                      cursor: 'pointer',
                    }}
                  >
                    <span
                      className="dsh-tl-tick"
                      style={{
                        opacity,
                        transform: `scaleX(${look.scaleX})`,
                        backgroundColor: foreground ? TICK_COLOR_FOREGROUND : TICK_COLOR_SUBTLE,
                      }}
                    />
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      </nav>
      {tip !== undefined && tipIndex !== undefined
        ? createPortal(
            <TipCard item={tip} index={tipIndex} rect={rect} t={t} />,
            document.body,
          )
        : null}
    </>
  )
}

function TipCard({ item, index, rect, t }: {
  item: TimelineItem
  index: number
  rect: Rect
  t: (key: TimelineKey, params?: Record<string, string | number>) => string
}) {
  const slot = document.querySelector<HTMLElement>('[data-testid="dsh-chat-timeline-item"][data-item-index="' + String(index) + '"]')
  const box = slot?.getBoundingClientRect()
  const left = box === undefined ? rect.left + 56 : Math.min(box.right + 8, window.innerWidth - 336)
  const top = box === undefined ? rect.top + 100 : Math.max(8, Math.min(box.top - 4, window.innerHeight - 160))
  return (
    <div
      className="dsh-tl-tip"
      data-testid="dsh-chat-timeline-tip"
      style={{ left, top }}
      role="tooltip"
    >
      <p className="dsh-tl-tip-user">{item.userFallback ? t('preview.userFallback') : item.userPreview}</p>
      <p className="dsh-tl-tip-assistant" data-kind={item.assistantKind}>
        {item.assistantKind === 'running'
          ? t('preview.assistantRunning')
          : item.assistantKind === 'empty'
            ? t('preview.assistantEmpty')
            : item.assistantPreview}
      </p>
    </div>
  )
}
