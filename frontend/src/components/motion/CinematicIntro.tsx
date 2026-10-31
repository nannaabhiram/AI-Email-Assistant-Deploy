import { useEffect, useRef, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { KineticText } from './KineticText'

export const INTRO_DURATION_MS = 15_000

const PRIORITY = ['#ff5a6e', '#ffb340', '#34c77b', '#5aa9ff']

/** Deterministic pseudo-random field so the fly-through is identical on every play. */
const FLY_CARDS = Array.from({ length: 14 }, (_, i) => {
  const r = (n: number) => {
    const x = Math.sin((i + 1) * 9301 + n * 49297) * 233280
    return x - Math.floor(x)
  }
  return {
    x: (r(1) - 0.5) * 130,
    y: (r(2) - 0.5) * 80,
    z: -1400 - i * 140,
    ry: (r(3) - 0.5) * 50,
    color: PRIORITY[i % PRIORITY.length]!,
  }
})

const COLUMNS = [
  { title: 'Urgent', color: '#ff5a6e', cards: 3 },
  { title: 'Reply today', color: '#ffb340', cards: 2 },
  { title: 'Later', color: '#34c77b', cards: 3 },
]

export interface CinematicIntroProps {
  onDone: () => void
}

/**
 * 15-second motion sequence: kinetic type, a 3D fly-through of mail, AI sorting,
 * a drafted reply awaiting approval and a logo morph. Pure CSS timeline; the
 * component only handles skip, pointer parallax and completion.
 */
export function CinematicIntro({ onDone }: CinematicIntroProps) {
  const root = useRef<HTMLDivElement>(null)
  const skip = useRef<HTMLButtonElement>(null)
  const doneRef = useRef(onDone)
  useEffect(() => {
    doneRef.current = onDone
  }, [onDone])

  useEffect(() => {
    const finish = () => doneRef.current()
    const timer = window.setTimeout(finish, INTRO_DURATION_MS)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish()
    }
    let frame = 0
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const el = root.current
        if (!el) return
        el.style.setProperty('--px', (e.clientX / window.innerWidth - 0.5).toFixed(3))
        el.style.setProperty('--py', (e.clientY / window.innerHeight - 0.5).toFixed(3))
      })
    }
    document.addEventListener('keydown', onKey)
    window.addEventListener('pointermove', onMove, { passive: true })
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    skip.current?.focus({ preventScroll: true })
    return () => {
      window.clearTimeout(timer)
      cancelAnimationFrame(frame)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('pointermove', onMove)
      document.body.style.overflow = overflow
    }
  }, [])

  return createPortal(
    <div ref={root} className="mpi" role="dialog" aria-modal="true" aria-label="MailPilot AI intro">
      <p className="sr-only">
        Your inbox never sleeps. MailPilot AI sorts what matters, drafts the reply and waits for your approval. Your inbox, piloted.
      </p>
      <div className="mpi-bg" aria-hidden>
        <span className="mpi-blob mpi-blob--a" />
        <span className="mpi-blob mpi-blob--b" />
        <span className="mpi-blob mpi-blob--c" />
        <span className="mpi-grain" />
      </div>

      <div className="mpi-camera" aria-hidden>
        <div className="mpi-parallax">
          <div className="mpi-world">
            {/* Scene 1: kinetic headline */}
            <section className="mpi-scene mpi-s1">
              <h2 className="mpi-title"><KineticText text="Your inbox" delay={0.3} stagger={0.06} /></h2>
              <p className="mpi-title mpi-title--accent"><KineticText text="never sleeps." delay={1.15} stagger={0.045} variant="rise" /></p>
            </section>

            {/* Scene 2: fly-through of incoming mail */}
            <section className="mpi-scene mpi-s2">
              <div className="mpi-fly">
                {FLY_CARDS.map((c, i) => (
                  <div
                    key={i}
                    className="mpi-mail"
                    style={{ transform: `translate3d(${c.x}vmin, ${c.y}vmin, ${c.z}px) rotateY(${c.ry}deg)`, '--c': c.color } as CSSProperties}
                  >
                    <span className="mpi-mail__avatar" />
                    <span className="mpi-mail__lines"><i /><i /><i /></span>
                  </div>
                ))}
              </div>
              <div className="mpi-counter">
                <span className="mpi-counter__num" />
                <span className="mpi-counter__label">unread today</span>
              </div>
            </section>

            {/* Scene 3: AI sorts into lanes */}
            <section className="mpi-scene mpi-s3">
              <p className="mpi-title mpi-title--sm"><KineticText text="AI sorts what matters." delay={6.2} stagger={0.025} variant="blur" /></p>
              <div className="mpi-lanes">
                {COLUMNS.map((col, ci) => (
                  <div key={col.title} className="mpi-lane" style={{ '--c': col.color, '--ci': ci } as CSSProperties}>
                    <span className="mpi-lane__title">{col.title}</span>
                    {Array.from({ length: col.cards }, (_, k) => (
                      <span key={k} className="mpi-chip" style={{ '--k': k } as CSSProperties}><i /><i /></span>
                    ))}
                  </div>
                ))}
              </div>
            </section>

            {/* Scene 4: drafted reply, human approval */}
            <section className="mpi-scene mpi-s4">
              <div className="mpi-draft">
                <div className="mpi-draft__head"><span className="mpi-mail__avatar" /><span>Re: Q4 review</span><b>AI draft</b></div>
                <span className="mpi-type" style={{ '--w': '92%', '--t': 0 } as CSSProperties} />
                <span className="mpi-type" style={{ '--w': '78%', '--t': 1 } as CSSProperties} />
                <span className="mpi-type" style={{ '--w': '86%', '--t': 2 } as CSSProperties} />
                <span className="mpi-type" style={{ '--w': '44%', '--t': 3 } as CSSProperties} />
                <div className="mpi-approve">
                  <span className="mpi-approve__label">Approve &amp; send</span>
                  <svg viewBox="0 0 24 24" className="mpi-approve__check"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                </div>
              </div>
              <div className="mpi-s4-copy">
                <p className="mpi-title mpi-title--sm"><KineticText text="Drafts the reply." delay={9.4} stagger={0.03} variant="rise" /></p>
                <p className="mpi-title mpi-title--sm mpi-title--accent"><KineticText text="You approve." delay={10.3} stagger={0.04} variant="rise" /></p>
              </div>
            </section>

            {/* Scene 5: logo morph */}
            <section className="mpi-scene mpi-s5">
              <div className="mpi-logo">
                <span className="mpi-orb mpi-orb--a" />
                <span className="mpi-orb mpi-orb--b" />
                <span className="mpi-orb mpi-orb--c" />
                <span className="mpi-logo__mark">MP</span>
              </div>
              <h2 className="mpi-title mpi-brand"><KineticText text="MailPilot AI" delay={13.0} stagger={0.05} variant="blur" /></h2>
              <p className="mpi-tagline"><KineticText text="Your inbox, piloted." delay={13.6} stagger={0.03} variant="rise" /></p>
            </section>
          </div>
        </div>
      </div>

      <button ref={skip} type="button" className="mpi-skip" onClick={() => doneRef.current()}>Skip intro</button>
      <div className="mpi-progress" aria-hidden><span /></div>
    </div>,
    document.body,
  )
}
