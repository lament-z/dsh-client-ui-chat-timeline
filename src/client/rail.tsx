/**
 * TimelineRail — the conversation.input.overlay entry: a left-edge tick rail
 * over the conversation, one tick per human question. Visual and interaction
 * constants replicate the ZCode TurnNavigator (see .scratch/chat-timeline/spec.md):
 * hover ripple scaleX 2.6/1.7/1.25 with opacity 1/.86/.72/.58 over 150ms,
 * 320px preview cards after a 120ms delay, prefers-reduced-motion fallback,
 * full aria labelling.
 *
 * Geometry follows the native TurnNavigator model: the vertical band
 * (--dsh-tl-band, the host's viewport-minus-composer rule) is computed in CSS
 * from the host variables that the seat inherits, so no JS measures it. Only
 * the horizontal left edge is measured — the conversation column is a grid
 * track, so it is not flush to the window edge once the right sidebar opens.
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { type TimelineItem } from './directory.ts'
import type { TimelineKey } from './locales.ts'
import { jumpToTurn, probeChatDom, type ChatDomProbe } from './dom.ts'
import { ensureStyles, removeStyles } from './styles.ts'
import type { TimelineSource } from './source.ts'

/** Component props: the locale seat, the seat's session id, and the source. */
export type TimelineRailProps = PropsLocale<'chat-timeline'> & {
  /** The session this rail belongs to (host-supplied by the seat's inject). */
  sessionId: string
  /** That session's snapshot source (built from ctx.sessions). */
  source: TimelineSource
}

/** Slot height per tick (10px pitch, ZCode parity). */
const ITEM_PITCH = 10
/** Preview-card hover delays (ms). */
const TIP_OPEN_DELAY = 120
const TIP_CLOSE_DELAY = 80

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
export function TimelineRail({ sessionId, source, t }: TimelineRailProps) {
  const state = useSyncExternalStore(source.subscribe, source.getSnapshot)
  const probe = useMemo<ChatDomProbe | null>(() => (typeof document === 'undefined' ? null : probeChatDom(document)), [])
  const [container, setContainer] = useState<HTMLElement | null>(null)
  const [navEl, setNavEl] = useState<HTMLElement | null>(null)
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
  // 原生锚点：行按 `data-chat-turn="<turn>"` 键控（dsh-client-ui-chat ChatView），
  // 跳转与高亮都按轮次号走原生逻辑；seq 仅用于 loadThrough 翻页。
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

  // Locate the chat scrollport. The seat renders as soon as the session scope
  // exists, which can be a beat before the conversation itself mounts.
  useEffect(() => {
    if (probe === null) return
    let attempts = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    const tick = () => {
      const found = probe.getContainer()
      if (found !== null || attempts >= 10) {
        setContainer(found)
        return
      }
      attempts += 1
      timer = setTimeout(tick, 300)
    }
    tick()
    return () => {
      if (timer !== undefined) clearTimeout(timer)
    }
  }, [probe, sessionId])

  // Horizontal geometry only: the rail's left edge, which is the conversation
  // column's left edge. Vertical geometry is pure CSS (styles.ts) because the
  // band variables live on the scrollport and the seat inherits them; the
  // column stays measured because it is a grid track that the right sidebar
  // shrinks, so it is not derivable from a window-edge offset.
  useEffect(() => {
    if (container === null || navEl === null) return
    const write = () => {
      navEl.style.setProperty('--dsh-tl-left', `${container.getBoundingClientRect().left}px`)
    }
    write()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(write)
    observer?.observe(container)
    window.addEventListener('resize', write)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', write)
    }
  }, [container, navEl])

  // Active-tick highlight follows the conversation's scrolling.
  useEffect(() => {
    if (container === null || probe === null) return
    const sync = () => {
      if (frame.current !== 0) return
      frame.current = requestAnimationFrame(() => {
        frame.current = 0
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
  }, [container, probe])

  // items 变化（事件窗口增长/切换会话）后重算一次 active 高亮。
  useEffect(() => {
    if (container === null || probe === null) return
    setActiveIndex(probe.activeIndex(turns))
  }, [container, probe, turns])

  // 完全模仿原生：只要会话可读就渲染——不设条数/宽度门槛，原生导航条的隐藏
  // 完全交给本插件的接管规则。
  const visible = snapshot !== null
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

  if (!visible || probe === null) return null

  const trackHeight = items.length * ITEM_PITCH
  const tip = tipIndex !== undefined ? items[tipIndex] : undefined

  return (
    <>
      <nav
        ref={setNavEl}
        aria-label={t('nav.label')}
        className="dsh-tl-nav"
        data-visible={visible ? 'true' : 'false'}
        data-testid="dsh-chat-timeline"
        data-item-count={items.length}
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
            <TipCard item={tip} index={tipIndex} nav={navEl} t={t} />,
            document.body,
          )
        : null}
    </>
  )
}

function TipCard({ item, index, nav, t }: {
  item: TimelineItem
  index: number
  nav: HTMLElement | null
  t: (key: TimelineKey, params?: Record<string, string | number>) => string
}) {
  const slot = nav?.querySelector<HTMLElement>('[data-testid="dsh-chat-timeline-item"][data-item-index="' + String(index) + '"]')
  const box = slot?.getBoundingClientRect()
  const railBox = nav?.getBoundingClientRect()
  const left = box !== undefined
    ? Math.min(box.right + 8, window.innerWidth - 336)
    : (railBox !== undefined ? railBox.right + 8 : 8)
  const top = box !== undefined ? Math.max(8, Math.min(box.top - 4, window.innerHeight - 160)) : 8
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
