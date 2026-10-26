import { test, expect } from '@playwright/test'

test.use({ headless: true, viewport: { width: 1280, height: 1024 } })

test('ImageOrbitGallery stays error free while rotating, zooming and resetting', async ({ page }) => {
  const consoleErrors: string[] = []
  const failedRequests: string[] = []

  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })
  page.on('requestfailed', (request) => {
    if (!request.url().includes('/src/assets/music/')) failedRequests.push(request.url())
  })

  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle', timeout: 30000 })
  await page.evaluate(() => window.scrollTo(0, window.innerHeight))

  // Wait for the gallery to load and reveal.
  await page.waitForFunction(() => {
    const loading = document.querySelector('.image-orbit-loading')
    const canvas = document.querySelector('.image-orbit-stage canvas')
    return !loading && !!canvas
  }, { timeout: 30000 })

  const rotateLeft = page.locator('.image-orbit-section [aria-label="Rotate spiral left"]')
  const rotateRight = page.locator('.image-orbit-section [aria-label="Rotate spiral right"]')
  const zoomIn = page.locator('.image-orbit-section [aria-label="Zoom in"]')
  const zoomOut = page.locator('.image-orbit-section [aria-label="Zoom out"]')
  const reset = page.locator('.image-orbit-section [aria-label="Reset view"]')

  await rotateLeft.click()
  await rotateRight.click()
  await zoomIn.click()
  await zoomOut.click()
  await reset.click()

  // Let the animation loop settle after the interactions.
  await page.waitForTimeout(8000)

  expect(
    consoleErrors.filter((e) => !e.includes('WebGL context'))
  ).toEqual([])
  expect(failedRequests.length).toBe(0)

  const canvases = page.locator('canvas')
  expect(await canvases.count()).toBeGreaterThanOrEqual(2)
  const box = await canvases.nth(1).boundingBox()
  expect(box?.width).toBeGreaterThan(0)
  expect(box?.height).toBeGreaterThan(0)

  await page.screenshot({ path: '/tmp/test-interact.png', fullPage: true })
})
