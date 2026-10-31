import { useEffect, useRef, useState } from 'react'
import './Hero.css'

const heroImage = new URL('../assets/madam.png', import.meta.url).href
const heroMusic = new URL('../assets/music/bramhandamanthaa_ringtone.mp3', import.meta.url).href

// Soft golden / rose light orbs that drift upward behind the title. Computed
// once at module load so the component stays pure.
const BOKEH: React.CSSProperties[] = Array.from({ length: 22 }, (_, i) => {
  const r = (n: number) => {
    const x = Math.sin((i + 1) * 78.233 + n * 12.9898) * 43758.5453
    return x - Math.floor(x)
  }
  const size = 10 + r(1) * 46
  return {
    left: `${r(2) < 0.5 ? r(2) * 52 : 74 + (r(2) - 0.5) * 52}%`,
    width: size,
    height: size,
    animationDuration: `${16 + r(3) * 20}s`,
    animationDelay: `${-r(4) * 30}s`,
    background: i % 3 === 0 ? 'rgba(255, 183, 197, 0.55)' : 'rgba(255, 224, 170, 0.6)',
  }
})

// Twinkling four-point stars scattered across the upper sky.
const SPARKLES: React.CSSProperties[] = Array.from({ length: 16 }, (_, i) => {
  const r = (n: number) => {
    const x = Math.sin((i + 1) * 45.164 + n * 9.1337) * 24634.6345
    return x - Math.floor(x)
  }
  return {
    left: `${4 + r(1) * 92}%`,
    top: `${3 + r(2) * 52}%`,
    fontSize: 8 + r(3) * 14,
    animationDuration: `${2.5 + r(4) * 3}s`,
    animationDelay: `${-r(5) * 5}s`,
  }
})

export function Hero() {
  const [isPlaying, setIsPlaying] = useState(false)
  const musicRef = useRef<HTMLAudioElement>(null)
  // Tracks whether the user explicitly paused during this visit.
  // Resets on reload / re-mount so audio plays again on arrival.
  const userPausedRef = useRef(false)

  useEffect(() => {
    if (userPausedRef.current) return
    const music = musicRef.current
    if (!music) return
    void music
      .play()
      .then(() => setIsPlaying(true))
      .catch(() => setIsPlaying(false))
  }, [])

  const toggleMusic = () => {
    const music = musicRef.current
    if (!music) return

    if (music.paused) {
      userPausedRef.current = false
      void music
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => setIsPlaying(false))
    } else {
      userPausedRef.current = true
      music.pause()
      setIsPlaying(false)
    }
  }

  return (
    <section className="cinema-hero" aria-label="Welcome">
      <audio
        ref={musicRef}
        src={heroMusic}
        autoPlay
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
        onPlay={() => setIsPlaying(true)}
      />

      <div className="cinema-bg" style={{ backgroundImage: `url(${heroImage})` }} />
      <div className="cinema-shade" />

      <div className="cinema-bokeh" aria-hidden="true">
        {BOKEH.map((dot, index) => (
          <span key={index} style={dot} />
        ))}
      </div>

      <div className="cinema-sparkles" aria-hidden="true">
        {SPARKLES.map((style, index) => (
          <span key={index} style={style}>✦</span>
        ))}
      </div>

      <div className="cinema-content">
        <p className="cinema-kicker">✦✦</p>
        <h1 className="cinema-title">Happy Birthday</h1>
        <p className="cinema-name">
          <i aria-hidden="true" />
          MADAM
          <i aria-hidden="true" />
        </p>
        <blockquote className="cinema-quote">
          “You’re the person through whose eyes I’ve seen the world differently.”
        </blockquote>
      </div>

      <button
        className={isPlaying ? 'cinema-music playing' : 'cinema-music'}
        type="button"
        onClick={toggleMusic}
        aria-label={isPlaying ? 'Pause music' : 'Resume music'}
        title={isPlaying ? 'Pause music' : 'Resume music'}
      >
        {isPlaying ? (
          <span className="cinema-eq" aria-hidden="true">
            <b />
            <b />
            <b />
            <b />
          </span>
        ) : (
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path d="M8 5.5v13l11-6.5z" fill="currentColor" />
          </svg>
        )}
      </button>
    </section>
  )
}
