import { useEffect, useState } from 'react'
import './QuoteCarousel.css'

// ---------------------------------------------------------------------------
// A short, softly fading line of text that cycles through a few quotations.
// Purely decorative overlay: it never captures pointer events.
// ---------------------------------------------------------------------------
interface QuoteCarouselProps {
  quotes: string[]
  intervalMs?: number
  className?: string
}

export function QuoteCarousel({ quotes, intervalMs = 7000, className = '' }: QuoteCarouselProps) {
  const [index, setIndex] = useState(0)

  useEffect(() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduceMotion || quotes.length < 2) return
    const timer = window.setInterval(() => setIndex((current) => (current + 1) % quotes.length), intervalMs)
    return () => window.clearInterval(timer)
  }, [quotes.length, intervalMs])

  return (
    <figure className={`quote-carousel ${className}`.trim()}>
      <span className="quote-flourish" aria-hidden="true">❦</span>
      {/* key remounts the line so the fade-in replays for every quotation */}
      <blockquote key={index}>{quotes[index]}</blockquote>
    </figure>
  )
}
