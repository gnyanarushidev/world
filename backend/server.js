import dotenv from 'dotenv'
import app from './src/app.js'

dotenv.config({ path: new URL('./.env', import.meta.url) })

const port = Number(process.env.PORT ?? 3001)

app.listen(port, () => {
  console.log(`World backend listening on http://localhost:${port}`)
})