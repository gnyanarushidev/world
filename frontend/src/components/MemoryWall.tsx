import { useCallback, useEffect, useRef, useState } from 'react'
import './MemoryWall.css'

// ---------------------------------------------------------------------------
// MemoryWall – every photo from the chinnu folder pinned up like a scrapbook:
// polaroids with tape, a slight tilt, handwritten notes and drifting hearts.
// Photos load lazily as small server-resized thumbnails; clicking one opens the
// full-size photo in a lightbox.
// ---------------------------------------------------------------------------

const NOTES = [
  'my favourite smile',
  'happy, with you',
  'pure joy',
  'best memories',
  'always like this',
]
const TAPES = ['#fbcfe8', '#fde68a', '#bfdbfe', '#c7f0d8', '#ddd6fe']
// Same width the orbit gallery requests, so the browser reuses its cached copies.
const THUMB_WIDTH = 512
const HEART_COUNT = 16

// Small deterministic hash so tilt / tape / notes are stable between renders.
function rand(seed: number): number {
  const x = Math.sin(seed * 91.7 + 17.3) * 43758.5453
  return x - Math.floor(x)
}

function apiUrl(url: string): string {
  const base = import.meta.env.PUBLIC_API_URL?.replace(/\/$/, '') ?? ''
  return url.startsWith('http') ? url : `${base}${url}`
}

function thumb(url: string): string {
  return `${url}${url.includes('?') ? '&' : '?'}w=${THUMB_WIDTH}`
}

function columnCountFor(width: number): number {
  if (width < 560) return 2
  if (width < 900) return 3
  if (width < 1300) return 4
  return 5
}

// One shared observer reveals each polaroid the first time it scrolls into view.
let revealObserver: IntersectionObserver | null = null
function reveal(element: HTMLElement | null) {
  if (!element) return
  revealObserver ??= new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        entry.target.classList.add('is-visible')
        revealObserver?.unobserve(entry.target)
      }
    },
    { rootMargin: '0px 0px -8% 0px' }
  )
  revealObserver.observe(element)
}

interface PolaroidProps {
  url: string
  index: number
  onOpen: (index: number) => void
}

function Polaroid({ url, index, onOpen }: PolaroidProps) {
  const [loaded, setLoaded] = useState(false)
  // Small resized copy first; fall back to the original if that fails to load.
  const [src, setSrc] = useState(() => thumb(url))
  const tilt = (rand(index) - 0.5) * 7
  const note = index % 3 === 1 ? NOTES[Math.floor(rand(index + 5) * NOTES.length)] : null

  return (
    <button
      type="button"
      ref={reveal}
      className="memory-polaroid"
      style={
        {
          '--tilt': `${tilt}deg`,
          '--tape': TAPES[index % TAPES.length],
          '--tape-tilt': `${(rand(index + 9) - 0.5) * 12}deg`,
        } as React.CSSProperties
      }
      onClick={() => onOpen(index)}
      aria-label={`Open photo ${index + 1}`}
    >
      <span className="memory-tape" aria-hidden="true" />
      <span className={loaded ? 'memory-photo loaded' : 'memory-photo'}>
        <img
          src={src}
          onError={() => setSrc((current) => (current === url ? current : url))}
          alt=""
          draggable={false}
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
        />
      </span>
      {note && <span className="memory-note">{note}</span>}
    </button>
  )
}

export function MemoryWall() {
  const [photos, setPhotos] = useState<string[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const [columns, setColumns] = useState(() =>
    columnCountFor(typeof window !== 'undefined' ? window.innerWidth : 1280)
  )
  const [attempt, setAttempt] = useState(0)
  const restoreFocus = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const onResize = () => setColumns(columnCountFor(window.innerWidth))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    const base = import.meta.env.PUBLIC_API_URL?.replace(/\/$/, '') ?? ''

    fetch(`${base}/api/image-orbit-gallery/photos`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`Photo API returned ${response.status}`)
        return response.json() as Promise<{ photos?: Array<{ url: string }> }>
      })
      .then((data) => {
        setPhotos(data.photos?.map((photo) => apiUrl(photo.url)) ?? [])
        setStatus('ready')
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        console.error('Unable to load memory wall photos:', error)
        setStatus('error')
      })

    return () => controller.abort()
  }, [attempt])

  const close = useCallback(() => {
    setOpenIndex(null)
    restoreFocus.current?.focus()
  }, [])
  const step = useCallback(
    (direction: -1 | 1) =>
      setOpenIndex((current) =>
        current === null ? null : (current + direction + photos.length) % photos.length
      ),
    [photos.length]
  )

  useEffect(() => {
    if (openIndex === null) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
      else if (event.key === 'ArrowLeft') step(-1)
      else if (event.key === 'ArrowRight') step(1)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [openIndex, close, step])

  const open = useCallback((index: number) => {
    restoreFocus.current = document.activeElement as HTMLElement | null
    setOpenIndex(index)
  }, [])

  // Deal photos into columns round-robin so nothing jumps while images load.
  const lanes: number[][] = Array.from({ length: columns }, () => [])
  photos.forEach((_url, index) => lanes[index % columns].push(index))

  return (
    <section className="memory-wall" aria-label="Memory wall">
      <div className="memory-hearts" aria-hidden="true">
        {Array.from({ length: HEART_COUNT }, (_, i) => (
          <span
            key={i}
            style={
              {
                left: `${(i * 100) / HEART_COUNT + rand(i) * 5}%`,
                fontSize: `${12 + rand(i + 3) * 16}px`,
                animationDuration: `${14 + rand(i + 6) * 12}s`,
                animationDelay: `${-rand(i + 11) * 24}s`,
              } as React.CSSProperties
            }
          >
            {i % 3 === 0 ? '✿' : '♥'}
          </span>
        ))}
      </div>

      <header className="memory-heading">
        <h2>Every picture, a piece of my happiness</h2>
        <p className="memory-sub">
          {status === 'ready' && photos.length > 0
            ? `${photos.length} memories, pinned up just for you`
            : 'Pinning up your memories…'}
        </p>
      </header>

      {status === 'loading' && <p className="memory-status">Gathering your memories ♥</p>}
      {status === 'error' && (
        <div className="memory-status">
          <p>The memories could not be loaded.</p>
          <button
            type="button"
            className="memory-retry"
            onClick={() => {
              setStatus('loading')
              setAttempt((current) => current + 1)
            }}
          >
            Try again
          </button>
        </div>
      )}

      <div className="memory-board">
        {lanes.map((lane, laneIndex) => (
          <div className="memory-lane" key={laneIndex}>
            {lane.map((index) => (
              <Polaroid key={photos[index]} url={photos[index]} index={index} onOpen={open} />
            ))}
          </div>
        ))}
      </div>

      {status === 'ready' && photos.length > 0 && (
        <p className="memory-finale">…and a lifetime of more to come ♥</p>
      )}

      {openIndex !== null && photos[openIndex] && (
        <div className="memory-lightbox" role="dialog" aria-modal="true" aria-label="Photo" onClick={close}>
          <button type="button" className="memory-close" onClick={close} aria-label="Close photo">
            ✕
          </button>
          <button
            type="button"
            className="memory-nav memory-prev"
            onClick={(event) => {
              event.stopPropagation()
              step(-1)
            }}
            aria-label="Previous photo"
          >
            ‹
          </button>
          <figure onClick={(event) => event.stopPropagation()}>
            <img src={photos[openIndex]} alt={`Memory ${openIndex + 1}`} draggable={false} />
            <figcaption>
              {openIndex + 1} / {photos.length}
            </figcaption>
          </figure>
          <button
            type="button"
            className="memory-nav memory-next"
            onClick={(event) => {
              event.stopPropagation()
              step(1)
            }}
            aria-label="Next photo"
          >
            ›
          </button>
        </div>
      )}
    </section>
  )
}
