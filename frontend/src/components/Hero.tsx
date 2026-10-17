import { useEffect, useRef, useState } from 'react'

const heroImage = new URL('../assets/madam.png', import.meta.url).href
const heroMusic = new URL('../assets/music/bramhandamanthaa_ringtone.mp3', import.meta.url).href

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
    <section className="hero" style={{ backgroundImage: `url(${heroImage})` }} aria-label="Welcome">
      <audio
        ref={musicRef}
        src={heroMusic}
        loop
        onPause={() => setIsPlaying(false)}
        onPlay={() => setIsPlaying(true)}
      />
      <button
        className="music-toggle"
        type="button"
        onClick={toggleMusic}
        aria-label={isPlaying ? 'Pause music' : 'Resume music'}
        title={isPlaying ? 'Pause music' : 'Resume music'}
      >
        {isPlaying ? '❚❚' : '▶'}
      </button>
    </section>
  )
}
