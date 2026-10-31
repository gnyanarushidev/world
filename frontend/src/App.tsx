import { useEffect } from 'react'
import { Hero } from './components/Hero'
import { FeatureVideo } from './components/FeatureVideo'
import { SpiralGallery } from './components/SpiralGallery'
import { ImageOrbitGallery } from './components/ImageOrbitGallery'
import { MomentsReel } from './components/MomentsReel'
import { MemoryWall } from './components/MemoryWall'
import './App.css'

function App() {
  // Disable the browser's right-click menu and dragging images out of the page.
  useEffect(() => {
    const block = (event: Event) => event.preventDefault()
    document.addEventListener('contextmenu', block)
    document.addEventListener('dragstart', block)
    return () => {
      document.removeEventListener('contextmenu', block)
      document.removeEventListener('dragstart', block)
    }
  }, [])

  return (
    <>
      <Hero />
      <FeatureVideo />
      <SpiralGallery />
      <ImageOrbitGallery />
      <MomentsReel />
      <MemoryWall />
    </>
  )
}

export default App
