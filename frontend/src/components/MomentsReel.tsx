import { useCallback, useEffect, useRef, useState } from 'react'
import './MomentsReel.css'

// ---------------------------------------------------------------------------
// MomentsReel – a gentle slideshow of every photo and video. One moment fills
// the stage over a softly blurred copy of itself; a filmstrip below lets you
// jump anywhere. Photos drift slowly (Ken Burns), videos play muted, and the
// show advances on its own while on screen.
// ---------------------------------------------------------------------------

type Filter = 'all' | 'photo' | 'video'

interface MediaItem {
  type: 'photo' | 'video'
  key: string
  url: string
}

const PHOTO_SECONDS = 4.5
const VIDEO_MAX_SECONDS = 14
const STAGE_WIDTH = 1280
const THUMB_WIDTH = 512

function apiUrl(url: string): string {
  const base = import.meta.env.PUBLIC_API_URL?.replace(/\/$/, '') ?? ''
  return url.startsWith('http') ? url : `${base}${url}`
}

function sized(url: string, width: number): string {
  return `${url}${url.includes('?') ? '&' : '?'}w=${width}`
}

export function MomentsReel() {
  const [items, setItems] = useState<MediaItem[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [attempt, setAttempt] = useState(0)
  const [filter, setFilter] = useState<Filter>('all')
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [onScreen, setOnScreen] = useState(false)
  const sectionRef = useRef<HTMLElement>(null)
  const stripRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const controller = new AbortController()
    const base = import.meta.env.PUBLIC_API_URL?.replace(/\/$/, '') ?? ''
    fetch(`${base}/api/media-board/items`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`Media API returned ${response.status}`)
        return response.json() as Promise<{ items?: MediaItem[] }>
      })
      .then((data) => {
        setItems(data.items ?? [])
        setStatus('ready')
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        console.error('Unable to load moments:', error)
        setStatus('error')
      })
    return () => controller.abort()
  }, [attempt])

  useEffect(() => {
    const section = sectionRef.current
    if (!section) return
    const observer = new IntersectionObserver(([entry]) => setOnScreen(entry.isIntersecting), {
      threshold: 0.25,
    })
    observer.observe(section)
    return () => observer.disconnect()
  }, [])

  const photoCount = items.filter((item) => item.type === 'photo').length
  const videoCount = items.length - photoCount
  const shown = filter === 'all' ? items : items.filter((item) => item.type === filter)
  const current = shown[index]
  const calm =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const running = playing && onScreen && !calm

  const go = useCallback(
    (direction: -1 | 1) => setIndex((i) => (shown.length ? (i + direction + shown.length) % shown.length : 0)),
    [shown.length]
  )

  // Photos advance on a timer; videos advance when they end (with a safety cap).
  useEffect(() => {
    if (!running || !current) return
    const seconds = current.type === 'video' ? VIDEO_MAX_SECONDS : PHOTO_SECONDS
    const timer = window.setTimeout(() => go(1), seconds * 1000)
    return () => window.clearTimeout(timer)
  }, [running, current, go])

  // Keep the active thumbnail centred inside the strip (without scrolling the page).
  useEffect(() => {
    const strip = stripRef.current
    const active = strip?.children[index] as HTMLElement | undefined
    if (!strip || !active) return
    strip.scrollTo({
      left: active.offsetLeft - strip.clientWidth / 2 + active.clientWidth / 2,
      behavior: calm ? 'auto' : 'smooth',
    })
  }, [index, shown.length, calm])

  const chooseFilter = (next: Filter) => {
    setFilter(next)
    setIndex(0)
  }

  const filters: Array<{ id: Filter; label: string; count: number }> = [
    { id: 'all', label: 'Everything', count: items.length },
    { id: 'photo', label: 'Photos', count: photoCount },
    { id: 'video', label: 'Videos', count: videoCount },
  ]

  return (
    <section
      ref={sectionRef}
      className="mr-section"
      aria-label="Moments slideshow"
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft') go(-1)
        else if (event.key === 'ArrowRight') go(1)
      }}
    >
      <header className="mr-heading">
        <p className="mr-eyebrow">✦ moments ✦</p>
        <h2>
          Every little thing, <em>in motion</em>
        </h2>
        <p className="mr-sub">
          {status === 'ready'
            ? `${photoCount} photos and ${videoCount} videos, one after another`
            : 'Setting the stage…'}
        </p>
      </header>

      {status === 'loading' && <p className="mr-status">Setting the stage ♥</p>}
      {status === 'error' && (
        <div className="mr-status">
          <p>The moments could not be loaded.</p>
          <button
            type="button"
            className="mr-chip"
            onClick={() => {
              setStatus('loading')
              setAttempt((n) => n + 1)
            }}
          >
            Try again
          </button>
        </div>
      )}

      {status === 'ready' && current && (
        <>
          <div className="mr-filters" role="group" aria-label="Show">
            {filters.map(({ id, label, count }) => (
              <button
                key={id}
                type="button"
                className={filter === id ? 'mr-chip active' : 'mr-chip'}
                aria-pressed={filter === id}
                onClick={() => chooseFilter(id)}
              >
                {label} <span>{count}</span>
              </button>
            ))}
          </div>

          <div className="mr-stage">
            {/* Blurred copy of the current moment fills the frame behind it. */}
            {current.type === 'photo' && (
              <div
                key={`bg-${current.key}`}
                className="mr-backdrop"
                style={{ backgroundImage: `url(${apiUrl(sized(current.url, THUMB_WIDTH))})` }}
              />
            )}
            <div key={current.key} className="mr-slide">
              {current.type === 'video' ? (
                <video
                  src={apiUrl(current.url)}
                  muted
                  autoPlay={!calm}
                  playsInline
                  onEnded={() => running && go(1)}
                  onLoadedMetadata={(event) => calm && (event.currentTarget.currentTime = 0.1)}
                />
              ) : (
                <img
                  src={apiUrl(sized(current.url, STAGE_WIDTH))}
                  onError={(event) => {
                    const original = apiUrl(current.url)
                    if (event.currentTarget.src !== original) event.currentTarget.src = original
                  }}
                  alt={`Moment ${index + 1}`}
                  draggable={false}
                />
              )}
            </div>

            <button type="button" className="mr-arrow mr-prev" onClick={() => go(-1)} aria-label="Previous moment">
              ‹
            </button>
            <button type="button" className="mr-arrow mr-next" onClick={() => go(1)} aria-label="Next moment">
              ›
            </button>

            <div className="mr-bar">
              <button
                type="button"
                className="mr-play"
                onClick={() => setPlaying((p) => !p)}
                aria-label={playing ? 'Pause slideshow' : 'Play slideshow'}
              >
                {playing ? '❚❚' : '▶'}
              </button>
              <span className="mr-count">
                {String(index + 1).padStart(3, '0')} <i>/ {shown.length}</i>
              </span>
              {current.type === 'video' && <span className="mr-kind">video</span>}
              <span className="mr-progress" aria-hidden="true">
                {running && (
                  <b
                    key={current.key}
                    style={{
                      animationDuration: `${current.type === 'video' ? VIDEO_MAX_SECONDS : PHOTO_SECONDS}s`,
                    }}
                  />
                )}
              </span>
            </div>
          </div>

          <div className="mr-strip" ref={stripRef}>
            {shown.map((item, i) => (
              <button
                key={item.key}
                type="button"
                className={i === index ? 'mr-thumb active' : 'mr-thumb'}
                onClick={() => setIndex(i)}
                aria-label={`Show ${item.type} ${i + 1}`}
                aria-current={i === index}
              >
                {item.type === 'photo' ? (
                  <img
                    src={apiUrl(sized(item.url, THUMB_WIDTH))}
                    alt=""
                    draggable={false}
                    loading="lazy"
                    decoding="async"
                  />
                ) : (
                  <span className="mr-thumb-video">▶</span>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  )
}
