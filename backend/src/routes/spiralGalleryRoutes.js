import { Router } from 'express'
import {
  getSpiralGalleryPhoto,
  getSpiralGalleryPhotos,
} from '../controllers/spiralGalleryController.js'

const spiralGalleryRoutes = Router()

spiralGalleryRoutes.get('/photos', getSpiralGalleryPhotos)
spiralGalleryRoutes.get('/photo', getSpiralGalleryPhoto)

export default spiralGalleryRoutes
