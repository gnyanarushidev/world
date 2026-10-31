import { useEffect, useRef, useState } from 'react'
import './FeatureVideo.css'

// ---------------------------------------------------------------------------
// FeatureVideo – one video given its own quiet, cinematic moment. It is always
// muted (no audio, no volume control) and loops silently while on screen;
// tapping it pauses or resumes.
// ---------------------------------------------------------------------------

const VIDEO_PATH = '/api/media-board/video/VID-20220814-WA0010.mp4'

function apiUrl(url: string): string {
  const base = import.meta.env.PUBLIC_API_URL?.replace(/\/$/, '') ?? ''
  return `${base}${url}`
}

export function FeatureVideo() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [onScreen, setOnScreen] = useState(false)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const observer = new IntersectionObserver(([entry]) => setOnScreen(entry.isIntersecting), {
      threshold: 0.35,
    })
    observer.observe(video)
    return () => observer.disconnect()
  }, [])

  // Play only while visible and not paused by the visitor.
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (onScreen && !paused && !calm) void video.play().catch(() => undefined)
    else video.pause()
  }, [onScreen, paused])

  return (
    <section className="fv-section" aria-label="A moment on video">
      <header className="fv-heading">
        <p className="fv-eyebrow">a moment, in motion</p>
      </header>

      <button
        type="button"
        className={paused ? 'fv-frame is-paused' : 'fv-frame'}
        onClick={() => setPaused((current) => !current)}
        aria-label={paused ? 'Play video' : 'Pause video'}
      >
        <video
          ref={videoRef}
          src={`${apiUrl(VIDEO_PATH)}#t=0.1`}
          muted
          loop
          playsInline
          preload="metadata"
          disablePictureInPicture
          draggable={false}
        />
        <span className="fv-glyph" aria-hidden="true">
          {paused ? '▶' : '❚❚'}
        </span>
      </button>
    </section>
  )
}
