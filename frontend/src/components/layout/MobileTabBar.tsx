import { CheckSquare, Inbox, LayoutDashboard, Menu, ShieldCheck } from 'lucide-react'
import { useCallback, useLayoutEffect, useRef, useState, type PointerEvent } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router'
import { cn } from '@/lib/cn'

const TABS = [
  { to: '/dashboard', label: 'Home', icon: LayoutDashboard },
  { to: '/inbox', label: 'Inbox', icon: Inbox },
  { to: '/tasks', label: 'Tasks', icon: CheckSquare },
  { to: '/approvals', label: 'Approvals', icon: ShieldCheck },
] as const
const SLOTS = TABS.length + 1
const DRAG_THRESHOLD = 6

export interface MobileTabBarProps {
  approvals?: number
  onMore: () => void
  className?: string
}

interface Gesture {
  id: number
  startX: number
  dragging: boolean
  x: number
}

/**
 * iOS-style liquid glass tab bar. Tap a tab, or press and slide the selection lens
 * left/right and release over a tab to open it.
 */
export function MobileTabBar({ approvals = 0, onMore, className }: MobileTabBarProps) {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const bar = useRef<HTMLElement>(null)
  const gesture = useRef<Gesture | null>(null)
  const suppressClick = useRef(false)
  const [hot, setHot] = useState<number | null>(null)
  const [pressing, setPressing] = useState(false)
  const active = TABS.findIndex((t) => pathname === t.to || pathname.startsWith(`${t.to}/`))

  const metrics = useCallback(() => {
    const el = bar.current!
    const rect = el.getBoundingClientRect()
    const pad = parseFloat(getComputedStyle(el).paddingLeft) || 0
    return { rect, pad, seg: (rect.width - pad * 2) / SLOTS }
  }, [])

  const placeAt = useCallback((x: number) => bar.current?.style.setProperty('--x', `${x}px`), [])

  useLayoutEffect(() => {
    const el = bar.current
    if (!el) return
    const sync = () => {
      if (!gesture.current?.dragging && active >= 0) placeAt(metrics().seg * active)
    }
    sync()
    const ro = new ResizeObserver(sync)
    ro.observe(el)
    return () => ro.disconnect()
  }, [active, metrics, placeAt])

  const select = (index: number) => {
    if (index < TABS.length) {
      if (index !== active) navigate(TABS[index]!.to)
    } else {
      if (active >= 0) placeAt(metrics().seg * active)
      onMore()
    }
  }

  const onPointerDown = (e: PointerEvent<HTMLElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    gesture.current = { id: e.pointerId, startX: e.clientX, dragging: false, x: 0 }
    setPressing(true)
  }

  const onPointerMove = (e: PointerEvent<HTMLElement>) => {
    const g = gesture.current
    if (!g || g.id !== e.pointerId) return
    if (!g.dragging) {
      if (Math.abs(e.clientX - g.startX) < DRAG_THRESHOLD) return
      g.dragging = true
      bar.current?.setPointerCapture(e.pointerId)
      bar.current?.setAttribute('data-dragging', '')
    }
    const { rect, pad, seg } = metrics()
    g.x = Math.min(Math.max(e.clientX - rect.left - pad - seg / 2, 0), seg * (SLOTS - 1))
    placeAt(g.x)
    const next = Math.round(g.x / seg)
    if (next !== hot) {
      navigator.vibrate?.(8)
      setHot(next)
    }
  }

  const finish = (e: PointerEvent<HTMLElement>, commit: boolean) => {
    const g = gesture.current
    if (!g || g.id !== e.pointerId) return
    gesture.current = null
    setPressing(false)
    setHot(null)
    if (!g.dragging) return
    bar.current?.removeAttribute('data-dragging')
    if (bar.current?.hasPointerCapture(e.pointerId)) bar.current.releasePointerCapture(e.pointerId)
    suppressClick.current = true
    const { seg } = metrics()
    const index = Math.round(g.x / seg)
    if (!commit) {
      if (active >= 0) placeAt(seg * active)
      return
    }
    placeAt(seg * index)
    select(index)
  }

  return (
    <nav
      ref={bar}
      aria-label="Quick navigation"
      data-active={active}
      data-pressing={pressing || undefined}
      className={cn('mp-tabbar lg:hidden', className)}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => finish(e, true)}
      onPointerCancel={(e) => finish(e, false)}
      onClickCapture={(e) => {
        if (suppressClick.current) {
          suppressClick.current = false
          e.preventDefault()
          e.stopPropagation()
        }
      }}
    >
      <span className="mp-tabbar__pill" aria-hidden />
      {TABS.map(({ to, label, icon: Icon }, i) => (
        <NavLink key={to} to={to} className="mp-tabbar__item" data-hot={hot === i || undefined} draggable={false}>
          <Icon className="h-5 w-5" aria-hidden />
          <span>{label}</span>
          {to === '/approvals' && approvals > 0 && (
            <span className="mp-tabbar__badge" aria-label={`${approvals} pending`}>{approvals > 9 ? '9+' : approvals}</span>
          )}
        </NavLink>
      ))}
      <button type="button" className="mp-tabbar__item" data-hot={hot === TABS.length || undefined} onClick={onMore} aria-haspopup="dialog">
        <Menu className="h-5 w-5" aria-hidden />
        <span>More</span>
      </button>
    </nav>
  )
}
