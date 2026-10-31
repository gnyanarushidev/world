import express from 'express'
import spiralGalleryRoutes from './routes/spiralGalleryRoutes.js'
import imageOrbitGalleryRoutes from './routes/imageOrbitGalleryRoutes.js'
import mediaBoardRoutes from './routes/mediaBoardRoutes.js'

const app = express()
const allowedOrigins = (process.env.FRONTEND_ORIGINS ?? process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

app.use((request, response, next) => {
  const requestOrigin = request.headers.origin
  if (requestOrigin && allowedOrigins.includes(requestOrigin)) {
    response.setHeader('Access-Control-Allow-Origin', requestOrigin)
    response.setHeader('Vary', 'Origin')
  }
  response.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (request.method === 'OPTIONS') {
    response.sendStatus(204)
    return
  }
  next()
})

app.use('/api/spiral-gallery', spiralGalleryRoutes)
app.use('/api/image-orbit-gallery', imageOrbitGalleryRoutes)
app.use('/api/media-board', mediaBoardRoutes)

export default app
