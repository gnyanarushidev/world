import { useEffect, useRef, useState } from 'react'
import { chapters, sampleMemories, type ChapterId } from './data'
import './App.css'

const heroImage = new URL('./assets/madam.png', import.meta.url).href
const heroMusic = new URL('./assets/music/bramhandamanthaa_ringtone.mp3', import.meta.url).href

function App() {
  const [activeChapterId, setActiveChapterId] = useState<ChapterId>('welcome')
  const [selectedMemory, setSelectedMemory] = useState(sampleMemories[0])
  const [isMusicPlaying, setIsMusicPlaying] = useState(false)
  const musicRef = useRef<HTMLAudioElement>(null)
  const chapter = chapters.find((item) => item.id === activeChapterId) ?? chapters[0]

  useEffect(() => {
    if (chapter.id !== 'welcome' || !musicRef.current) return

    const music = musicRef.current
    void music.play()
      .then(() => setIsMusicPlaying(true))
      .catch(() => setIsMusicPlaying(false))
  }, [chapter.id])

  const goToChapter = (id: ChapterId) => setActiveChapterId(id)

  const toggleMusic = () => {
    const music = musicRef.current
    if (!music) return

    if (music.paused) {
      void music.play()
        .then(() => setIsMusicPlaying(true))
        .catch(() => setIsMusicPlaying(false))
    } else {
      music.pause()
      setIsMusicPlaying(false)
    }
  }

  return (
    <main className="app" style={{ '--accent': chapter.accent } as React.CSSProperties}>
      {chapter.id !== 'welcome' && (
        <>
          <div className="background-glow" />
          <header className="topbar">
            <strong>Our World</strong>
            <span>Birthday journey · {chapter.title}</span>
          </header>
        </>
      )}

      {chapter.id === 'welcome' ? (
        <section className="hero" style={{ backgroundImage: `url(${heroImage})` }} aria-label="Welcome">
          <audio
            ref={musicRef}
            src={heroMusic}
            autoPlay
            loop
            onPause={() => setIsMusicPlaying(false)}
            onPlay={() => setIsMusicPlaying(true)}
          />
          <button
            className="music-toggle"
            type="button"
            onClick={toggleMusic}
            aria-label={isMusicPlaying ? 'Pause music' : 'Resume music'}
            title={isMusicPlaying ? 'Pause music' : 'Resume music'}
          >
            {isMusicPlaying ? '❚❚' : '▶'}
          </button>
        </section>
      ) : (
        <section className="chapter">
          <p className="eyebrow">{chapter.title}</p>
          <h1>{chapter.description}</h1>
          {chapter.id === 'btech' && (
            <div className="memories">
              {sampleMemories.map((memory) => (
                <button
                  className={selectedMemory.id === memory.id ? 'memory active' : 'memory'}
                  key={memory.id}
                  onClick={() => setSelectedMemory(memory)}
                >
                  <span>{memory.label}</span>
                  <strong>{memory.title}</strong>
                </button>
              ))}
              <article className="memory-detail">
                <h2>{selectedMemory.title}</h2>
                <p>{selectedMemory.message}</p>
              </article>
            </div>
          )}
          {chapter.id === 'letter' && <p className="letter">Thank you for turning ordinary days into memories I want to keep forever. I hope your birthday feels as loved and special as you are.</p>}
          {chapter.id === 'spiral' && <p className="letter">The SOOT-inspired spiral will become our constellation of photos. Add your Google Drive memories in the next step.</p>}
          {chapter.id === 'surprise' && <p className="letter">Happy birthday, my favourite person. I love you.</p>}
        </section>
      )}

      {chapter.id !== 'welcome' && (
        <nav className="chapter-nav" aria-label="Journey chapters">
          {chapters.map((item) => (
            <button
              className={item.id === activeChapterId ? 'active' : ''}
              key={item.id}
              onClick={() => goToChapter(item.id as ChapterId)}
            >
              {item.title}
            </button>
          ))}
        </nav>
      )}
    </main>
  )
}

export default App
