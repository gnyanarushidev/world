export type Chapter = {
  id: string
  title: string
  description: string
  accent: string
  image?: string
}

export type ChapterId = Chapter['id']

export const chapters: Chapter[] = [
  {
    id: 'welcome',
    title: 'Welcome',
    description: 'A cinematic birthday introduction',
    accent: '#8b5cf6',
  },
  {
    id: 'btech',
    title: 'B.Tech Journey',
    description: 'A timeline of our college memories',
    accent: '#ec4899',
    image: 'memories/btech1.jpg',
  },
  {
    id: 'letter',
    title: 'Personal Letter',
    description: 'An emotional birthday letter',
    accent: '#f472b6',
  },
  {
    id: 'spiral',
    title: 'SOOT-Inspired Spiral',
    description: 'An interactive 3D spiral with photographs',
    accent: '#a855f7',
    image: 'memories/spiral1.jpg',
  },
  {
    id: 'surprise',
    title: 'Final Surprise',
    description: 'A birthday celebration with replay',
    accent: '#ec4899',
  },
]

export type Memory = {
  id: string
  label: string
  title: string
  message: string
  image?: string
}

export const sampleMemories: Memory[] = [
  {
    id: '1',
    label: 'First Year',
    title: 'Orientation Day',
    message: 'Our first day at college, nervous but excited about the journey ahead.',
    image: 'memories/btech1.jpg',
  },
  {
    id: '2',
    label: 'Second Year',
    title: 'Technical Fest',
    message: 'The excitement of presenting our projects and celebrating together.',
    image: 'memories/btech2.jpg',
  },
  {
    id: '3',
    label: 'Third Year',
    title: 'Late Night Study Sessions',
    message: 'Coffee-fueled coding sessions that turned into lasting friendships.',
    image: 'memories/btech3.jpg',
  },
  {
    id: '4',
    label: 'Final Year',
    title: 'Graduation',
    message: 'The bittersweet moment of saying goodbye to college life.',
    image: 'memories/btech4.jpg',
  },
]