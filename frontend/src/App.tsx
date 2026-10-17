import { useState } from 'react'
import { chapters, sampleMemories, type ChapterId } from './data'
import { Hero } from './components/Hero'
import { SpiralGallery } from './components/SpiralGallery'
import './App.css'

function App() {
  const [activeChapterId, setActiveChapterId] = useState<ChapterId>('welcome')
  const [selectedMemory, setSelectedMemory] = useState(sampleMemories[0])
  const chapter = chapters.find((item) => item.id === activeChapterId) ?? chapters[0]

  const goToChapter = (id: ChapterId) => setActiveChapterId(id)

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
        <div className="welcome-section">
          <Hero />
          <SpiralGallery />
        </div>
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
