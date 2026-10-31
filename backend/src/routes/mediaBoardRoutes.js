import { Router } from 'express'
import {
  getMediaBoardItems,
  getMediaBoardVideo,
} from '../controllers/mediaBoardController.js'

const mediaBoardRoutes = Router()

mediaBoardRoutes.get('/items', getMediaBoardItems)
mediaBoardRoutes.get('/video/:fileName', getMediaBoardVideo)

export default mediaBoardRoutes
