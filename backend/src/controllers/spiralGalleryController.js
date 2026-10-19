import {
  downloadSpiralGalleryPhoto,
  listSpiralGalleryPhotos,
} from '../models/spiralGalleryModel.js'

export async function getSpiralGalleryPhotos(_request, response) {
  try {
    const { photos, nextFileName } = await listSpiralGalleryPhotos()
    response.json({ photos, nextFileName })
  } catch (error) {
    console.error('Unable to list spiral gallery photos:', error)
    response.status(500).json({ error: 'Unable to load spiral gallery photos' })
  }
}

export async function getSpiralGalleryPhoto(request, response) {
  try {
    const fileName = decodeURIComponent(request.params.fileName)
    const { contentType, body } = await downloadSpiralGalleryPhoto(fileName)

    response.setHeader('Content-Type', contentType)
    response.setHeader('Cache-Control', 'public, max-age=3600')

    if (typeof body.pipe === 'function') {
      body.pipe(response)
    } else {
      response.send(body)
    }
  } catch (error) {
    console.error('Unable to download spiral gallery photo:', error)
    response.status(error.message === 'Photo not found' ? 404 : 500).json({
      error: error.message === 'Photo not found' ? 'Photo not found' : 'Unable to load spiral gallery photo',
    })
  }
}
