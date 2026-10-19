import { test, expect } from '@playwright/test'

test.use({
  headless: true,
  viewport: { width: 1280, height: 1024 },
})

test('Debug ImageOrbitGallery API and rendering', async ({ page }) => {
  const apiResponses: Array<{ url: string; status: number; body: string }> = []
  const failedRequests: string[] = []

  // Capture all API responses
  page.on('response', async (response) => {
    if (response.url().includes('/api/')) {
      try {
        const body = await response.text()
        apiResponses.push({ url: response.url(), status: response.status(), body: body.substring(0, 200) })
      } catch {}
    }
  })

  page.on('requestfailed', (request) => {
    failedRequests.push(`${request.method()} ${request.url()}`)
  })

  page.on('console', (msg) => {
    if (msg.type() === 'error' && !msg.text().includes('WebGL context')) {
      console.log('CONSOLE ERROR:', msg.text())
    }
  })

  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle', timeout: 30000 })

  // Scroll down
  await page.evaluate(() => window.scrollTo(0, window.innerHeight))
  await page.waitForTimeout(15000)

  console.log('\n=== API Responses ===')
  apiResponses.forEach((r) => console.log(`  ${r.status} ${r.url}`))
  console.log(`\nTotal API responses: ${apiResponses.length}`)

  console.log('\n=== Failed Requests ===')
  failedRequests.forEach((r) => console.log(`  ${r}`))
  console.log(`Total failed: ${failedRequests.length}`)

  // Check if remoteImages were loaded by looking at canvas content
  const canvases = page.locator('canvas')
  const canvasCount = await canvases.count()
  console.log(`\nCanvas count: ${canvasCount}`)

  // Read multiple pixels from ImageOrbitGallery canvas
  const pixelCheck = await page.evaluate(async () => {
    const canvases = document.querySelectorAll('canvas')
    if (canvases.length < 2) return null
    const canvas = canvases[1]
    const gl = canvas.getContext('webgl') || canvas.getContext('webgl2')
    if (!gl) return { error: 'no webgl' }
    
    // Read a 5x5 grid
    const results: number[][] = []
    for (let py = 0; py < 5; py++) {
      const row: number[] = []
      for (let px = 0; px < 5; px++) {
        const x = (canvas.width * px) / 4
        const y = (canvas.height * py) / 4
        const pixels = new Uint8Array(4)
        gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
        row.push(pixels[3]) // alpha channel
      }
      results.push(row)
    }
    return { width: canvas.width, height: canvas.height, alphaGrid: results }
  })
  console.log('\nPixel alpha grid (ImageOrbitGallery canvas):')
  console.log(JSON.stringify(pixelCheck?.alphaGrid, null, 2))

  await page.screenshot({ path: '/tmp/test-debug.png', fullPage: true })
  console.log('\nScreenshot saved to /tmp/test-debug.png')
})
