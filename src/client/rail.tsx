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
import { buildTimelineItems, type TimelineItem, type TimelineLabels } from './directory.ts'
import type { TimelineKey } from './locales.ts'
import { probeChatDom, type ChatDomProbe } from './dom.ts'
import { ensureStyles } from './styles.ts'
import type { TimelineSource } from './source.ts'

/** Component props: the locale seat plus the injected session source. */
export type TimelineRailProps = PropsLocale<'chat-timeline'> & {
  /** The current-session snapshot source (built from ctx.sessions). */
  source: TimelineSource
}

/** Slot height per tick (10px pitch, ZCode parity). */
const ITEM_PITCH = 10
/** Container width below which the rail hides. ZCode uses 864px, but DSH's
 *  three-pane layout leaves the conversation narrower — the rail overlays the
 *  left edge without taking layout space, so only truly cramped panes hide. */
const MIN_CONTAINER_WIDTH = 560
/** Preview-card hover delays (ms). */
const TIP_OPEN_DELAY = 120
const TIP_CLOSE_DELAY = 80

interface Rect {
  left: number
  top: number
  height: number
  width: number
}

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

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReduced(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  return reduced
}

/**
 * Render the question navigator rail.
 * @param props - composed slot props.
 * @returns the rail, or null when it should not render.
 */
export function TimelineRail({ source, t }: TimelineRailProps) {
  const state = useSyncExternalStore(source.subscribe, source.getSnapshot)
  const reducedMotion = useReducedMotion()
  const probe = useMemo<ChatDomProbe | null>(() => (typeof document === 'undefined' ? null : probeChatDom(document)), [])
  const [containerVersion, setContainerVersion] = useState(0)
  const [rect, setRect] = useState<Rect | null>(null)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [hoverIndex, setHoverIndex] = useState<number | undefined>(undefined)
  const [tipIndex, setTipIndex] = useState<number | undefined>(undefined)
  const timers = useRef<{ open: number | undefined; close: number | undefined }>({ open: undefined, close: undefined })
  const frame = useRef(0)

  const labels: TimelineLabels = useMemo(
    () => ({
      userFallback: t('preview.userFallback'),
      assistantEmpty: t('preview.assistantEmpty'),
      assistantRunning: t('preview.assistantRunning'),
    }),
    [t],
  )

  const snapshot = state.snapshot
  const items = useMemo<TimelineItem[]>(
    () => (snapshot === null ? [] : buildTimelineItems(snapshot.nodes as never[], snapshot.running, labels)),
    [snapshot, labels],
  )

  useEffect(() => {
    if (typeof document === 'undefined') return
    ensureStyles(document)
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
        setRect({ left: box.left, top: box.top, height: box.height, width: box.width })
        setActiveIndex(probe.activeIndex())
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

  const visible = snapshot !== null && items.length >= 2 && rect !== null && rect.width >= MIN_CONTAINER_WIDTH
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
    probe?.jumpTo(index, reducedMotion ? 'auto' : 'smooth')
  }, [probe, reducedMotion])

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
        style={{ left: rect.left, top: rect.top, height: rect.height }}
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
      <p className="dsh-tl-tip-user">{item.userPreview}</p>
      <p className="dsh-tl-tip-assistant" data-kind={item.assistantKind}>{item.assistantPreview}</p>
    </div>
  )
}
