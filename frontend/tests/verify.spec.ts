import { test, expect } from '@playwright/test'

test.use({ headless: true, viewport: { width: 1280, height: 1024 } })

test('ImageOrbitGallery loads real backend photos without errors', async ({ page }) => {
  const apiResponses: Array<{ url: string; status: number }> = []
  const failedRequests: string[] = []
  const photoRequests: Array<{ url: string; status: number }> = []
  const consoleErrors: string[] = []

  page.on('response', async (response) => {
    if (response.url().includes('/api/')) {
      try {
        apiResponses.push({ url: response.url(), status: response.status() })
      } catch {}
    }
  })

  page.on('requestfailed', (request) => {
    // The Hero section's autoplay music MP3 is unrelated to this gallery.
    if (request.url().includes('/src/assets/music/')) return
    failedRequests.push(`${request.method()} ${request.url()}`)
  })

  page.on('response', (response) => {
    if (response.url().includes('/api/image-orbit-gallery/photo/')) {
      photoRequests.push({ url: response.url(), status: response.status() })
    }
  })

  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })

  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle', timeout: 30000 })
  await page.evaluate(() => window.scrollTo(0, window.innerHeight))
  await page.waitForTimeout(20000)

  const canvases = page.locator('canvas')
  const canvasCount = await canvases.count()

  const boxes = []
  for (let i = 0; i < canvasCount; i++) {
    const box = await canvases.nth(i).boundingBox()
    boxes.push(box)
  }

  console.log(`\nCANVAS_COUNT=${canvasCount}`)
  console.log(`CANVAS_BOXES=${JSON.stringify(boxes)}`)
  console.log(`API_RESPONSES=${JSON.stringify(apiResponses)}`)
  console.log(`PHOTO_REQUESTS=${JSON.stringify(photoRequests)}`)
  console.log(`FAILED_REQUESTS=${JSON.stringify(failedRequests)}`)
  console.log(`CONSOLE_ERRORS=${JSON.stringify(consoleErrors)}`)

  // The ImageOrbitGallery canvas must exist (SpiralGallery canvas + ImageOrbitGallery canvas).
  expect(canvasCount).toBeGreaterThanOrEqual(2)
  // Manifest API must succeed.
  expect(apiResponses.some((r) => r.url.includes('/photos') && r.status === 200)).toBe(true)
  // Real photographs must be requested and served.
  expect(photoRequests.length).toBeGreaterThan(0)
  expect(photoRequests.every((r) => r.status === 200)).toBe(true)
  // No failed network requests and no console errors.
  expect(failedRequests.length).toBe(0)
  expect(
    consoleErrors.filter((e) => !e.includes('WebGL context'))
  ).toEqual([])

  await page.screenshot({ path: '/tmp/test-verify.png', fullPage: true })
})
