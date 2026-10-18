import {
  downloadSpiralGalleryPhoto,
  listSpiralGalleryPhotos,
} from '../models/spiralGalleryModel.js'

export async function getSpiralGalleryPhotos(_request, response) {
  try {
    const photos = await listSpiralGalleryPhotos()
    response.json({ photos })
  } catch (error) {
    console.error('Unable to list spiral gallery photos:', error)
    response.status(500).json({ error: 'Unable to load spiral gallery photos' })
  }
}

export async function getSpiralGalleryPhoto(request, response) {
  try {
    const photo = await downloadSpiralGalleryPhoto(request.query.key)
    response.setHeader('Content-Type', photo.contentType)
    response.setHeader('Cache-Control', 'public, max-age=3600')
    response.send(photo.body)
  } catch (error) {
    console.error('Unable to download spiral gallery photo:', error)
    response.status(404).json({ error: 'Unable to load spiral gallery photo' })
  }
}
